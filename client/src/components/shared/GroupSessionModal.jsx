import { useState, useEffect, useRef, useId, useCallback, useMemo } from 'react'
import { Search, Users, X } from 'lucide-react'
import api from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { ukDateKey, ukTimeKey, ukToIso, todayUk } from '../../lib/datetime'
import { useTopEscape } from '../../lib/escape'

export const MAX_GROUP_SIZE = 5
export const LOCATION_SUGGESTIONS = ['Retford', 'Doncaster', 'Online']

// Date and time fields are UK wall-clock, whatever the device's zone
const timeKey = ukTimeKey

/**
 * Search + chips multi-select for students.
 * `selected` is an array of student objects; `exclude` ids are hidden.
 */
export function StudentPicker({ students, selected, onChange, exclude = [], max = MAX_GROUP_SIZE, label = 'Students' }) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const listId = useId()
  const selectedIds = new Set(selected.map(s => s.id))
  const excluded = new Set(exclude)
  const full = selected.length >= max
  const matches = students
    .filter(s => !selectedIds.has(s.id) && !excluded.has(s.id))
    .filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()) || (s.email || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)

  function add(s) {
    if (full) return
    onChange([...selected, s])
    setQuery('')
  }

  return (
    <div>
      <label className="label" htmlFor={inputId}>{label}</label>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Selected students">
          {selected.map(s => (
            <li key={s.id} className="badge py-1 pl-2.5 pr-1 text-sm">
              {s.name}
              <button
                type="button"
                onClick={() => onChange(selected.filter(x => x.id !== s.id))}
                className="p-0.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-900"
                aria-label={`Remove ${s.name}`}
                title={`Remove ${s.name}`}
              >
                <X className="icon-sm" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
        <input
          id={inputId}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]) } }}
          placeholder={full ? `Groups are up to ${max} students` : 'Search students by name'}
          disabled={full}
          className="input pl-9"
          aria-controls={listId}
          autoComplete="off"
        />
      </div>
      {!full && (
        <ul id={listId} className="mt-1.5 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto" aria-label="Matching students">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">{query ? 'No students match.' : 'No more students to add.'}</li>
          ) : matches.map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => add(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-redwood-50 text-redwood-700 text-xs font-semibold flex items-center justify-center flex-shrink-0" aria-hidden>{s.name.charAt(0)}</span>
                <span className="flex-1 min-w-0 truncate text-gray-900">{s.name}</span>
                {s.subjectFocus && <span className="badge capitalize">{s.subjectFocus}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500 mt-1.5">{selected.length} of {max} places filled.</p>
    </div>
  )
}

/**
 * Create or edit a group session (a class: one slot, several students).
 * Create: pass `defaultDate` (YYYY-MM-DD) / `defaultTime` (HH:mm) optionally.
 * Edit: pass `group` (from /api/groups). Members are managed in the detail panel.
 */
export default function GroupSessionModal({ group = null, defaultDate, defaultTime, onClose, onSaved }) {
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const isEdit = !!group
  const start = group ? new Date(group.scheduledAt) : null

  const [title, setTitle] = useState(group?.title || '')
  const [tutorId, setTutorId] = useState(group?.tutorId ? String(group.tutorId) : String(user?.id || ''))
  const [date, setDate] = useState(start ? ukDateKey(start) : defaultDate || todayUk())
  const [time, setTime] = useState(start ? timeKey(start) : defaultTime || '16:00')
  const [duration, setDuration] = useState(group?.durationMins || 60)
  const [location, setLocation] = useState(group?.location || '')
  const [notes, setNotes] = useState(group?.notes || '')
  const [repeat, setRepeat] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState(11)
  const [applyTo, setApplyTo] = useState('this')
  const [selected, setSelected] = useState([])
  const [students, setStudents] = useState([])
  const [tutors, setTutors] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  const uid = useId()

  const close = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  useTopEscape(ref, close)

  useEffect(() => {
    if (!isEdit) api.get('/users/students').then(r => setStudents(r.data || [])).catch(() => setStudents([]))
    if (isManager) {
      api.get('/users').then(r => {
        const list = (r.data || []).filter(u => u.role === 'tutor' || u.id === user.id)
        setTutors(list)
      }).catch(() => setTutors([]))
    }
  }, [isEdit, isManager, user?.id])

  // Keep the current tutor selectable even if they aren't in the list yet
  const tutorOptions = useMemo(() => {
    const list = [...tutors]
    if (group?.tutor && !list.some(t => t.id === group.tutor.id)) list.unshift(group.tutor)
    return list
  }, [tutors, group])

  const whenValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('Give the group a title.')
    if (!whenValid) return setError('Choose a date and time.')
    const mins = parseInt(duration, 10)
    if (!Number.isInteger(mins) || mins < 5 || mins > 600) return setError('Duration must be between 5 and 600 minutes.')
    const scheduledAt = ukToIso(date, time) // UK time -> instant (handles BST/GMT)

    setSaving(true)
    try {
      let res
      if (isEdit) {
        // Only send what changed, so "this and following" doesn't overwrite
        // other fields on later sessions
        const payload = { applyTo: group.seriesId ? applyTo : 'this' }
        if (title.trim() !== group.title) payload.title = title.trim()
        if (scheduledAt !== new Date(group.scheduledAt).toISOString()) payload.scheduledAt = scheduledAt
        if (mins !== group.durationMins) payload.durationMins = mins
        if ((location.trim() || null) !== (group.location || null)) payload.location = location.trim() || null
        if ((notes.trim() || null) !== (group.notes || null)) payload.notes = notes.trim() || null
        if (isManager && tutorId && Number(tutorId) !== group.tutorId) payload.tutorId = Number(tutorId)
        if (Object.keys(payload).length === 1) { onClose(); return }
        res = await api.put(`/groups/${group.id}`, payload)
      } else {
        res = await api.post('/groups', {
          title: title.trim(),
          scheduledAt,
          durationMins: mins,
          location: location.trim() || null,
          notes: notes.trim() || null,
          ...(isManager && tutorId && { tutorId: Number(tutorId) }),
          repeatWeeks: repeat ? Math.min(26, Math.max(1, parseInt(repeatWeeks, 10) || 1)) : 0,
          studentIds: selected.map(s => s.id),
        })
      }
      onSaved?.(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the group session')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={close}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center"><Users className="icon" aria-hidden /></span>
            <h2 id={`${uid}-title`} className="section-title">{isEdit ? 'Edit group session' : 'New group session'}</h2>
          </div>
          <button type="button" onClick={close} className="btn-ghost p-1" aria-label="Close" title="Close"><X className="icon" aria-hidden /></button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="px-6 pb-4 space-y-4 overflow-y-auto">
            <div>
              <label className="label" htmlFor={`${uid}-name`}>Title</label>
              <input id={`${uid}-name`} value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="For example, Year 5 Maths" maxLength={120} autoFocus required />
            </div>

            {isManager && (
              <div>
                <label className="label" htmlFor={`${uid}-tutor`}>Tutor</label>
                <select id={`${uid}-tutor`} value={tutorId} onChange={e => setTutorId(e.target.value)} className="input">
                  {!tutorOptions.some(t => String(t.id) === tutorId) && <option value={tutorId}>{user?.id === Number(tutorId) ? `${user.name} (you)` : 'Choose a tutor'}</option>}
                  {tutorOptions.map(t => (
                    <option key={t.id} value={t.id}>{t.id === user.id ? `${t.name} (you)` : t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="label" htmlFor={`${uid}-date`}>Date</label>
                <input id={`${uid}-date`} type="date" value={date} onChange={e => setDate(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-time`}>Time (UK, 24h)</label>
                <input id={`${uid}-time`} type="time" step={300} lang="en-GB" value={time} onChange={e => setTime(e.target.value)} className="input" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor={`${uid}-duration`}>Duration (mins)</label>
                <input id={`${uid}-duration`} type="number" min={5} max={600} step={5} value={duration} onChange={e => setDuration(e.target.value)} className="input" required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor={`${uid}-location`}>Location</label>
              <input id={`${uid}-location`} list={`${uid}-locations`} value={location} onChange={e => setLocation(e.target.value)} className="input" placeholder="Retford, Doncaster, Online…" maxLength={120} />
              <datalist id={`${uid}-locations`}>
                {LOCATION_SUGGESTIONS.map(l => <option key={l} value={l} />)}
              </datalist>
              <div className="flex gap-1.5 mt-1.5" role="group" aria-label="Suggested locations">
                {LOCATION_SUGGESTIONS.map(l => (
                  <button key={l} type="button" onClick={() => setLocation(l)} className={`badge hover:bg-gray-200 ${location === l ? 'ring-1 ring-gray-400' : ''}`} aria-pressed={location === l}>{l}</button>
                ))}
              </div>
            </div>

            {!isEdit && (
              <div className="card-muted p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="accent-redwood-600" />
                  Repeat weekly
                </label>
                {repeat && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-700">
                    <label htmlFor={`${uid}-weeks`}>For the next</label>
                    <input id={`${uid}-weeks`} type="number" min={1} max={26} value={repeatWeeks} onChange={e => setRepeatWeeks(e.target.value)} className="input w-20 py-1" />
                    <span>weeks (up to 26)</span>
                  </div>
                )}
              </div>
            )}

            {!isEdit && (
              <StudentPicker students={students} selected={selected} onChange={setSelected} />
            )}
            {!isEdit && selected.length > 0 && (
              <p className="text-xs text-gray-500 -mt-2">Each student keeps their own plan and work. A student without a plan gets one automatically.</p>
            )}

            <div>
              <label className="label" htmlFor={`${uid}-notes`}>Notes (optional)</label>
              <textarea id={`${uid}-notes`} value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input resize-none" maxLength={2000} />
            </div>

            {isEdit && group.seriesId && (
              <fieldset className="card-muted p-3 space-y-1.5">
                <legend className="text-sm font-medium text-gray-800 float-left mb-1.5">Apply changes to</legend>
                <label className="clear-left flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name={`${uid}-apply`} checked={applyTo === 'this'} onChange={() => setApplyTo('this')} className="accent-redwood-600" />
                  This session only
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name={`${uid}-apply`} checked={applyTo === 'following'} onChange={() => setApplyTo('following')} className="accent-redwood-600" />
                  This and following sessions
                </label>
              </fieldset>
            )}

            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          </div>

          <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
            <button type="button" onClick={close} disabled={saving} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : repeat ? `Create ${Math.min(26, Math.max(1, parseInt(repeatWeeks, 10) || 1)) + 1} sessions` : 'Create group session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
