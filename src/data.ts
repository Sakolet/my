import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { DEFAULT_NICKNAMES, DEFAULT_PROFILES, type Message, type Nicknames, type PersonId, type PersonProfile, type Profiles, type ScheduleEvent } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey)
const supabase = cloudEnabled ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true } }) : null
const STORAGE_KEY = 'between-us-events-v1'
const LOGIN_KEY = 'between-us-demo-login'
const LOCAL_PASSWORD_KEY = 'between-us-demo-password'
const ROOM_KEY = 'between-us-room-key-v1'
const NICKNAMES_KEY = 'between-us-nicknames-v1'
const PROFILES_KEY = 'between-us-profiles-v1'
const MESSAGES_KEY = 'between-us-messages-v1'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('between-us-events') : null

async function passwordKey(password: string) {
  const bytes = new TextEncoder().encode(password.normalize('NFKC'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function activeRoomKey() {
  const key = localStorage.getItem(ROOM_KEY)
  if (!key) throw new Error('尚未进入共享空间')
  return key
}

async function ensureCloudIdentity() {
  const { data } = await supabase!.auth.getSession()
  if (data.session) return
  const { error } = await supabase!.auth.signInAnonymously()
  if (error) throw new Error('无法建立设备身份，请确认已在 Supabase 开启匿名登录')
}

async function enterCloudRoom(password: string, create: boolean) {
  await ensureCloudIdentity()
  const roomKey = await passwordKey(password)
  const { error } = await supabase!.rpc('enter_room', { p_room_key: roomKey, p_create: create })
  if (error) {
    if (error.message.includes('room_exists')) throw new Error('这个共享密码已经注册，请选择“加入空间”')
    if (error.message.includes('room_not_found')) throw new Error('没有找到这个共享空间，请检查密码或先创建空间')
    throw new Error('无法进入共享空间，请检查数据库配置')
  }
  localStorage.setItem(ROOM_KEY, roomKey)
}

type DatabaseEvent = {
  id: string
  owner: ScheduleEvent['owner']
  title: string
  details: string
  status: ScheduleEvent['status']
  hidden: boolean
  local_date: string
  start_minutes: number
  end_minutes: number
  repeat_rule: ScheduleEvent['repeat']
  created_at: string
}

const fromDatabase = (row: DatabaseEvent): ScheduleEvent => ({
  id: row.id, owner: row.owner, title: row.title, details: row.details, status: row.status,
  hidden: row.hidden, localDate: row.local_date, startMinutes: row.start_minutes,
  endMinutes: row.end_minutes, repeat: row.repeat_rule, createdAt: row.created_at,
})

const toDatabase = (event: ScheduleEvent) => ({
  id: event.id, owner: event.owner, title: event.title, details: event.details,
  status: event.status, hidden: event.hidden, local_date: event.localDate,
  start_minutes: event.startMinutes, end_minutes: event.endMinutes,
  repeat_rule: event.repeat, created_at: event.createdAt,
})

function localEvents(): ScheduleEvent[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ScheduleEvent[] } catch { return [] }
}

function setLocalEvents(events: ScheduleEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  channel?.postMessage('changed')
  window.dispatchEvent(new Event('between-us-changed'))
}

function localNicknames(): Nicknames {
  try { return { ...DEFAULT_NICKNAMES, ...JSON.parse(localStorage.getItem(NICKNAMES_KEY) ?? '{}') } } catch { return { ...DEFAULT_NICKNAMES } }
}

function localProfiles(): Profiles {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}') as Partial<Profiles>
    const legacyNames = localNicknames()
    return {
      sydney: { ...DEFAULT_PROFILES.sydney, nickname: legacyNames.sydney, ...saved.sydney },
      edinburgh: { ...DEFAULT_PROFILES.edinburgh, nickname: legacyNames.edinburgh, ...saved.edinburgh },
    }
  } catch { return structuredClone(DEFAULT_PROFILES) }
}

export async function loadProfiles(): Promise<Profiles> {
  if (!cloudEnabled) return localProfiles()
  const { data, error } = await supabase!.from('couple_profiles').select('person,nickname,city,city_en,timezone').eq('room_key', activeRoomKey())
  if (error) throw error
  const profiles = structuredClone(DEFAULT_PROFILES)
  for (const row of data as Array<{ person: PersonId; nickname: string; city: string | null; city_en: string | null; timezone: string | null }>) {
    profiles[row.person] = {
      nickname: row.nickname || 'ta',
      city: row.city || profiles[row.person].city,
      cityEn: row.city_en || profiles[row.person].cityEn,
      timezone: row.timezone || profiles[row.person].timezone,
    }
  }
  return profiles
}

export async function saveProfile(person: PersonId, profile: PersonProfile) {
  const cleanProfile = { ...profile, nickname: profile.nickname.trim() || 'ta' }
  if (!cloudEnabled) {
    const profiles = localProfiles()
    profiles[person] = cleanProfile
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
    localStorage.setItem(NICKNAMES_KEY, JSON.stringify({ sydney: profiles.sydney.nickname, edinburgh: profiles.edinburgh.nickname }))
    channel?.postMessage('changed')
    window.dispatchEvent(new Event('between-us-changed'))
    return
  }
  const { error } = await supabase!.from('couple_profiles').upsert({
    room_key: activeRoomKey(), person, nickname: cleanProfile.nickname, city: cleanProfile.city,
    city_en: cleanProfile.cityEn, timezone: cleanProfile.timezone, updated_at: new Date().toISOString(),
  }, { onConflict: 'room_key,person' })
  if (error) throw error
}

