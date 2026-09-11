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

export interface CityOption {
  city: string
  cityEn: string
  timezone: string
}

export interface PersonProfile extends CityOption {
  nickname: string
}

export type Profiles = Record<PersonId, PersonProfile>

export interface Message {
  id: string
  author: PersonId
  content: string
  createdAt: string
}

export const PEOPLE: Record<PersonId, PersonConfig> = {
  sydney: { id: 'sydney', city: '悉尼', cityEn: 'SYDNEY', timezone: 'Australia/Sydney', color: '#e9915f' },
  edinburgh: { id: 'edinburgh', city: '爱丁堡', cityEn: 'EDINBURGH', timezone: 'Europe/London', color: '#7f7bb8' },
}

export const CITY_OPTIONS: CityOption[] = [
  { city: '悉尼', cityEn: 'SYDNEY', timezone: 'Australia/Sydney' },
  { city: '墨尔本', cityEn: 'MELBOURNE', timezone: 'Australia/Melbourne' },
  { city: '布里斯班', cityEn: 'BRISBANE', timezone: 'Australia/Brisbane' },
  { city: '珀斯', cityEn: 'PERTH', timezone: 'Australia/Perth' },
  { city: '奥克兰', cityEn: 'AUCKLAND', timezone: 'Pacific/Auckland' },
  { city: '爱丁堡', cityEn: 'EDINBURGH', timezone: 'Europe/London' },
  { city: '伦敦', cityEn: 'LONDON', timezone: 'Europe/London' },
  { city: '巴黎', cityEn: 'PARIS', timezone: 'Europe/Paris' },
  { city: '柏林', cityEn: 'BERLIN', timezone: 'Europe/Berlin' },
  { city: '罗马', cityEn: 'ROME', timezone: 'Europe/Rome' },
  { city: '马德里', cityEn: 'MADRID', timezone: 'Europe/Madrid' },
  { city: '阿姆斯特丹', cityEn: 'AMSTERDAM', timezone: 'Europe/Amsterdam' },
  { city: '纽约', cityEn: 'NEW YORK', timezone: 'America/New_York' },
  { city: '洛杉矶', cityEn: 'LOS ANGELES', timezone: 'America/Los_Angeles' },
  { city: '旧金山', cityEn: 'SAN FRANCISCO', timezone: 'America/Los_Angeles' },
  { city: '芝加哥', cityEn: 'CHICAGO', timezone: 'America/Chicago' },
  { city: '多伦多', cityEn: 'TORONTO', timezone: 'America/Toronto' },
  { city: '温哥华', cityEn: 'VANCOUVER', timezone: 'America/Vancouver' },
  { city: '圣保罗', cityEn: 'SÃO PAULO', timezone: 'America/Sao_Paulo' },
  { city: '墨西哥城', cityEn: 'MEXICO CITY', timezone: 'America/Mexico_City' },
  { city: '北京', cityEn: 'BEIJING', timezone: 'Asia/Shanghai' },
  { city: '上海', cityEn: 'SHANGHAI', timezone: 'Asia/Shanghai' },
  { city: '香港', cityEn: 'HONG KONG', timezone: 'Asia/Hong_Kong' },
  { city: '东京', cityEn: 'TOKYO', timezone: 'Asia/Tokyo' },
  { city: '首尔', cityEn: 'SEOUL', timezone: 'Asia/Seoul' },
  { city: '新加坡', cityEn: 'SINGAPORE', timezone: 'Asia/Singapore' },
  { city: '曼谷', cityEn: 'BANGKOK', timezone: 'Asia/Bangkok' },
  { city: '迪拜', cityEn: 'DUBAI', timezone: 'Asia/Dubai' },
  { city: '德里', cityEn: 'DELHI', timezone: 'Asia/Kolkata' },
  { city: '开罗', cityEn: 'CAIRO', timezone: 'Africa/Cairo' },
  { city: '开普敦', cityEn: 'CAPE TOWN', timezone: 'Africa/Johannesburg' },
  { city: '檀香山', cityEn: 'HONOLULU', timezone: 'Pacific/Honolulu' },
]

export const DEFAULT_PROFILES: Profiles = {
  sydney: { nickname: 'ta', ...CITY_OPTIONS[0] },
  edinburgh: { nickname: 'ta', ...CITY_OPTIONS[5] },
}

export function applyProfiles(profiles: Profiles) {
  for (const person of ['sydney', 'edinburgh'] as PersonId[]) {
    PEOPLE[person].city = profiles[person].city
    PEOPLE[person].cityEn = profiles[person].cityEn
    PEOPLE[person].timezone = profiles[person].timezone
  }
}

export type Nicknames = Record<PersonId, string>
export const DEFAULT_NICKNAMES: Nicknames = { sydney: 'ta', edinburgh: 'ta' }
