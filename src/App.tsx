import { useEffect, useMemo, useRef, useState } from 'react'
import { cloudEnabled, hasSession, loadEvents, loadMessages, loadProfiles, login, logout, register, removeEvent, removeMessage, saveEvent, saveMessage, saveProfile, subscribeToEvents } from './data'
import {
  addDays, commonFreeSlots, dateKeyAt, dateTitle, dayWindow, differenceInDays, formatCityDate, formatClock,
  formatDualRange, hourAt, localDateTimeToUtc, minutesLabel, occurrencesInWindow, timezoneDifferenceLabel, type Language,
} from './time'
import { applyProfiles, CITY_OPTIONS, DEFAULT_PROFILES, PEOPLE, type Message, type Nicknames, type PersonId, type PersonProfile, type Profiles, type ScheduleEvent } from './types'

const PROFILE_KEY = 'between-us-profile'
const LANGUAGE_KEY = 'between-us-language'
function tx<T>(language: Language, english: T, chinese: T): T { return language === 'en' ? english : chinese }
const cityLabel = (person: PersonId, language: Language) => language === 'en' ? PEOPLE[person].cityEn : PEOPLE[person].city
function localizeError(reason: unknown, language: Language, fallbackEnglish: string, fallbackChinese: string) {
  if (!(reason instanceof Error)) return tx(language, fallbackEnglish, fallbackChinese)
  if (language === 'zh') return reason.message
  const known: Record<string, string> = {
    '尚未进入共享空间': 'You have not entered a shared space yet.',
    '无法建立设备身份，请确认已在 Supabase 开启匿名登录': 'Could not create a device identity. Please enable anonymous sign-ins in Supabase.',
    '这个共享密码已经注册，请选择“加入空间”': 'This shared password is already registered. Choose “Join space” instead.',
    '没有找到这个共享空间，请检查密码或先创建空间': 'Shared space not found. Check the password or create the space first.',
    '无法进入共享空间，请检查数据库配置': 'Could not enter the shared space. Please check the database setup.',
    '共享密码不正确': 'Incorrect shared password.',
  }
  return known[reason.message] ?? fallbackEnglish
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return <div className="language-toggle" role="group" aria-label={tx(language, 'Language', '语言')}>
    <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => onChange('en')}>EN</button>
    <button type="button" className={language === 'zh' ? 'active' : ''} onClick={() => onChange('zh')}>中</button>
  </div>
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function ClockCard({ person, now, language }: { person: PersonId; now: Date; language: Language }) {
  const config = PEOPLE[person]
  const hour = hourAt(now, config.timezone)
  const isDay = hour >= 7 && hour < 19
  return (
    <article className={`clock-card ${person}`}>
      <div className="clock-orb" aria-hidden="true"><span>{isDay ? '☀' : '☾'}</span></div>
      <div>
        <p className="eyebrow">{config.cityEn}</p>
        <h2>{formatClock(now, config.timezone)}</h2>
        <p>{formatCityDate(now, config.timezone, language)} · {isDay ? tx(language, 'Daytime', '白天') : tx(language, 'Night', '夜晚')}</p>
      </div>
      <span className="city-name">{cityLabel(person, language)}</span>
    </article>
  )
}

