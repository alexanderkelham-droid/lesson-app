import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Plus, Trash2, Search, History, FileText, ClipboardList } from 'lucide-react'
import api from '../../lib/api'
import useSheetHistory from '../../hooks/useSheetHistory'
import SheetHistoryBadge from './SheetHistoryBadge'
import { useTopEscape } from '../../lib/escape'

const CUSTOM_TYPES = [
  { value: 'ixl_maths', label: 'IXL Maths' },
  { value: 'ixl_english', label: 'IXL English' },
  { value: 'paper', label: 'Paper activity' },
  { value: 'other', label: 'Custom task' },
]

const pad = n => String(n).padStart(2, '0')
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Record a lesson that already happened (e.g. before the portal existed):
 * date, what was done, scores, notes. Unfinished work carries over to the
 * next lesson; history, sheet memory and the AI planner see it straight away.
 */
export default function PastLessonModal({ planId, studentName, defaultTime = '16:00', onClose, onSaved }) {
  const today = localDate(new Date())
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(defaultTime)
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([])
  const [sheets, setSheets] = useState([])
  const [search, setSearch] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customType, setCustomType] = useState('ixl_maths')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history] = useSheetHistory(planId)
  const panelRef = useRef(null)
  useTopEscape(panelRef, onClose, !saving)

  useEffect(() => { api.get('/sheets').then(r => setSheets(r.data)).catch(() => {}) }, [])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return sheets.filter(s => `${s.title} ${s.topic} ${s.subject}`.toLowerCase().includes(q)).slice(0, 12)
  }, [search, sheets])

  function addSheet(sheet) {
    setRows(r => [...r, { key: `s${sheet.id}-${Date.now()}`, sheetId: sheet.id, title: sheet.title, meta: `${sheet.subject} · ${sheet.topic}`, done: true, score: '' }])
    setSearch('')
  }

  function addCustom(e) {
    e?.preventDefault()
    const t = customTitle.trim()
    if (!t) return
    setRows(r => [...r, { key: `c${Date.now()}`, customTitle: t, customType, title: t, meta: CUSTOM_TYPES.find(c => c.value === customType)?.label, done: true, score: '' }])
    setCustomTitle('')
  }

  const update = (key, patch) => setRows(r => r.map(x => (x.key === key ? { ...x, ...patch } : x)))

  async function save() {
    setError('')
    if (!date) return setError('Choose the date of the lesson.')
    if (date > today) return setError('A past lesson can\'t be in the future.')
    if (!rows.length) return setError('Add at least one thing that was done in the lesson.')
    const bad = rows.find(r => r.score !== '' && (isNaN(Number(r.score)) || Number(r.score) < 0 || Number(r.score) > 100))
    if (bad) return setError(`Score for "${bad.title}" must be between 0 and 100.`)
    setSaving(true)
    try {
      const res = await api.post(`/lesson-plans/${planId}/past-lesson`, {
        scheduledAt: new Date(`${date}T${time || '16:00'}:00`).toISOString(),
        durationMins: duration ? Number(duration) : null,
        notes: notes || null,
        items: rows.map(r => ({
          sheetId: r.sheetId, customTitle: r.customTitle, customType: r.customType,
          done: r.done, score: r.done && r.score !== '' ? Number(r.score) : null,
        })),
      })
      onSaved?.(res.data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save the lesson')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !saving && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Record a past lesson" className="modal-panel w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title flex items-center gap-2"><History className="icon-lg text-redwood-700" aria-hidden /> Record a past lesson</h2>
            <p className="text-sm text-gray-500">Add a lesson {studentName ? `${studentName} ` : ''}has already had, so the next one can build on it.</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Close"><X className="icon" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="pl-date">Date</label>
              <input id="pl-date" type="date" max={today} value={date} onChange={e => setDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pl-time">Time</label>
              <input id="pl-time" type="time" value={time} onChange={e => setTime(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pl-dur">Minutes</label>
              <input id="pl-dur" type="number" min="1" max="600" value={duration} onChange={e => setDuration(e.target.value)} className="input" />
            </div>
          </div>

          {/* What was done */}
          <div>
            <p className="label">What was done</p>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500 card-muted">Nothing added yet. Search the library below, or type an IXL or paper task.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white">
                {rows.map((r, i) => (
                  <li key={r.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="text-xs text-gray-400 w-5 tabular-nums">{i + 1}</span>
                    {r.sheetId ? <FileText className="icon-sm text-gray-400" aria-hidden /> : <ClipboardList className="icon-sm text-gray-400" aria-hidden />}
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.meta}</p>
                    </div>
                    <div className="tabs" role="tablist" aria-label={`Status of ${r.title}`}>
                      <button type="button" role="tab" aria-selected={r.done} onClick={() => update(r.key, { done: true })} className={`tab text-xs ${r.done ? 'tab-active' : ''}`}>Done</button>
                      <button type="button" role="tab" aria-selected={!r.done} onClick={() => update(r.key, { done: false, score: '' })} className={`tab text-xs ${!r.done ? 'tab-active' : ''}`}>Not finished</button>
                    </div>
                    <input
                      type="number" min="0" max="100" inputMode="numeric"
                      value={r.score} onChange={e => update(r.key, { score: e.target.value })}
                      disabled={!r.done} placeholder="Score %"
                      className="input w-24 text-sm" aria-label={`Score for ${r.title}`}
                    />
                    <button type="button" onClick={() => setRows(x => x.filter(y => y.key !== r.key))} className="btn-ghost p-1" aria-label={`Remove ${r.title}`} title="Remove">
                      <Trash2 className="icon-sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500 mt-1.5">Leave the score blank if it wasn't marked. "Not finished" work moves to the next lesson.</p>
          </div>

          {/* Add from library */}
          <div>
            <label className="label" htmlFor="pl-search">Add a worksheet from the library</label>
            <div className="relative">
              <Search className="icon-sm text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input id="pl-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or topic, e.g. fractions" className="input pl-9" />
            </div>
            {matches.length > 0 && (
              <ul className="mt-1 border border-gray-200 rounded-xl bg-white divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {matches.map(s => (
                  <li key={s.id}>
                    <button type="button" onClick={() => addSheet(s)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                      <Plus className="icon-sm text-gray-400" aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-900 truncate">{s.title}</span>
                        <span className="block text-xs text-gray-500 truncate">{s.subject} · {s.topic} · Level {s.difficultyLevel}</span>
                      </span>
                      <SheetHistoryBadge history={history[s.id]} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add custom */}
          <form onSubmit={addCustom}>
            <label className="label" htmlFor="pl-custom">Or add an IXL / paper task</label>
            <div className="flex flex-wrap gap-2">
              <select value={customType} onChange={e => setCustomType(e.target.value)} className="input w-auto text-sm" aria-label="Task type">
                {CUSTOM_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input id="pl-custom" value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="e.g. IXL, Level G, F.2, Literary devices, 25 questions" className="input flex-1 min-w-[200px] text-sm" />
              <button type="submit" className="btn-secondary btn-sm" disabled={!customTitle.trim()}><Plus className="icon-sm" aria-hidden /> Add</button>
            </div>
          </form>

          <div>
            <label className="label" htmlFor="pl-notes">Lesson notes (optional, private)</label>
            <textarea id="pl-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="input resize-none text-sm" placeholder="How did it go? Anything to follow up next time?" />
          </div>

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : `Save lesson${rows.length ? ` (${rows.length})` : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
