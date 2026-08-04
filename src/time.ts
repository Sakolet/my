import { PEOPLE, type PersonId, type ScheduleEvent } from './types'

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}:${JSON.stringify(options)}`
  if (!dateFormatterCache.has(key)) {
    dateFormatterCache.set(key, new Intl.DateTimeFormat('zh-CN', { timeZone, ...options }))
  }
  return dateFormatterCache.get(key)!
}

export function dateKeyAt(date: Date, timeZone: string) {
  const parts = formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function formatClock(date: Date, timeZone: string) {
  return formatter(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export function formatCityDate(date: Date, timeZone: string) {
  return formatter(timeZone, { month: 'short', day: 'numeric', weekday: 'short' }).format(date)
}

export function hourAt(date: Date, timeZone: string) {
  return Number(formatter(timeZone, { hour: '2-digit', hourCycle: 'h23' }).format(date))
}

export function addDays(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function differenceInDays(a: string, b: string) {
  const parse = (key: string) => {
    const [year, month, day] = key.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((parse(a) - parse(b)) / 86_400_000)
}

function zonedParts(date: Date, timeZone: string) {
  const parts = formatter(timeZone, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}

export function localDateTimeToUtc(dateKey: string, minutes: number, timeZone: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  let guess = target
  for (let index = 0; index < 3; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone)
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    guess += target - represented
  }
  return new Date(guess)
}

export function dayWindow(dateKey: string, reference: PersonId) {
  const zone = PEOPLE[reference].timezone
  return {
    start: localDateTimeToUtc(dateKey, 0, zone),
    end: localDateTimeToUtc(addDays(dateKey, 1), 0, zone),
  }
}

export interface EventOccurrence {
  event: ScheduleEvent
  start: Date
  end: Date
  occurrenceDate: string
}

export function occurrencesInWindow(event: ScheduleEvent, windowStart: Date, windowEnd: Date): EventOccurrence[] {
  const zone = PEOPLE[event.owner].timezone
  let candidate = addDays(dateKeyAt(new Date(windowStart.getTime() - 86_400_000), zone), -1)
  const last = addDays(dateKeyAt(new Date(windowEnd.getTime() + 86_400_000), zone), 1)
  const result: EventOccurrence[] = []

  while (candidate <= last) {
    const dayDifference = differenceInDays(candidate, event.localDate)
    const matches = event.repeat === 'none' ? candidate === event.localDate : dayDifference >= 0 && dayDifference % 7 === 0
    if (matches) {
      const start = localDateTimeToUtc(candidate, event.startMinutes, zone)
      const end = localDateTimeToUtc(candidate, event.endMinutes, zone)
      if (start < windowEnd && end > windowStart) result.push({ event, start, end, occurrenceDate: candidate })
    }
    candidate = addDays(candidate, 1)
  }
  return result
}

export function minutesLabel(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

export function dateTitle(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

export function formatDualRange(start: Date, end: Date) {
  return `${formatClock(start, PEOPLE.sydney.timezone)}–${formatClock(end, PEOPLE.sydney.timezone)} 悉尼 · ${formatClock(start, PEOPLE.edinburgh.timezone)}–${formatClock(end, PEOPLE.edinburgh.timezone)} 爱丁堡`
}

export function commonFreeSlots(occurrences: EventOccurrence[], windowStart: Date, windowEnd: Date) {
  type Interval = { start: Date; end: Date }
  const clip = ({ start, end }: EventOccurrence): Interval => ({
    start: new Date(Math.max(start.getTime(), windowStart.getTime())),
    end: new Date(Math.min(end.getTime(), windowEnd.getTime())),
  })
  const freeFor = (owner: PersonId) => occurrences
    .filter(({ event }) => event.owner === owner && event.status === 'free')
    .map(clip)
    .filter((slot) => slot.start < slot.end)
  const busy = occurrences.filter(({ event }) => event.status === 'busy').map(clip)

  const overlaps: Interval[] = []
  for (const sydney of freeFor('sydney')) {
    for (const edinburgh of freeFor('edinburgh')) {
      const start = new Date(Math.max(sydney.start.getTime(), edinburgh.start.getTime()))
      const end = new Date(Math.min(sydney.end.getTime(), edinburgh.end.getTime()))
      if (start < end) overlaps.push({ start, end })
    }
  }

  const unblocked = overlaps.flatMap((overlap) => {
    let pieces: Interval[] = [overlap]
    for (const block of busy) {
      pieces = pieces.flatMap((piece) => {
        if (block.end <= piece.start || block.start >= piece.end) return [piece]
        const result: Interval[] = []
        if (block.start > piece.start) result.push({ start: piece.start, end: new Date(Math.min(block.start.getTime(), piece.end.getTime())) })
        if (block.end < piece.end) result.push({ start: new Date(Math.max(block.end.getTime(), piece.start.getTime())), end: piece.end })
        return result
      })
    }
    return pieces
  }).sort((a, b) => a.start.getTime() - b.start.getTime())

  return unblocked.reduce<Interval[]>((merged, slot) => {
    const previous = merged.at(-1)
    if (previous && slot.start <= previous.end) {
      if (slot.end > previous.end) previous.end = slot.end
    } else merged.push({ ...slot })
    return merged
  }, [])
}

export function timezoneDifferenceLabel(date: Date) {
  const sydney = zonedParts(date, PEOPLE.sydney.timezone)
  const edinburgh = zonedParts(date, PEOPLE.edinburgh.timezone)
  const a = Date.UTC(sydney.year, sydney.month - 1, sydney.day, sydney.hour, sydney.minute)
  const b = Date.UTC(edinburgh.year, edinburgh.month - 1, edinburgh.day, edinburgh.hour, edinburgh.minute)
  const hours = Math.round((a - b) / 3_600_000)
  return `悉尼比爱丁堡快 ${hours} 小时`
}