function LoginScreen({ language, onLanguageChange, onDone }: { language: Language; onLanguageChange: (language: Language) => void; onDone: (identity: PersonId, profile: PersonProfile) => void }) {
  const [identity, setIdentity] = useState<PersonId>((localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney')
  const [nickname, setNickname] = useState(() => localStorage.getItem(`between-us-nickname-${identity}`) || 'ta')
  const [cityName, setCityName] = useState(identity === 'sydney' ? DEFAULT_PROFILES.sydney.city : DEFAULT_PROFILES.edinburgh.city)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'join' | 'register'>('join')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (mode === 'register' && password !== confirmPassword) {
      setError(tx(language, 'The passwords do not match.', '两次输入的共享密码不一致'))
      return
    }
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') {
        await register(password)
      } else await login(password)
      const city = CITY_OPTIONS.find((option) => option.city === cityName) ?? CITY_OPTIONS[0]
      const profile = { ...city, nickname: nickname.trim() || 'ta' }
      await saveProfile(identity, profile)
      localStorage.setItem(PROFILE_KEY, identity)
      localStorage.setItem(`between-us-nickname-${identity}`, nickname.trim() || 'ta')
      onDone(identity, profile)
    } catch (reason) {
      setError(localizeError(reason, language, 'Unable to enter right now. Please try again.', '暂时无法进入，请稍后重试'))
    } finally { setBusy(false) }
  }

  return (
    <main className="login-page">
      <div className="login-language"><LanguageToggle language={language} onChange={onLanguageChange} /></div>
      <section className="login-visual">
        <div className="brand-mark large"><span /><span /></div>
        <p className="eyebrow">ANY CITY · ONE TIMELINE</p>
        <h1>{tx(language, <>Far apart,<br />still sharing time.</>, <>相隔很远，<br />时间仍在一起。</>)}</h1>
        <p className="login-copy">{tx(language, 'Bring two cities and two lives onto one timeline.', '把两座城市的日常，放进同一条时间线。')}</p>
        <div className="route-line"><i>{tx(language, 'YOU', '你')}</i><b /><i>TA</i></div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="auth-tabs"><button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>{tx(language, 'Join space', '加入空间')}</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>{tx(language, 'Create space', '创建空间')}</button></div>
          <p className="eyebrow">WELCOME HOME</p>
          <h2>{mode === 'join' ? tx(language, 'Back to your shared time', '回到你们的时间') : tx(language, 'Create a space for two', '创建一个双人空间')}</h2>
          <div className="identity-grid">
            {(['sydney', 'edinburgh'] as PersonId[]).map((person) => (
              <button className={`identity-card ${identity === person ? 'selected' : ''}`} type="button" key={person} onClick={() => { setIdentity(person); setNickname(localStorage.getItem(`between-us-nickname-${person}`) || 'ta'); setCityName(person === 'sydney' ? DEFAULT_PROFILES.sydney.city : DEFAULT_PROFILES.edinburgh.city) }}>
                <span className={`avatar ${person}`}>{person === 'sydney' ? 'A' : 'B'}</span>
                <strong>{tx(language, 'Member', '成员')} {person === 'sydney' ? 'A' : 'B'}</strong><small>{tx(language, 'Choose your side', '选择你的身份位置')}</small>
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="nickname">{tx(language, 'Your nickname', '你的昵称')}</label>
          <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="ta" maxLength={20} />
          <label className="field-label" htmlFor="city">{tx(language, 'Your city', '你的城市')}</label>
          <select id="city" value={cityName} onChange={(event) => setCityName(event.target.value)}>{CITY_OPTIONS.map((city) => <option key={`${city.city}-${city.timezone}`} value={city.city}>{language === 'en' ? `${city.cityEn} · ${city.city}` : `${city.city} · ${city.cityEn}`}</option>)}</select>
          <label className="field-label" htmlFor="password">{tx(language, 'Shared password', '共享密码')}</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? tx(language, 'Set a shared password (8+ characters)', '设置至少 8 位共享密码') : tx(language, 'Enter your shared password', '输入你们的共享密码')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required />
          {mode === 'register' && <><label className="field-label" htmlFor="confirm-password">{tx(language, 'Confirm shared password', '再次输入共享密码')}</label><input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={tx(language, 'Enter it again', '确认共享密码')} autoComplete="new-password" minLength={8} required /></>}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? tx(language, 'Just a moment…', '请稍候…') : mode === 'register' ? tx(language, 'Register & create space', '注册并创建空间') : tx(language, 'Enter our time', '进入我们的时间')}</button>
        </form>
      </section>
    </main>
  )
}

function Calendar({ selected, reference, events, names, language, onSelect }: { selected: string; reference: PersonId; events: ScheduleEvent[]; names: Nicknames; language: Language; onSelect: (day: string) => void }) {
  const [visibleMonth, setVisibleMonth] = useState(selected.slice(0, 7))
  useEffect(() => setVisibleMonth(selected.slice(0, 7)), [selected])
  const [year, month] = visibleMonth.split('-').map(Number)
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const today = dateKeyAt(new Date(), PEOPLE[reference].timezone)
  const cells = Array.from({ length: 42 }, (_, index) => index - firstWeekday + 1)

  function moveMonth(delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1))
    setVisibleMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  function markers(dayKey: string) {
    const window = dayWindow(dayKey, reference)
    const owners = new Set(events.flatMap((item) => occurrencesInWindow(item, window.start, window.end).map((occurrence) => occurrence.event.owner)))
    return owners
  }

  return (
    <section className="calendar-card card">
      <header className="section-header">
        <div><p className="eyebrow">SHARED CALENDAR</p><h3>{language === 'en' ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1))) : `${year}年 ${month}月`}</h3></div>
        <div className="icon-buttons"><button onClick={() => moveMonth(-1)} aria-label={tx(language, 'Previous month', '上个月')}>←</button><button onClick={() => moveMonth(1)} aria-label={tx(language, 'Next month', '下个月')}>→</button></div>
      </header>
      <div className="weekdays">{(language === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['一', '二', '三', '四', '五', '六', '日']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (day < 1 || day > daysInMonth) return <span className="calendar-empty" key={index} />
          const key = `${visibleMonth}-${String(day).padStart(2, '0')}`
          const dots = markers(key)
          return (
            <button key={key} onClick={() => onSelect(key)} className={`${selected === key ? 'selected' : ''} ${today === key ? 'today' : ''}`}>
              <span>{day}</span><i>{dots.has('sydney') && <b className="dot sydney" />}{dots.has('edinburgh') && <b className="dot edinburgh" />}</i>
            </button>
          )
        })}
      </div>
      <footer className="calendar-legend"><span><b className="dot sydney" /> {names.sydney} · {cityLabel('sydney', language)}</span><span><b className="dot edinburgh" /> {names.edinburgh} · {cityLabel('edinburgh', language)}</span></footer>
    </section>
  )
}

