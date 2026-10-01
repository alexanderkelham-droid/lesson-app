import { useState, useMemo, useRef, useEffect } from 'react'
import { CalendarPlus, Inbox, X } from 'lucide-react'
import { fmtDay, fmtTime, todayUk, ukDateKey } from '../../lib/datetime'
import { sessionLabel, sessionNumberLabel, subjectLabel } from '../../lib/sessions'

const PAST_SHOWN = 3
const UPCOMING_SHOWN = 8

// A lesson counts as "over" once its end time has passed (or it's attended)
export function isOver(s, now = Date.now()) {
  return !!s.attendedAt || new Date(s.scheduledAt).getTime() + (s.durationMins || 60) * 60000 < now
}

// Row of lesson chips: the last few lessons, the next few, and Unscheduled.
export default function LessonPicker({ sessions, ordinals, selectedKey, counts, unscheduledCount, onSelect, onAddLesson, defaultTime = '16:00', canEdit = true }) {
  const [now] = useState(() => Date.now())
  const today = todayUk()
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(defaultTime)
  const [busy, setBusy] = useState(false)
  const selectedRef = useRef(null)

  const { visible, hidden } = useMemo(() => {
    const past = sessions.filter(s => isOver(s, now))
    const upcoming = sessions.filter(s => !isOver(s, now))
    let shown = [...past.slice(-PAST_SHOWN), ...upcoming.slice(0, UPCOMING_SHOWN)]
    const sel = sessions.find(s => s.id === selectedKey)
    if (sel && !shown.includes(sel)) shown = [...shown, sel].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    return { visible: shown, hidden: sessions.filter(s => !shown.includes(s)) }
  }, [sessions, selectedKey, now])

  const nextId = useMemo(() => sessions.find(s => !isOver(s, now))?.id, [sessions, now])

  // Keep the selected chip in view when the row scrolls
  useEffect(() => { selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }, [selectedKey])

  async function submitAdd(e) {
    e.preventDefault()
    if (!date || !time) return
    setBusy(true)
    const ok = await onAddLesson(date, time)
    setBusy(false)
    if (ok) setAdding(false)
  }

  const chipBase = 'flex-shrink-0 text-left rounded-xl border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-redwood-500/40'
  const chipClass = selected => selected
    ? `${chipBase} border-redwood-600 bg-redwood-50 ring-1 ring-redwood-600`
    : `${chipBase} border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50`

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="eyebrow">Choose a lesson to plan</h2>
        <div className="flex items-center gap-2">
          {hidden.length > 0 && (
            <select
              value=""
              onChange={e => e.target.value && onSelect(Number(e.target.value))}
              className="input text-xs py-1 w-auto"
              aria-label="Jump to another lesson"
            >
              <option value="">Other lessons ({hidden.length})…</option>
              {hidden.map(s => <option key={s.id} value={s.id}>{sessionLabel(s, ordinals)}</option>)}
            </select>
          )}
          {canEdit && !adding && (
            <button type="button" onClick={() => { setDate(today); setTime(defaultTime); setAdding(true) }} className="btn-secondary btn-sm">
              <CalendarPlus className="icon-sm" aria-hidden /> Add lesson
            </button>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={submitAdd} className="card-muted p-3 mb-3 flex flex-wrap items-end gap-2" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false) } }}>
          <div>
            <label className="label text-xs" htmlFor="add-lesson-date">Date</label>
            <input id="add-lesson-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="input text-sm py-1.5" required autoFocus />
          </div>
          <div>
            <label className="label text-xs" htmlFor="add-lesson-time">Time (UK)</label>
            <input id="add-lesson-time" type="time" value={time} onChange={e => setTime(e.target.value)} className="input text-sm py-1.5 w-28" required />
          </div>
          <button type="submit" disabled={busy || !date || !time} className="btn-primary btn-sm">{busy ? 'Adding…' : 'Add lesson'}</button>
          <button type="button" onClick={() => setAdding(false)} className="btn-ghost btn-sm" aria-label="Cancel adding a lesson" title="Cancel">
            <X className="icon-sm" aria-hidden /> Cancel
          </button>
          <p className="basis-full text-xs text-gray-500">A one-off lesson. Weekly lessons come from the times on the student's profile.</p>
        </form>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Lessons">
        {visible.length === 0 && (
          <p className="text-sm text-gray-500 py-2 pr-4">No lessons scheduled yet. Add one, or set weekly lesson times on the student's profile.</p>
        )}
        {visible.map(s => {
          const selected = s.id === selectedKey
          const c = counts[s.id] || { total: 0, done: 0 }
          const over = isOver(s, now)
          const ord = ordinals[s.id]
          const subject = subjectLabel(s.subject)
          const isToday = ukDateKey(s.scheduledAt) === today
          const status = s.attendedAt ? 'Attended' : s.id === nextId ? (isToday ? 'Today' : 'Next') : over ? 'Past' : isToday ? 'Today' : ''
          return (
            <button
              key={s.id}
              ref={selected ? selectedRef : null}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selected}
              aria-label={`${sessionLabel(s, ordinals)}${status ? `, ${status}` : ''}, ${c.total} item${c.total === 1 ? '' : 's'}`}
              className={chipClass(selected)}
            >
              <span className={`block text-sm font-medium whitespace-nowrap ${selected ? 'text-redwood-700' : over ? 'text-gray-600' : 'text-gray-900'}`}>
                {fmtDay(s.scheduledAt)} · {fmtTime(s.scheduledAt)}{subject ? ` · ${subject}` : ''}
              </span>
              <span className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500 whitespace-nowrap">
                {ord && <span className="badge text-[10px] px-1.5 py-0">{sessionNumberLabel(ord)}</span>}
                {status === 'Attended' && <span className="badge-success text-[10px] px-1.5 py-0">Attended</span>}
                {(status === 'Next' || status === 'Today') && <span className="badge-accent text-[10px] px-1.5 py-0">{status}</span>}
                {status === 'Past' && <span>Past</span>}
                <span className="tabular-nums">{c.total === 0 ? 'Empty' : `${c.total} item${c.total === 1 ? '' : 's'}`}{c.done > 0 ? `, ${c.done} done` : ''}</span>
              </span>
            </button>
          )
        })}
        <button
          type="button"
          ref={selectedKey === 'unscheduled' ? selectedRef : null}
          onClick={() => onSelect('unscheduled')}
          aria-pressed={selectedKey === 'unscheduled'}
          aria-label={`Unscheduled, ${unscheduledCount} item${unscheduledCount === 1 ? '' : 's'}`}
          className={chipClass(selectedKey === 'unscheduled')}
        >
          <span className={`flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${selectedKey === 'unscheduled' ? 'text-redwood-700' : 'text-gray-700'}`}>
            <Inbox className="icon-sm" aria-hidden /> Unscheduled
          </span>
          <span className="block mt-1 text-[11px] text-gray-500 whitespace-nowrap tabular-nums">
            {unscheduledCount === 0 ? 'Empty' : `${unscheduledCount} item${unscheduledCount === 1 ? '' : 's'}`}
          </span>
        </button>
      </div>
    </div>
  )
}
