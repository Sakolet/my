-- 在 Supabase Dashboard → SQL Editor 中运行一次。
create extension if not exists pgcrypto;

create table if not exists public.couple_profiles (
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person text not null check (person in ('sydney', 'edinburgh')),
  nickname text not null default 'ta' check (char_length(nickname) between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (account_id, person)
);

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
end $$;