function EventModal({ initial, identity, names, selectedDate, reference, language, onClose, onSaved, onDeleted }: {
  initial: ScheduleEvent | null; identity: PersonId; selectedDate: string; reference: PersonId;
  names: Nicknames; language: Language;
  onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const viewWindow = dayWindow(selectedDate, reference)
  const defaultDate = identity === reference ? selectedDate : dateKeyAt(new Date((viewWindow.start.getTime() + viewWindow.end.getTime()) / 2), PEOPLE[identity].timezone)
  const [owner, setOwner] = useState<PersonId>(initial?.owner ?? identity)
  const [status, setStatus] = useState<ScheduleEvent['status']>(initial?.status ?? 'busy')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [details, setDetails] = useState(initial?.details ?? '')
  const [date, setDate] = useState(initial?.localDate ?? defaultDate)
  const [start, setStart] = useState(minutesLabel(initial?.startMinutes ?? 18 * 60))
  const [end, setEnd] = useState(minutesLabel(initial?.endMinutes ?? 19 * 60))
  const [repeat, setRepeat] = useState<ScheduleEvent['repeat']>(initial?.repeat ?? 'none')
  const [hidden, setHidden] = useState(initial?.hidden ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const startMinutes = parseTime(start)
    const rawEndMinutes = parseTime(end)
    if (rawEndMinutes === startMinutes) { setError(tx(language, 'Start and end times cannot be the same.', '开始和结束时间不能相同')); return }
    const endMinutes = rawEndMinutes < startMinutes ? rawEndMinutes + 1440 : rawEndMinutes
    setSaving(true)
    try {
      await saveEvent({
        id: initial?.id ?? uid(), owner, status, title: title.trim(), details: details.trim(), hidden,
        localDate: date, startMinutes, endMinutes, repeat, createdAt: initial?.createdAt ?? new Date().toISOString(),
      })
      onSaved()
    } catch { setError(tx(language, 'Could not save. Check your connection and try again.', '保存失败，请检查网络后重试')) } finally { setSaving(false) }
  }

  async function remove() {
    if (!initial || !window.confirm(tx(language, 'Delete this plan?', '确定删除这项行程吗？'))) return
    setSaving(true)
    try { await removeEvent(initial.id); onDeleted() } catch { setError(tx(language, 'Could not delete. Please try again.', '删除失败，请稍后重试')); setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="event-modal" onSubmit={submit}>
        <header><div><p className="eyebrow">{initial ? 'EDIT PLAN' : 'NEW PLAN'}</p><h2>{initial ? tx(language, 'Edit plan', '编辑行程') : tx(language, 'Add a time block', '添加一段时间')}</h2></div><button type="button" className="close-button" aria-label={tx(language, 'Close', '关闭')} onClick={onClose}>×</button></header>
        <div className="segmented two">
          {(['sydney', 'edinburgh'] as PersonId[]).map((person) => <button type="button" className={owner === person ? 'active' : ''} onClick={() => setOwner(person)} key={person}>{names[person]} · {cityLabel(person, language)}</button>)}
        </div>
        <div className="segmented two status-select">
          <button type="button" className={status === 'busy' ? 'active busy' : ''} onClick={() => setStatus('busy')}>{tx(language, 'Busy', '忙碌')}</button>
          <button type="button" className={status === 'free' ? 'active free' : ''} onClick={() => setStatus('free')}>{tx(language, 'Free', '空闲')}</button>
        </div>
        <label>{tx(language, 'Title (optional)', '标题（可选）')}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={status === 'busy' ? tx(language, 'e.g. Class', '例如：上课') : tx(language, 'e.g. Free for a call', '例如：可以视频')} /></label>
        <div className="form-row three">
          <label>{tx(language, 'Local date', '当地日期')}<span className="native-date-control"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></span></label>
          <label>{tx(language, 'Start', '开始')}<span className="native-date-control"><input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></span></label>
          <label>{tx(language, 'End (can cross midnight)', '结束（可跨次日）')}<span className="native-date-control"><input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></span><small className="field-help">{tx(language, 'An earlier time means the next day', '早于开始时间时按次日计算')}</small></label>
        </div>
        <label>{tx(language, 'Details (optional)', '具体信息（可选）')}<textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder={tx(language, 'Location, notes, or something to share…', '地点、备注或想告诉对方的话…')} rows={3} /></label>
        <div className="form-row two"><label>{tx(language, 'Repeat', '重复')}<select value={repeat} onChange={(event) => setRepeat(event.target.value as ScheduleEvent['repeat'])}><option value="none">{tx(language, 'Does not repeat', '不重复')}</option><option value="weekly">{tx(language, 'Weekly', '每周重复')}</option></select></label><label className="check-label"><input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} /><span><strong>{tx(language, 'Hide details', '隐藏具体信息')}</strong><small>{tx(language, `Timeline only shows “${status === 'busy' ? 'Busy' : 'Free'}”`, `时间轴仅显示“${status === 'busy' ? '忙碌' : '空闲'}”`)}</small></span></label></div>
        {error && <p className="form-error">{error}</p>}
        <footer>{initial && <button type="button" className="delete-button" onClick={remove}>{tx(language, 'Delete', '删除')}</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>{tx(language, 'Cancel', '取消')}</button><button className="primary-button compact" disabled={saving}>{saving ? tx(language, 'Saving…', '保存中…') : tx(language, 'Save plan', '保存行程')}</button></footer>
      </form>
    </div>
  )
}

function DayTimeline({ selectedDate, reference, names, events, language, onEdit, onMove }: {
  selectedDate: string; reference: PersonId; names: Nicknames; events: ScheduleEvent[];
  language: Language;
  onEdit: (event: ScheduleEvent) => void; onMove: (event: ScheduleEvent) => void;
}) {
  type DragPreview = { key: string; top: number; height: number; owner: PersonId; event: ScheduleEvent; displayDate: string; start: Date; end: Date; moved: boolean }
  type ResizeEdge = 'start' | 'end'
  type ResizePreview = { key: string; top: number; height: number; edge: ResizeEdge; event: ScheduleEvent; start: Date; end: Date; moved: boolean }
  type ResizeOrigin = {
    key: string; edge: ResizeEdge; event: ScheduleEvent; occurrenceDate: string; start: Date; end: Date;
    originalTop: number; originalHeight: number; x: number; y: number; active: boolean; timer: number | null;
  }
  const viewWindow = dayWindow(selectedDate, reference)
  const duration = viewWindow.end.getTime() - viewWindow.start.getTime()
  const occurrences = useMemo(() => events.flatMap((event) => occurrencesInWindow(event, viewWindow.start, viewWindow.end)), [events, viewWindow.start.getTime(), viewWindow.end.getTime()])
  const hours = Math.round(duration / 3_600_000)
  const trackHeight = hours * 46
  const markers = Array.from({ length: hours + 1 }, (_, index) => new Date(viewWindow.start.getTime() + index * 3_600_000)).filter((_, index) => index % 2 === 0 || index === hours)
  const timelineRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ key: string; event: ScheduleEvent; occurrenceDate: string; height: number; grabOffset: number; x: number; y: number } | null>(null)
  const dragRef = useRef<DragPreview | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<DragPreview | null>(null)
  const resizeOrigin = useRef<ResizeOrigin | null>(null)
  const resizeRef = useRef<ResizePreview | null>(null)
  const [resize, setResize] = useState<ResizePreview | null>(null)

  function beginDrag(pointer: React.PointerEvent<HTMLButtonElement>, key: string, event: ScheduleEvent, occurrenceDate: string, top: number, height: number, start: Date, end: Date) {
    if (pointer.button !== 0 || !timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    dragOrigin.current = { key, event, occurrenceDate, height, grabOffset: pointer.clientY - rect.top - top, x: pointer.clientX, y: pointer.clientY }
    const preview = { key, top, height, owner: event.owner, event, displayDate: occurrenceDate, start, end, moved: false }
    dragRef.current = preview
    setDrag(preview)
  }

  function moveDrag(pointer: React.PointerEvent<HTMLButtonElement>) {
    const origin = dragOrigin.current
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!origin || !rect) return
    pointer.preventDefault()
    const moved = Math.hypot(pointer.clientX - origin.x, pointer.clientY - origin.y) > 3
    const owner: PersonId = pointer.clientX < rect.left + rect.width / 2 ? 'sydney' : 'edinburgh'
    const eventMinutes = origin.event.endMinutes - origin.event.startMinutes
    const maxTop = trackHeight - Math.min(origin.height, 28)
    const logicalTop = Math.max(-trackHeight, Math.min(trackHeight * 2, pointer.clientY - rect.top - origin.grabOffset))
    const rawInstant = viewWindow.start.getTime() + (logicalTop / trackHeight) * duration
    const snappedInstant = new Date(Math.round(rawInstant / (15 * 60_000)) * 15 * 60_000)
    const zone = PEOPLE[owner].timezone
    const localDate = dateKeyAt(snappedInstant, zone)
    const localStart = parseTime(formatClock(snappedInstant, zone))
    const startMinutes = Math.max(0, Math.min(1439, localStart))
    const start = localDateTimeToUtc(localDate, startMinutes, zone)
    const end = localDateTimeToUtc(localDate, startMinutes + eventMinutes, zone)
    const top = Math.max(0, Math.min(maxTop, ((start.getTime() - viewWindow.start.getTime()) / duration) * trackHeight))
    const elapsedWeeks = origin.event.repeat === 'weekly' ? Math.max(0, Math.floor(differenceInDays(origin.occurrenceDate, origin.event.localDate) / 7)) : 0
    const anchorDate = origin.event.repeat === 'weekly' ? addDays(localDate, -elapsedWeeks * 7) : localDate
    const updatedEvent = { ...origin.event, owner, localDate: anchorDate, startMinutes, endMinutes: startMinutes + eventMinutes }
    const preview = { key: origin.key, top, height: origin.height, owner, event: updatedEvent, displayDate: localDate, start, end, moved }
    dragRef.current = preview
    setDrag(preview)
  }

  function endDrag(pointer: React.PointerEvent<HTMLButtonElement>) {
    const preview = dragRef.current
    if (pointer.currentTarget.hasPointerCapture(pointer.pointerId)) pointer.currentTarget.releasePointerCapture(pointer.pointerId)
    if (preview?.moved) {
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 100)
      onMove(preview.event)
    }
    dragOrigin.current = null
    dragRef.current = null
    setDrag(null)
  }

  function cancelDrag() {
    dragOrigin.current = null
    dragRef.current = null
    setDrag(null)
  }

  function activateResize(origin: ResizeOrigin) {
    origin.active = true
    const preview = {
      key: origin.key, top: origin.originalTop, height: origin.originalHeight, edge: origin.edge,
      event: origin.event, start: origin.start, end: origin.end, moved: false,
    }
    resizeRef.current = preview
    setResize(preview)
    if (navigator.vibrate) navigator.vibrate(18)
  }

  function beginResize(pointer: React.PointerEvent<HTMLSpanElement>, key: string, edge: ResizeEdge, event: ScheduleEvent, occurrenceDate: string, top: number, height: number, start: Date, end: Date) {
    pointer.stopPropagation()
    pointer.preventDefault()
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    const origin: ResizeOrigin = { key, edge, event, occurrenceDate, start, end, originalTop: top, originalHeight: height, x: pointer.clientX, y: pointer.clientY, active: false, timer: null }
    resizeOrigin.current = origin
    if (pointer.pointerType === 'touch') origin.timer = window.setTimeout(() => activateResize(origin), 420)
    else activateResize(origin)
  }

  function moveResize(pointer: React.PointerEvent<HTMLSpanElement>) {
    pointer.stopPropagation()
    pointer.preventDefault()
    const origin = resizeOrigin.current
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!origin || !rect) return
    if (!origin.active) {
      if (Math.hypot(pointer.clientX - origin.x, pointer.clientY - origin.y) > 8 && origin.timer !== null) {
        window.clearTimeout(origin.timer)
        origin.timer = null
      }
      return
    }

    const logicalTop = Math.max(-trackHeight, Math.min(trackHeight * 2, pointer.clientY - rect.top))
    const rawInstant = viewWindow.start.getTime() + (logicalTop / trackHeight) * duration
    const snappedInstant = new Date(Math.round(rawInstant / (15 * 60_000)) * 15 * 60_000)
    const zone = PEOPLE[origin.event.owner].timezone
    const targetDate = dateKeyAt(snappedInstant, zone)
    const targetMinutes = differenceInDays(targetDate, origin.occurrenceDate) * 1440 + parseTime(formatClock(snappedInstant, zone))
    let updatedEvent = origin.event
    let start = origin.start
    let end = origin.end

    if (origin.edge === 'end') {
      const endMinutes = Math.max(origin.event.startMinutes + 15, Math.min(origin.event.startMinutes + 1440, targetMinutes))
      updatedEvent = { ...origin.event, endMinutes }
      end = localDateTimeToUtc(origin.occurrenceDate, endMinutes, zone)
    } else {
      const relativeStart = Math.max(origin.event.endMinutes - 1440, Math.min(origin.event.endMinutes - 15, targetMinutes))
      const dayOffset = Math.floor(relativeStart / 1440)
      const startMinutes = ((relativeStart % 1440) + 1440) % 1440
      const startDate = addDays(origin.occurrenceDate, dayOffset)
      const elapsedWeeks = origin.event.repeat === 'weekly' ? Math.max(0, Math.floor(differenceInDays(origin.occurrenceDate, origin.event.localDate) / 7)) : 0
      const anchorDate = origin.event.repeat === 'weekly' ? addDays(startDate, -elapsedWeeks * 7) : startDate
      updatedEvent = { ...origin.event, localDate: anchorDate, startMinutes, endMinutes: origin.event.endMinutes - dayOffset * 1440 }
      start = localDateTimeToUtc(startDate, startMinutes, zone)
    }

    const clippedStart = Math.max(start.getTime(), viewWindow.start.getTime())
    const clippedEnd = Math.min(end.getTime(), viewWindow.end.getTime())
    const top = Math.max(0, ((clippedStart - viewWindow.start.getTime()) / duration) * trackHeight)
    const height = Math.max(28, ((Math.max(clippedStart, clippedEnd) - clippedStart) / duration) * trackHeight)
    const preview = { key: origin.key, top, height, edge: origin.edge, event: updatedEvent, start, end, moved: Math.abs(pointer.clientY - origin.y) > 3 }
    resizeRef.current = preview
    setResize(preview)
  }

  function endResize(pointer: React.PointerEvent<HTMLSpanElement>) {
    pointer.stopPropagation()
    const origin = resizeOrigin.current
    if (origin && origin.timer !== null) window.clearTimeout(origin.timer)
    if (pointer.currentTarget.hasPointerCapture(pointer.pointerId)) pointer.currentTarget.releasePointerCapture(pointer.pointerId)
    const preview = resizeRef.current
    if (preview?.moved) onMove(preview.event)
    resizeOrigin.current = null
    resizeRef.current = null
    setResize(null)
  }

  function cancelResize(pointer?: React.PointerEvent<HTMLSpanElement>) {
    pointer?.stopPropagation()
    const origin = resizeOrigin.current
    if (origin && origin.timer !== null) window.clearTimeout(origin.timer)
    resizeOrigin.current = null
    resizeRef.current = null
    setResize(null)
  }

  return (
    <div className="timeline-wrap">
      <div className="timeline-head"><span>{cityLabel('sydney', language)} {tx(language, 'time', '时间')}</span><strong><i className="dot sydney" /> {names.sydney}</strong><strong><i className="dot edinburgh" /> {names.edinburgh}</strong><span>{cityLabel('edinburgh', language)} {tx(language, 'time', '时间')}</span></div>
      <div ref={timelineRef} className={`timeline ${drag ? 'drag-active' : ''} ${resize ? 'resize-active' : ''}`} style={{ height: trackHeight }}>
        {markers.map((time) => {
          const top = ((time.getTime() - viewWindow.start.getTime()) / duration) * trackHeight
          return <div className="hour-marker" style={{ top }} key={time.toISOString()}><time>{formatClock(time, PEOPLE.sydney.timezone)}</time><i /><time>{formatClock(time, PEOPLE.edinburgh.timezone)}</time></div>
        })}
        <div className="lane lane-sydney" /><div className="lane lane-edinburgh" />
        {occurrences.map((occurrence) => {
          const occurrenceKey = `${occurrence.event.id}-${occurrence.occurrenceDate}`
          const clippedStart = Math.max(occurrence.start.getTime(), viewWindow.start.getTime())
          const clippedEnd = Math.min(occurrence.end.getTime(), viewWindow.end.getTime())
          const originalTop = ((clippedStart - viewWindow.start.getTime()) / duration) * trackHeight
          const originalHeight = Math.max(28, ((clippedEnd - clippedStart) / duration) * trackHeight)
          const activeDrag = drag?.key === occurrenceKey ? drag : null
          const activeResize = resize?.key === occurrenceKey ? resize : null
          const top = activeResize?.top ?? activeDrag?.top ?? originalTop
          const height = activeResize?.height ?? originalHeight
          const eventOwner = activeDrag?.owner ?? occurrence.event.owner
          const eventStart = activeResize?.start ?? activeDrag?.start ?? occurrence.start
          const eventEnd = activeResize?.end ?? activeDrag?.end ?? occurrence.end
          const hiddenFromTimeline = occurrence.event.hidden
          const density = height < 45 ? 'compact' : height >= 78 ? 'roomy' : 'regular'
          const statusLabel = occurrence.event.status === 'busy' ? tx(language, 'Busy', '忙碌') : tx(language, 'Free', '空闲')
          const displayTitle = hiddenFromTimeline ? statusLabel : (occurrence.event.title || statusLabel)
          return (
            <button title={hiddenFromTimeline ? displayTitle : [displayTitle, occurrence.event.details].filter(Boolean).join(' · ')} key={occurrenceKey}
              onPointerDown={(pointer) => beginDrag(pointer, occurrenceKey, occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
              onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}
              onClick={() => { if (!suppressClick.current) onEdit(occurrence.event) }}
              className={`timeline-event ${eventOwner} ${occurrence.event.status} ${density} ${activeDrag ? 'dragging' : ''} ${activeResize ? 'resizing' : ''}`} style={{ top, height }}>
              <span className="resize-handle resize-start" title={tx(language, 'Drag to adjust start time', '拖动调整开始时间')}
                onPointerDown={(pointer) => beginResize(pointer, occurrenceKey, 'start', occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
                onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(event) => event.stopPropagation()} />
              <strong>{displayTitle}</strong>
              {density !== 'compact' && <span>{formatClock(eventStart, PEOPLE[eventOwner].timezone)}–{formatClock(eventEnd, PEOPLE[eventOwner].timezone)}{occurrence.event.repeat === 'weekly' ? ` · ${tx(language, 'Weekly', '每周')}` : ''}</span>}
              {!hiddenFromTimeline && density === 'roomy' && occurrence.event.details && <small>{occurrence.event.details}</small>}
              <span className="resize-handle resize-end" title={tx(language, 'Drag to adjust end time', '拖动调整结束时间')}
                onPointerDown={(pointer) => beginResize(pointer, occurrenceKey, 'end', occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
                onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(event) => event.stopPropagation()} />
            </button>
          )
        })}
        {drag && <div className={`drag-tooltip ${drag.owner}`} style={{ top: Math.max(0, drag.top - 31) }}>{names[drag.owner]} · {cityLabel(drag.owner, language)} · {drag.displayDate.slice(5)} {minutesLabel(drag.event.startMinutes)}–{drag.event.endMinutes >= 1440 ? `${tx(language, 'next day', '次日')} ` : ''}{minutesLabel(drag.event.endMinutes)}</div>}
        {resize && <div className={`drag-tooltip resize-tip ${resize.event.owner}`} style={{ top: Math.max(0, Math.min(trackHeight - 25, resize.edge === 'start' ? resize.top - 31 : resize.top + resize.height + 6)) }}>
          {resize.edge === 'start' ? tx(language, 'Start', '开始') : tx(language, 'End', '结束')} · {dateKeyAt(resize.start, PEOPLE[resize.event.owner].timezone).slice(5)} {formatClock(resize.start, PEOPLE[resize.event.owner].timezone)} → {dateKeyAt(resize.end, PEOPLE[resize.event.owner].timezone).slice(5)} {formatClock(resize.end, PEOPLE[resize.event.owner].timezone)}
        </div>}
        {(() => {
          const now = new Date()
          if (now < viewWindow.start || now > viewWindow.end) return null
          const top = ((now.getTime() - viewWindow.start.getTime()) / duration) * trackHeight
          return <div className="now-line" style={{ top }}><span>{tx(language, 'Now', '现在')}</span><b /></div>
        })()}
      </div>
    </div>
  )
}

function ProfileModal({ identity, profile, language, onClose, onSaved }: { identity: PersonId; profile: PersonProfile; language: Language; onClose: () => void; onSaved: (profile: PersonProfile) => void }) {
  const [nickname, setNickname] = useState(profile.nickname)
  const [cityName, setCityName] = useState(profile.city)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const city = CITY_OPTIONS.find((option) => option.city === cityName) ?? CITY_OPTIONS[0]
    const next = { ...city, nickname: nickname.trim() || 'ta' }
    setSaving(true)
    try { await saveProfile(identity, next); onSaved(next) }
    catch { setError(tx(language, 'Could not save your profile. Please try again.', '资料保存失败，请稍后重试')); setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="profile-modal" onSubmit={submit}>
      <header><div><p className="eyebrow">MY PROFILE</p><h2>{tx(language, 'Edit my profile', '修改我的资料')}</h2></div><button type="button" className="close-button" aria-label={tx(language, 'Close', '关闭')} onClick={onClose}>×</button></header>
      <label>{tx(language, 'Nickname', '昵称')}<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="ta" /></label>
      <label>{tx(language, 'City', '所在城市')}<select value={cityName} onChange={(event) => setCityName(event.target.value)}>{CITY_OPTIONS.map((city) => <option key={`${city.city}-${city.timezone}`} value={city.city}>{language === 'en' ? `${city.cityEn} · ${city.city}` : `${city.city} · ${city.cityEn}`}</option>)}</select></label>
      {error && <p className="form-error">{error}</p>}
      <footer><button type="button" className="secondary-button" onClick={onClose}>{tx(language, 'Cancel', '取消')}</button><button className="primary-button compact" disabled={saving}>{saving ? tx(language, 'Saving…', '保存中…') : tx(language, 'Save profile', '保存资料')}</button></footer>
    </form>
  </div>
}

function MessageBoard({ messages, identity, names, language, onChanged }: { messages: Message[]; identity: PersonId; names: Nicknames; language: Language; onChanged: () => void }) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const clean = content.trim()
    if (!clean) return
    setSending(true)
    try {
      await saveMessage({ id: uid(), author: identity, content: clean, createdAt: new Date().toISOString() })
      setContent('')
      onChanged()
    } finally { setSending(false) }
  }

  return <section className="message-board card">
    <header><div className="message-icon">✿</div><div><p className="eyebrow">LITTLE NOTES</p><h3>{tx(language, 'Notes for each other', '给彼此留言')}</h3></div></header>
    <form onSubmit={submit}><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={180} rows={3} placeholder={tx(language, 'Leave a short note …', '悄悄留句话…')} /><div><small>{content.length}/180</small><button disabled={sending || !content.trim()}>{sending ? tx(language, 'Sending…', '发送中…') : tx(language, 'Pin note', '贴上留言')}</button></div></form>
    <div className="note-list">{messages.length ? messages.map((message, index) => <article className={`note ${message.author} tilt-${index % 3}`} key={message.id}>
      <header><strong>{names[message.author]}</strong><span>{PEOPLE[message.author].city}</span></header>
      <p>{message.content}</p>
      <footer><time>{new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time><button title={tx(language, 'Delete note', '删除留言')} onClick={async () => { await removeMessage(message.id); onChanged() }}>×</button></footer>
    </article>) : <p className="notes-empty">{tx(language, 'No notes yet. Pin your first short note here ♡', '还没有留言，贴下第一张小纸条吧 ♡')}</p>}</div>
  </section>
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en')
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [identity, setIdentity] = useState<PersonId>((localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney')
  const [reference, setReference] = useState<PersonId>(() => (localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney')
  const [selectedDate, setSelectedDate] = useState(() => {
    const person = (localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney'
    return dateKeyAt(new Date(), PEOPLE[person].timezone)
  })
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [profiles, setProfiles] = useState<Profiles>(() => structuredClone(DEFAULT_PROFILES))
  const [messages, setMessages] = useState<Message[]>([])
  const [now, setNow] = useState(new Date())
  const [modal, setModal] = useState<{ open: boolean; event: ScheduleEvent | null }>({ open: false, event: null })
  const [profileOpen, setProfileOpen] = useState(false)
  const [message, setMessage] = useState('')
  const identityDateAligned = useRef(false)
  const names: Nicknames = { sydney: profiles.sydney.nickname, edinburgh: profiles.edinburgh.nickname }

  async function refresh() {
    try {
      const [nextEvents, nextProfiles, nextMessages] = await Promise.all([loadEvents(), loadProfiles(), loadMessages()])
      applyProfiles(nextProfiles)
      setEvents(nextEvents)
      setProfiles(nextProfiles)
      setMessages(nextMessages)
      if (!identityDateAligned.current) {
        setReference(identity)
        setSelectedDate(dateKeyAt(new Date(), nextProfiles[identity].timezone))
        identityDateAligned.current = true
      }
    } catch { setMessage(tx(language, 'Sync paused. Waiting for the connection to return.', '同步暂时中断，正在等待网络恢复')) }
  }

  useEffect(() => { hasSession().then((session) => { setAuthenticated(session); setReady(true) }) }, [])
  useEffect(() => { if (authenticated) refresh() }, [authenticated])
  useEffect(() => authenticated ? subscribeToEvents(refresh) : undefined, [authenticated])
  useEffect(() => {
    if (!authenticated || !cloudEnabled) return
    const syncNow = () => refresh()
    const syncWhenVisible = () => { if (document.visibilityState === 'visible') syncNow() }
    const timer = window.setInterval(syncNow, 20_000)
    window.addEventListener('focus', syncNow)
    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', syncNow)
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [authenticated])
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer) }, [])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer) }, [message])
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  }, [language])

  function changeReference(person: PersonId) {
    const currentWindow = dayWindow(selectedDate, reference)
    const midpoint = new Date((currentWindow.start.getTime() + currentWindow.end.getTime()) / 2)
    setReference(person)
    setSelectedDate(dateKeyAt(midpoint, PEOPLE[person].timezone))
  }

  if (!ready) return <div className="splash"><div className="brand-mark large"><span /><span /></div><p>{tx(language, 'Aligning time across two cities…', '正在校准两座城市的时间…')}</p></div>
  if (!authenticated) return <LoginScreen language={language} onLanguageChange={setLanguage} onDone={(person, profile) => {
    const nextProfiles = { ...profiles, [person]: profile }
    applyProfiles(nextProfiles)
    setIdentity(person)
    setProfiles(nextProfiles)
    setReference(person)
    setSelectedDate(dateKeyAt(new Date(), profile.timezone))
    identityDateAligned.current = true
    setAuthenticated(true)
  }} />

  const viewWindow = dayWindow(selectedDate, reference)
  const occurrences = events.flatMap((event) => occurrencesInWindow(event, viewWindow.start, viewWindow.end))
  const freeSlots = commonFreeSlots(occurrences, viewWindow.start, viewWindow.end)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand"><div className="brand-mark"><span /><span /></div><div><strong>{tx(language, 'Between Us', '我们之间')}</strong><small>BETWEEN US</small></div></a>
        <div className="top-actions"><LanguageToggle language={language} onChange={setLanguage} /><span className={`sync-badge ${cloudEnabled ? 'cloud' : ''}`}><i />{cloudEnabled ? tx(language, 'Live sync', '实时同步') : tx(language, 'Local preview', '本地预览')}</span><button className="profile-button" onClick={() => setProfileOpen(true)}><span className={`avatar mini ${identity}`}>{cityLabel(identity, language).slice(0, 1)}</span><span>{names[identity]} · {cityLabel(identity, language)}</span></button><button className="logout-button" aria-label={tx(language, 'Log out', '退出')} title={tx(language, 'Log out', '退出')} onClick={async () => { identityDateAligned.current = false; await logout(); setAuthenticated(false) }}>↗</button></div>
      </header>

      <main className="dashboard">
        {!cloudEnabled && <div className="local-warning">{tx(language, 'Local preview: changes are saved only on this device. Add the Supabase environment variables to Vercel Production and redeploy.', '本地预览：内容只保存在当前设备。请在 Vercel Production 中配置 Supabase 环境变量并重新部署。')}</div>}
        <section className="welcome-row"><div><p className="eyebrow">GOOD TO SEE YOU</p><h1>{tx(language, "Let's see each other's day.", '今天，也看看彼此的时间。')}</h1></div><p className="difference-pill">↔ {timezoneDifferenceLabel(now, language)}</p></section>
        <section className="clocks"><ClockCard person="sydney" now={now} language={language} /><div className="connection"><span /><i>♥</i><span /></div><ClockCard person="edinburgh" now={now} language={language} /></section>

        <section className="planner-grid">
          <aside><Calendar selected={selectedDate} reference={reference} events={events} names={names} language={language} onSelect={setSelectedDate} />
            <section className="free-card card"><div className="free-icon">♥</div><div><p className="eyebrow">TIME FOR US</p><h3>{tx(language, 'Time together', '共同空闲')}</h3></div>{freeSlots.length ? <ul>{freeSlots.slice(0, 5).map((slot) => <li key={slot.start.toISOString()}>{formatDualRange(slot.start, slot.end, language)}</li>)}</ul> : <p className="muted">{tx(language, 'Your “Free” blocks do not overlap yet.', '双方的“空闲”时间条暂时没有重叠。')}</p>}<small>{tx(language, 'Overlap of both “Free” blocks; “Busy” blocks take priority', '取双方“空闲”标签的重叠时间；如与“忙碌”冲突则以忙碌为准')}</small></section>
            <MessageBoard messages={messages} identity={identity} names={names} language={language} onChanged={refresh} />
          </aside>

          <section className="schedule-card card">
            <header className="schedule-header"><div className="date-nav"><button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>←</button><div><p className="eyebrow">DAILY TIMELINE</p><h2>{dateTitle(selectedDate, language)}</h2></div><button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>→</button></div><button className="today-button" onClick={() => setSelectedDate(dateKeyAt(new Date(), PEOPLE[reference].timezone))}>{tx(language, 'Today', '今天')}</button></header>
            <div className="reference-row"><span>{tx(language, 'Date based on', '日期基准')}</span><div className="segmented"><button className={reference === 'sydney' ? 'active' : ''} onClick={() => changeReference('sydney')}>{cityLabel('sydney', language)}</button><button className={reference === 'edinburgh' ? 'active' : ''} onClick={() => changeReference('edinburgh')}>{cityLabel('edinburgh', language)}</button></div><p>{tx(language, 'Both sides always align to the same moment', '两侧始终按同一真实时刻对齐')}</p></div>
            {occurrences.length === 0 && <button className="empty-hint" onClick={() => setModal({ open: true, event: null })}><span>＋</span><p>{tx(language, 'A quiet day. Add the first plan.', '这一天还很安静。点击添加第一段行程')}</p></button>}
            <DayTimeline selectedDate={selectedDate} reference={reference} names={names} events={events} language={language}
              onEdit={(event) => setModal({ open: true, event })}
              onMove={async (event) => {
                setEvents((current) => current.map((item) => item.id === event.id ? event : item))
                try {
                  await saveEvent(event)
                  await refresh()
                  setMessage(tx(language, `Moved to ${event.localDate} · ${cityLabel(event.owner, language)} ${minutesLabel(event.startMinutes)}`, `已移动到 ${event.localDate} · ${cityLabel(event.owner, language)} ${minutesLabel(event.startMinutes)}`))
                } catch { await refresh(); setMessage(tx(language, 'Could not save the move. Check your connection.', '移动保存失败，请检查网络后重试')) }
              }} />
          </section>
        </section>
      </main>

      <button className="fab" onClick={() => setModal({ open: true, event: null })}><span>＋</span> {tx(language, 'Add plan', '添加行程')}</button>
      {modal.open && <EventModal initial={modal.event} identity={identity} names={names} selectedDate={selectedDate} reference={reference} language={language} onClose={() => setModal({ open: false, event: null })} onSaved={() => { setModal({ open: false, event: null }); refresh(); setMessage(tx(language, 'Plan saved', '行程已保存')) }} onDeleted={() => { setModal({ open: false, event: null }); refresh(); setMessage(tx(language, 'Plan deleted', '行程已删除')) }} />}
      {profileOpen && <ProfileModal identity={identity} profile={profiles[identity]} language={language} onClose={() => setProfileOpen(false)} onSaved={(profile) => {
        const nextProfiles = { ...profiles, [identity]: profile }
        applyProfiles(nextProfiles)
        setProfiles(nextProfiles)
        localStorage.setItem(`between-us-nickname-${identity}`, profile.nickname)
        setProfileOpen(false)
        setSelectedDate(dateKeyAt(new Date(), PEOPLE[reference].timezone))
        setMessage(tx(language, 'Nickname and city updated', '昵称和城市已更新'))
      }} />}
      {message && <div className="toast">{message}</div>}
    </div>
  )
}
