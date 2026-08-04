import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { DEFAULT_NICKNAMES, type Nicknames, type PersonId, type ScheduleEvent } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const sharedEmail = import.meta.env.VITE_SHARED_EMAIL
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey && sharedEmail)
const supabase = cloudEnabled ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true } }) : null
const STORAGE_KEY = 'between-us-events-v1'
const LOGIN_KEY = 'between-us-demo-login'
const NICKNAMES_KEY = 'between-us-nicknames-v1'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('between-us-events') : null

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

export async function loadNicknames(): Promise<Nicknames> {
  if (!cloudEnabled) return localNicknames()
  const { data, error } = await supabase!.from('couple_profiles').select('person,nickname')
  if (error) throw error
  const names = { ...DEFAULT_NICKNAMES }
  for (const row of data as Array<{ person: PersonId; nickname: string }>) names[row.person] = row.nickname || 'ta'
  return names
}

export async function saveNickname(person: PersonId, nickname: string) {
  const cleanName = nickname.trim() || 'ta'
  if (!cloudEnabled) {
    const names = localNicknames()
    names[person] = cleanName
    localStorage.setItem(NICKNAMES_KEY, JSON.stringify(names))
    channel?.postMessage('changed')
    window.dispatchEvent(new Event('between-us-changed'))
    return
  }
  const { error } = await supabase!.from('couple_profiles').upsert({ person, nickname: cleanName }, { onConflict: 'account_id,person' })
  if (error) throw error
}

export async function hasSession() {
  if (!cloudEnabled) return localStorage.getItem(LOGIN_KEY) === 'yes'
  const { data } = await supabase!.auth.getSession()
  return Boolean(data.session)
}

export async function login(password: string) {
  if (!cloudEnabled) {
    const expected = import.meta.env.VITE_DEMO_PASSWORD || 'together'
    if (password !== expected) throw new Error('共享密码不正确')
    localStorage.setItem(LOGIN_KEY, 'yes')
    return
  }
  const { error } = await supabase!.auth.signInWithPassword({ email: sharedEmail!, password })
  if (error) throw new Error('共享密码不正确，请重试')
}

export async function logout() {
  if (cloudEnabled) await supabase!.auth.signOut()
  else localStorage.removeItem(LOGIN_KEY)
}

export async function loadEvents() {
  if (!cloudEnabled) return localEvents()
  const { data, error } = await supabase!.from('schedule_events').select('*').order('created_at')
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
  const { error } = await supabase!.from('schedule_events').upsert(toDatabase(event))
  if (error) throw error
}

export async function removeEvent(id: string) {
  if (!cloudEnabled) {
    setLocalEvents(localEvents().filter((item) => item.id !== id))
    return
  }
  const { error } = await supabase!.from('schedule_events').delete().eq('id', id)
  if (error) throw error
}

export function subscribeToEvents(onChange: () => void) {
  const localHandler = () => onChange()
  channel?.addEventListener('message', localHandler)
  window.addEventListener('storage', localHandler)
  window.addEventListener('between-us-changed', localHandler)
  let realtime: RealtimeChannel | null = null
  if (cloudEnabled) {
    realtime = supabase!.channel('shared-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_profiles' }, onChange)
      .subscribe()
  }
  return () => {
    channel?.removeEventListener('message', localHandler)
    window.removeEventListener('storage', localHandler)
    window.removeEventListener('between-us-changed', localHandler)
    if (realtime) supabase!.removeChannel(realtime)
  }
}
