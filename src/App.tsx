import { useEffect, useMemo, useRef, useState } from 'react'
import { cloudEnabled, hasSession, loadEvents, loadNicknames, login, logout, removeEvent, saveEvent, saveNickname, subscribeToEvents } from './data'
import {
  addDays, commonFreeSlots, dateKeyAt, dateTitle, dayWindow, differenceInDays, formatCityDate, formatClock,
  formatDualRange, hourAt, localDateTimeToUtc, minutesLabel, occurrencesInWindow, timezoneDifferenceLabel,
} from './time'
import { DEFAULT_NICKNAMES, PEOPLE, type Nicknames, type PersonId, type ScheduleEvent } from './types'

const PROFILE_KEY = 'between-us-profile'

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function ClockCard({ person, now }: { person: PersonId; now: Date }) {
  const config = PEOPLE[person]
  const hour = hourAt(now, config.timezone)
  const isDay = hour >= 7 && hour < 19
  return (
    <article className={`clock-card ${person}`}>
      <div className="clock-orb" aria-hidden="true"><span>{isDay ? '☀' : '☾'}</span></div>
      <div>
        <p className="eyebrow">{config.cityEn}</p>
        <h2>{formatClock(now, config.timezone)}</h2>
        <p>{formatCityDate(now, config.timezone)} · {isDay ? '白天' : '夜晚'}</p>
      </div>
      <span className="city-name">{config.city}</span>
    </article>
  )
}

