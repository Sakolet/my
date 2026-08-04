export type PersonId = 'sydney' | 'edinburgh'
export type EventStatus = 'busy' | 'free'
export type RepeatRule = 'none' | 'weekly'

export interface ScheduleEvent {
  id: string
  owner: PersonId
  title: string
  details: string
  status: EventStatus
  hidden: boolean
  localDate: string
  startMinutes: number
  endMinutes: number
  repeat: RepeatRule
  createdAt: string
}

export interface PersonConfig {
  id: PersonId
  city: string
  cityEn: string
  timezone: string
  color: string
}

export const PEOPLE: Record<PersonId, PersonConfig> = {
  sydney: { id: 'sydney', city: '悉尼', cityEn: 'SYDNEY', timezone: 'Australia/Sydney', color: '#e9915f' },
  edinburgh: { id: 'edinburgh', city: '爱丁堡', cityEn: 'EDINBURGH', timezone: 'Europe/London', color: '#7f7bb8' },
}

export type Nicknames = Record<PersonId, string>
export const DEFAULT_NICKNAMES: Nicknames = { sydney: 'ta', edinburgh: 'ta' }