export async function loadNicknames(): Promise<Nicknames> {
  const profiles = await loadProfiles()
  return { sydney: profiles.sydney.nickname, edinburgh: profiles.edinburgh.nickname }
}

export async function saveNickname(person: PersonId, nickname: string) {
  const profiles = await loadProfiles()
  await saveProfile(person, { ...profiles[person], nickname })
}

export async function hasSession() {
  if (!cloudEnabled) return localStorage.getItem(LOGIN_KEY) === 'yes'
  const { data } = await supabase!.auth.getSession()
  return Boolean(data.session && localStorage.getItem(ROOM_KEY))
}

export async function login(password: string) {
  if (!cloudEnabled) {
    const expected = localStorage.getItem(LOCAL_PASSWORD_KEY) || import.meta.env.VITE_DEMO_PASSWORD || 'together'
    if (password !== expected) throw new Error('共享密码不正确')
    localStorage.setItem(LOGIN_KEY, 'yes')
    return
  }
  await enterCloudRoom(password, false)
}

export async function register(password: string) {
  if (!cloudEnabled) {
    localStorage.setItem(LOCAL_PASSWORD_KEY, password)
    localStorage.setItem(LOGIN_KEY, 'yes')
    return { needsConfirmation: false }
  }
  await enterCloudRoom(password, true)
  return { needsConfirmation: false }
}

export async function logout() {
  localStorage.removeItem(ROOM_KEY)
  // Keep the anonymous device identity. The app-level logout only leaves the
  // active room, so the same device can join again without creating a new
  // Supabase user (or hitting anonymous sign-in rate limits).
  if (!cloudEnabled) localStorage.removeItem(LOGIN_KEY)
}

export async function loadEvents() {
  if (!cloudEnabled) return localEvents()
  const { data, error } = await supabase!.from('schedule_events').select('*').eq('room_key', activeRoomKey()).order('created_at')
  if (error) throw error
  return (data as DatabaseEvent[]).map(fromDatabase)
}

export async function saveEvent(event: ScheduleEvent) {
  if (!cloudEnabled) {
    const events = localEvents()
    const index = events.findIndex((item) => item.id === event.id)
    if (index >= 0) events[index] = event
    else events.push(event)
    setLocalEvents(events)
    return
  }
  const { error } = await supabase!.from('schedule_events').upsert({ ...toDatabase(event), room_key: activeRoomKey() })
  if (error) throw error
}

export async function removeEvent(id: string) {
  if (!cloudEnabled) {
    setLocalEvents(localEvents().filter((item) => item.id !== id))
    return
  }
  const { error } = await supabase!.from('schedule_events').delete().eq('room_key', activeRoomKey()).eq('id', id)
  if (error) throw error
}

function localMessages(): Message[] {
  try { return JSON.parse(localStorage.getItem(MESSAGES_KEY) ?? '[]') as Message[] } catch { return [] }
}

function setLocalMessages(messages: Message[]) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
  channel?.postMessage('changed')
  window.dispatchEvent(new Event('between-us-changed'))
}

export async function loadMessages(): Promise<Message[]> {
  if (!cloudEnabled) return localMessages()
  const { data, error } = await supabase!.from('messages').select('id,author,content,created_at').eq('room_key', activeRoomKey()).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return (data as Array<{ id: string; author: PersonId; content: string; created_at: string }>).map((row) => ({ id: row.id, author: row.author, content: row.content, createdAt: row.created_at }))
}

export async function saveMessage(message: Message) {
  if (!cloudEnabled) {
    setLocalMessages([message, ...localMessages()].slice(0, 30))
    return
  }
  const { error } = await supabase!.from('messages').insert({ room_key: activeRoomKey(), id: message.id, author: message.author, content: message.content, created_at: message.createdAt })
  if (error) throw error
}

export async function removeMessage(id: string) {
  if (!cloudEnabled) {
    setLocalMessages(localMessages().filter((message) => message.id !== id))
    return
  }
  const { error } = await supabase!.from('messages').delete().eq('room_key', activeRoomKey()).eq('id', id)
  if (error) throw error
}

export function subscribeToEvents(onChange: () => void) {
  const localHandler = () => onChange()
  channel?.addEventListener('message', localHandler)
  window.addEventListener('storage', localHandler)
  window.addEventListener('between-us-changed', localHandler)
  let realtime: RealtimeChannel | null = null
  if (cloudEnabled) {
    const filter = `room_key=eq.${activeRoomKey()}`
    realtime = supabase!.channel('shared-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_profiles', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, onChange)
      .subscribe()
  }
  return () => {
    channel?.removeEventListener('message', localHandler)
    window.removeEventListener('storage', localHandler)
    window.removeEventListener('between-us-changed', localHandler)
    if (realtime) supabase!.removeChannel(realtime)
  }
}