function LoginScreen({ onDone }: { onDone: (identity: PersonId, nickname: string) => void }) {
  const [identity, setIdentity] = useState<PersonId>((localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney')
  const [nickname, setNickname] = useState(() => localStorage.getItem(`between-us-nickname-${identity}`) || 'ta')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(password)
      await saveNickname(identity, nickname)
      localStorage.setItem(PROFILE_KEY, identity)
      localStorage.setItem(`between-us-nickname-${identity}`, nickname.trim() || 'ta')
      onDone(identity, nickname.trim() || 'ta')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暂时无法进入，请稍后重试')
    } finally { setBusy(false) }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand-mark large"><span /><span /></div>
        <p className="eyebrow">SYDNEY · EDINBURGH</p>
        <h1>相隔很远，<br />时间仍在一起。</h1>
        <p className="login-copy">把两座城市的日常，放进同一条时间线。</p>
        <div className="route-line"><i>SYD</i><b /><i>EDI</i></div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <p className="eyebrow">WELCOME HOME</p>
          <h2>今天以谁的身份进入？</h2>
          <div className="identity-grid">
            {(['sydney', 'edinburgh'] as PersonId[]).map((person) => (
              <button className={`identity-card ${identity === person ? 'selected' : ''}`} type="button" key={person} onClick={() => { setIdentity(person); setNickname(localStorage.getItem(`between-us-nickname-${person}`) || 'ta') }}>
                <span className={`avatar ${person}`}>{person === 'sydney' ? '悉' : '爱'}</span>
                <strong>{PEOPLE[person].city}</strong><small>选择这个城市的身份</small>
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="nickname">你的昵称</label>
          <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="ta" maxLength={20} />
          <label className="field-label" htmlFor="password">共享密码</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入只有你们知道的密码" autoComplete="current-password" required />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? '正在进入…' : '进入我们的时间'}</button>
        </form>
      </section>
    </main>
  )
}

function Calendar({ selected, reference, events, names, onSelect }: { selected: string; reference: PersonId; events: ScheduleEvent[]; names: Nicknames; onSelect: (day: string) => void }) {
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
        <div><p className="eyebrow">SHARED CALENDAR</p><h3>{year}年 {month}月</h3></div>
        <div className="icon-buttons"><button onClick={() => moveMonth(-1)} aria-label="上个月">←</button><button onClick={() => moveMonth(1)} aria-label="下个月">→</button></div>
      </header>
      <div className="weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
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
      <footer className="calendar-legend"><span><b className="dot sydney" /> {names.sydney} · 悉尼</span><span><b className="dot edinburgh" /> {names.edinburgh} · 爱丁堡</span></footer>
    </section>
  )
}

function EventModal({ initial, identity, names, selectedDate, reference, onClose, onSaved, onDeleted }: {
  initial: ScheduleEvent | null; identity: PersonId; selectedDate: string; reference: PersonId;
  names: Nicknames;
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
    if (rawEndMinutes === startMinutes) { setError('开始和结束时间不能相同'); return }
    const endMinutes = rawEndMinutes < startMinutes ? rawEndMinutes + 1440 : rawEndMinutes
    setSaving(true)
    try {
      await saveEvent({
        id: initial?.id ?? uid(), owner, status, title: title.trim(), details: details.trim(), hidden,
        localDate: date, startMinutes, endMinutes, repeat, createdAt: initial?.createdAt ?? new Date().toISOString(),
      })
      onSaved()
    } catch { setError('保存失败，请检查网络后重试') } finally { setSaving(false) }
  }

  async function remove() {
    if (!initial || !window.confirm('确定删除这项行程吗？')) return
    setSaving(true)
    try { await removeEvent(initial.id); onDeleted() } catch { setError('删除失败，请稍后重试'); setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="event-modal" onSubmit={submit}>
        <header><div><p className="eyebrow">{initial ? 'EDIT PLAN' : 'NEW PLAN'}</p><h2>{initial ? '编辑行程' : '添加一段时间'}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></header>
        <div className="segmented two">
          {(['sydney', 'edinburgh'] as PersonId[]).map((person) => <button type="button" className={owner === person ? 'active' : ''} onClick={() => setOwner(person)} key={person}>{names[person]} · {PEOPLE[person].city}</button>)}
        </div>
        <div className="segmented two status-select">
          <button type="button" className={status === 'busy' ? 'active busy' : ''} onClick={() => setStatus('busy')}>忙碌</button>
          <button type="button" className={status === 'free' ? 'active free' : ''} onClick={() => setStatus('free')}>空闲</button>
        </div>
        <label>标题（可选）<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={status === 'busy' ? '例如：上课' : '例如：可以视频'} /></label>
        <div className="form-row three"><label>当地日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>开始<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label>结束（可跨次日）<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /><small className="field-help">早于开始时间时按次日计算</small></label></div>
        <label>具体信息（可选）<textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="地点、备注或想告诉对方的话…" rows={3} /></label>
        <div className="form-row two"><label>重复<select value={repeat} onChange={(event) => setRepeat(event.target.value as ScheduleEvent['repeat'])}><option value="none">不重复</option><option value="weekly">每周重复</option></select></label><label className="check-label"><input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} /><span><strong>隐藏具体信息</strong><small>时间轴仅显示“{status === 'busy' ? '忙碌' : '空闲'}”</small></span></label></div>
        {error && <p className="form-error">{error}</p>}
        <footer>{initial && <button type="button" className="delete-button" onClick={remove}>删除</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button compact" disabled={saving}>{saving ? '保存中…' : '保存行程'}</button></footer>
      </form>
    </div>
  )
}

function DayTimeline({ selectedDate, reference, names, events, onEdit, onMove }: {
  selectedDate: string; reference: PersonId; names: Nicknames; events: ScheduleEvent[];
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
      <div className="timeline-head"><span>悉尼时间</span><strong><i className="dot sydney" /> {names.sydney}</strong><strong><i className="dot edinburgh" /> {names.edinburgh}</strong><span>爱丁堡时间</span></div>
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
          const displayTitle = hiddenFromTimeline ? (occurrence.event.status === 'busy' ? '忙碌' : '空闲') : (occurrence.event.title || (occurrence.event.status === 'busy' ? '忙碌' : '空闲'))
          return (
            <button title={hiddenFromTimeline ? displayTitle : [displayTitle, occurrence.event.details].filter(Boolean).join(' · ')} key={occurrenceKey}
              onPointerDown={(pointer) => beginDrag(pointer, occurrenceKey, occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
              onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}
              onClick={() => { if (!suppressClick.current) onEdit(occurrence.event) }}
              className={`timeline-event ${eventOwner} ${occurrence.event.status} ${density} ${activeDrag ? 'dragging' : ''} ${activeResize ? 'resizing' : ''}`} style={{ top, height }}>
              <span className="resize-handle resize-start" title="拖动调整开始时间"
                onPointerDown={(pointer) => beginResize(pointer, occurrenceKey, 'start', occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
                onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(event) => event.stopPropagation()} />
              <strong>{displayTitle}</strong>
              {density !== 'compact' && <span>{formatClock(eventStart, PEOPLE[eventOwner].timezone)}–{formatClock(eventEnd, PEOPLE[eventOwner].timezone)}{occurrence.event.repeat === 'weekly' ? ' · 每周' : ''}</span>}
              {!hiddenFromTimeline && density === 'roomy' && occurrence.event.details && <small>{occurrence.event.details}</small>}
              <span className="resize-handle resize-end" title="拖动调整结束时间"
                onPointerDown={(pointer) => beginResize(pointer, occurrenceKey, 'end', occurrence.event, occurrence.occurrenceDate, originalTop, originalHeight, occurrence.start, occurrence.end)}
                onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(event) => event.stopPropagation()} />
            </button>
          )
        })}
        {drag && <div className={`drag-tooltip ${drag.owner}`} style={{ top: Math.max(0, drag.top - 31) }}>{names[drag.owner]} · {PEOPLE[drag.owner].city} · {drag.displayDate.slice(5)} {minutesLabel(drag.event.startMinutes)}–{drag.event.endMinutes >= 1440 ? '次日 ' : ''}{minutesLabel(drag.event.endMinutes)}</div>}
        {resize && <div className={`drag-tooltip resize-tip ${resize.event.owner}`} style={{ top: Math.max(0, Math.min(trackHeight - 25, resize.edge === 'start' ? resize.top - 31 : resize.top + resize.height + 6)) }}>
          {resize.edge === 'start' ? '开始' : '结束'} · {dateKeyAt(resize.start, PEOPLE[resize.event.owner].timezone).slice(5)} {formatClock(resize.start, PEOPLE[resize.event.owner].timezone)} → {dateKeyAt(resize.end, PEOPLE[resize.event.owner].timezone).slice(5)} {formatClock(resize.end, PEOPLE[resize.event.owner].timezone)}
        </div>}
        {(() => {
          const now = new Date()
          if (now < viewWindow.start || now > viewWindow.end) return null
          const top = ((now.getTime() - viewWindow.start.getTime()) / duration) * trackHeight
          return <div className="now-line" style={{ top }}><span>现在</span><b /></div>
        })()}
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [identity, setIdentity] = useState<PersonId>((localStorage.getItem(PROFILE_KEY) as PersonId) || 'sydney')
  const [reference, setReference] = useState<PersonId>('sydney')
  const [selectedDate, setSelectedDate] = useState(() => dateKeyAt(new Date(), PEOPLE.sydney.timezone))
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [names, setNames] = useState<Nicknames>({ ...DEFAULT_NICKNAMES })
  const [now, setNow] = useState(new Date())
  const [modal, setModal] = useState<{ open: boolean; event: ScheduleEvent | null }>({ open: false, event: null })
  const [message, setMessage] = useState('')

  async function refresh() {
    try {
      const [nextEvents, nextNames] = await Promise.all([loadEvents(), loadNicknames()])
      setEvents(nextEvents)
      setNames(nextNames)
    } catch { setMessage('同步暂时中断，正在等待网络恢复') }
  }

  useEffect(() => { hasSession().then((session) => { setAuthenticated(session); setReady(true) }) }, [])
  useEffect(() => { if (authenticated) refresh() }, [authenticated])
  useEffect(() => authenticated ? subscribeToEvents(refresh) : undefined, [authenticated])
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer) }, [])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer) }, [message])

  function changeReference(person: PersonId) {
    const currentWindow = dayWindow(selectedDate, reference)
    const midpoint = new Date((currentWindow.start.getTime() + currentWindow.end.getTime()) / 2)
    setReference(person)
    setSelectedDate(dateKeyAt(midpoint, PEOPLE[person].timezone))
  }

  if (!ready) return <div className="splash"><div className="brand-mark large"><span /><span /></div><p>正在校准两座城市的时间…</p></div>
  if (!authenticated) return <LoginScreen onDone={(person, nickname) => { setIdentity(person); setNames((current) => ({ ...current, [person]: nickname })); setAuthenticated(true) }} />

  const viewWindow = dayWindow(selectedDate, reference)
  const occurrences = events.flatMap((event) => occurrencesInWindow(event, viewWindow.start, viewWindow.end))
  const freeSlots = commonFreeSlots(occurrences, viewWindow.start, viewWindow.end)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand"><div className="brand-mark"><span /><span /></div><div><strong>我们之间</strong><small>BETWEEN US</small></div></a>
        <div className="top-actions"><span className={`sync-badge ${cloudEnabled ? 'cloud' : ''}`}><i />{cloudEnabled ? '实时同步' : '本地预览'}</span><button className="profile-button" onClick={() => { const next = identity === 'sydney' ? 'edinburgh' : 'sydney'; setIdentity(next); localStorage.setItem(PROFILE_KEY, next) }}><span className={`avatar mini ${identity}`}>{identity === 'sydney' ? '悉' : '爱'}</span><span>{names[identity]} · {PEOPLE[identity].city}</span></button><button className="logout-button" title="退出" onClick={async () => { await logout(); setAuthenticated(false) }}>↗</button></div>
      </header>

      <main className="dashboard">
        <section className="welcome-row"><div><p className="eyebrow">GOOD TO SEE YOU</p><h1>今天，也看看彼此的时间。</h1></div><p className="difference-pill">↔ {timezoneDifferenceLabel(now)}</p></section>
        <section className="clocks"><ClockCard person="sydney" now={now} /><div className="connection"><span /><i>♥</i><span /></div><ClockCard person="edinburgh" now={now} /></section>

        <section className="planner-grid">
          <aside><Calendar selected={selectedDate} reference={reference} events={events} names={names} onSelect={setSelectedDate} />
            <section className="free-card card"><div className="free-icon">♥</div><div><p className="eyebrow">TIME FOR US</p><h3>共同空闲</h3></div>{freeSlots.length ? <ul>{freeSlots.slice(0, 5).map((slot) => <li key={slot.start.toISOString()}>{formatDualRange(slot.start, slot.end)}</li>)}</ul> : <p className="muted">双方的“空闲”时间条暂时没有重叠。</p>}<small>取双方“空闲”标签的重叠时间；如与“忙碌”冲突则以忙碌为准</small></section>
          </aside>

          <section className="schedule-card card">
            <header className="schedule-header"><div className="date-nav"><button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>←</button><div><p className="eyebrow">DAILY TIMELINE</p><h2>{dateTitle(selectedDate)}</h2></div><button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>→</button></div><button className="today-button" onClick={() => setSelectedDate(dateKeyAt(new Date(), PEOPLE[reference].timezone))}>今天</button></header>
            <div className="reference-row"><span>日期基准</span><div className="segmented"><button className={reference === 'sydney' ? 'active' : ''} onClick={() => changeReference('sydney')}>悉尼日</button><button className={reference === 'edinburgh' ? 'active' : ''} onClick={() => changeReference('edinburgh')}>爱丁堡日</button></div><p>两侧始终按同一真实时刻对齐</p></div>
            {occurrences.length === 0 && <button className="empty-hint" onClick={() => setModal({ open: true, event: null })}><span>＋</span><p>这一天还很安静。点击添加第一段行程</p></button>}
            <DayTimeline selectedDate={selectedDate} reference={reference} names={names} events={events}
              onEdit={(event) => setModal({ open: true, event })}
              onMove={async (event) => {
                setEvents((current) => current.map((item) => item.id === event.id ? event : item))
                try {
                  await saveEvent(event)
                  await refresh()
                  setMessage(`已移动到 ${event.localDate} · ${PEOPLE[event.owner].city} ${minutesLabel(event.startMinutes)}`)
                } catch { await refresh(); setMessage('移动保存失败，请检查网络后重试') }
              }} />
          </section>
        </section>
      </main>

      <button className="fab" onClick={() => setModal({ open: true, event: null })}><span>＋</span> 添加行程</button>
      {modal.open && <EventModal initial={modal.event} identity={identity} names={names} selectedDate={selectedDate} reference={reference} onClose={() => setModal({ open: false, event: null })} onSaved={() => { setModal({ open: false, event: null }); refresh(); setMessage('行程已保存') }} onDeleted={() => { setModal({ open: false, event: null }); refresh(); setMessage('行程已删除') }} />}
      {message && <div className="toast">{message}</div>}
    </div>
  )
}
