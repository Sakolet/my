-- 在 Supabase Dashboard → SQL Editor 中运行一次。
create extension if not exists pgcrypto;

-- 共享密码不会明文入库；前端将其转换为 64 位 SHA-256 房间键。
create table if not exists public.rooms (
  room_key text primary key check (room_key ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_key text not null references public.rooms(room_key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_key, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
revoke all on public.rooms, public.room_members from anon, authenticated;

create table if not exists public.couple_profiles (
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person text not null check (person in ('sydney', 'edinburgh')),
  nickname text not null default 'ta' check (char_length(nickname) between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (account_id, person)
);

alter table public.couple_profiles add column if not exists city text;
alter table public.couple_profiles add column if not exists city_en text;
alter table public.couple_profiles add column if not exists timezone text;
alter table public.couple_profiles add column if not exists room_key text references public.rooms(room_key) on delete cascade;
do $$ begin
  alter table public.couple_profiles add constraint couple_profiles_room_person_key unique (room_key, person);
exception when duplicate_object then null;
end $$;

alter table public.couple_profiles enable row level security;

drop policy if exists "shared account can read its profiles" on public.couple_profiles;
create policy "shared account can read its profiles"
on public.couple_profiles for select to authenticated
using (auth.uid() = account_id);

drop policy if exists "shared account can add its profiles" on public.couple_profiles;
create policy "shared account can add its profiles"
on public.couple_profiles for insert to authenticated
with check (auth.uid() = account_id);

drop policy if exists "shared account can update its profiles" on public.couple_profiles;
create policy "shared account can update its profiles"
on public.couple_profiles for update to authenticated
using (auth.uid() = account_id)
with check (auth.uid() = account_id);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner text not null check (owner in ('sydney', 'edinburgh')),
  title text not null default '',
  details text not null default '',
  status text not null check (status in ('busy', 'free')),
  hidden boolean not null default false,
  local_date date not null,
  start_minutes integer not null check (start_minutes >= 0 and start_minutes < 1440),
  end_minutes integer not null check (end_minutes > 0 and end_minutes <= 2880),
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'weekly')),
  created_at timestamptz not null default now(),
  constraint valid_event_time check (end_minutes > start_minutes and end_minutes <= start_minutes + 1440)
);

-- 兼容已运行过旧版脚本的项目：将结束时间范围扩展到次日。
alter table public.schedule_events drop constraint if exists schedule_events_end_minutes_check;
alter table public.schedule_events drop constraint if exists valid_event_time;
alter table public.schedule_events add constraint schedule_events_end_minutes_check check (end_minutes > 0 and end_minutes <= 2880);
alter table public.schedule_events add constraint valid_event_time check (end_minutes > start_minutes and end_minutes <= start_minutes + 1440);
alter table public.schedule_events add column if not exists room_key text references public.rooms(room_key) on delete cascade;

alter table public.schedule_events enable row level security;

drop policy if exists "shared account can read its events" on public.schedule_events;
create policy "shared account can read its events"
on public.schedule_events for select
to authenticated
using (auth.uid() = account_id);

drop policy if exists "shared account can add its events" on public.schedule_events;
create policy "shared account can add its events"
on public.schedule_events for insert
to authenticated
with check (auth.uid() = account_id);

drop policy if exists "shared account can update its events" on public.schedule_events;
create policy "shared account can update its events"
on public.schedule_events for update
to authenticated
using (auth.uid() = account_id)
with check (auth.uid() = account_id);

drop policy if exists "shared account can delete its events" on public.schedule_events;
create policy "shared account can delete its events"
on public.schedule_events for delete
to authenticated
using (auth.uid() = account_id);

alter table public.schedule_events replica identity full;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author text not null check (author in ('sydney', 'edinburgh')),
  content text not null check (char_length(content) between 1 and 180),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "shared account can read its messages" on public.messages;
create policy "shared account can read its messages" on public.messages
for select to authenticated using (auth.uid() = account_id);

drop policy if exists "shared account can add its messages" on public.messages;
create policy "shared account can add its messages" on public.messages
for insert to authenticated with check (auth.uid() = account_id);

drop policy if exists "shared account can delete its messages" on public.messages;
create policy "shared account can delete its messages" on public.messages
for delete to authenticated using (auth.uid() = account_id);

alter table public.messages replica identity full;
alter table public.messages add column if not exists room_key text references public.rooms(room_key) on delete cascade;

create or replace function public.is_room_member(p_room_key text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_key = p_room_key and user_id = (select auth.uid())
  );
$$;

create or replace function public.enter_room(p_room_key text, p_create boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;
  if p_room_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_room_key';
  end if;

  if p_create then
    insert into public.rooms (room_key, created_by)
    values (p_room_key, (select auth.uid()))
    on conflict do nothing;
    if not found then raise exception 'room_exists'; end if;
  elsif not exists (select 1 from public.rooms where room_key = p_room_key) then
    raise exception 'room_not_found';
  end if;

  insert into public.room_members (room_key, user_id)
  values (p_room_key, (select auth.uid()))
  on conflict do nothing;

  -- 第一次创建房间时，自动接管旧版单账号产生的数据。
  if p_create then
    update public.couple_profiles set room_key = p_room_key where room_key is null;
    update public.schedule_events set room_key = p_room_key where room_key is null;
    update public.messages set room_key = p_room_key where room_key is null;
  end if;
  return p_room_key;
end;
$$;

revoke execute on function public.is_room_member(text) from public, anon;
revoke execute on function public.enter_room(text, boolean) from public, anon;
grant execute on function public.is_room_member(text) to authenticated;
grant execute on function public.enter_room(text, boolean) to authenticated;

-- 用房间成员关系替换旧版 account_id 访问策略。
drop policy if exists "shared account can read its profiles" on public.couple_profiles;
drop policy if exists "shared account can add its profiles" on public.couple_profiles;
drop policy if exists "shared account can update its profiles" on public.couple_profiles;
drop policy if exists "room members can read profiles" on public.couple_profiles;
drop policy if exists "room members can add profiles" on public.couple_profiles;
drop policy if exists "room members can update profiles" on public.couple_profiles;
create policy "room members can read profiles" on public.couple_profiles for select to authenticated using ((select public.is_room_member(couple_profiles.room_key)));
create policy "room members can add profiles" on public.couple_profiles for insert to authenticated with check ((select public.is_room_member(couple_profiles.room_key)));
create policy "room members can update profiles" on public.couple_profiles for update to authenticated using ((select public.is_room_member(couple_profiles.room_key))) with check ((select public.is_room_member(couple_profiles.room_key)));

drop policy if exists "shared account can read its events" on public.schedule_events;
drop policy if exists "shared account can add its events" on public.schedule_events;
drop policy if exists "shared account can update its events" on public.schedule_events;
drop policy if exists "shared account can delete its events" on public.schedule_events;
drop policy if exists "room members can read events" on public.schedule_events;
drop policy if exists "room members can add events" on public.schedule_events;
drop policy if exists "room members can update events" on public.schedule_events;
drop policy if exists "room members can delete events" on public.schedule_events;
create policy "room members can read events" on public.schedule_events for select to authenticated using ((select public.is_room_member(schedule_events.room_key)));
create policy "room members can add events" on public.schedule_events for insert to authenticated with check ((select public.is_room_member(schedule_events.room_key)));
create policy "room members can update events" on public.schedule_events for update to authenticated using ((select public.is_room_member(schedule_events.room_key))) with check ((select public.is_room_member(schedule_events.room_key)));
create policy "room members can delete events" on public.schedule_events for delete to authenticated using ((select public.is_room_member(schedule_events.room_key)));

drop policy if exists "shared account can read its messages" on public.messages;
drop policy if exists "shared account can add its messages" on public.messages;
drop policy if exists "shared account can delete its messages" on public.messages;
drop policy if exists "room members can read messages" on public.messages;
drop policy if exists "room members can add messages" on public.messages;
drop policy if exists "room members can delete messages" on public.messages;
create policy "room members can read messages" on public.messages for select to authenticated using ((select public.is_room_member(messages.room_key)));
create policy "room members can add messages" on public.messages for insert to authenticated with check ((select public.is_room_member(messages.room_key)));
create policy "room members can delete messages" on public.messages for delete to authenticated using ((select public.is_room_member(messages.room_key)));

grant select, insert, update on public.couple_profiles to authenticated;
grant select, insert, update, delete on public.schedule_events to authenticated;
grant select, insert, delete on public.messages to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_events'
  ) then
    alter publication supabase_realtime add table public.schedule_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_profiles'
  ) then
    alter publication supabase_realtime add table public.couple_profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
