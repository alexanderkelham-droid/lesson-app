import { useState, useEffect, useMemo } from 'react'
import { ArrowRight, CalendarDays, CalendarX, Check, ChevronRight, CornerDownRight, Pencil, Plus, Printer, RotateCcw, Trash2, Users, History } from 'lucide-react'
import SheetLink from './SheetLink'
import CancelLessonModal from './CancelLessonModal'
import { useConfirm } from './ConfirmModal'
import api from '../../lib/api'
import { printPlanUrl } from '../../lib/print'
import { rescheduleSession, carryOverSession } from '../../lib/sessions'

function formatDateTime(d) {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const formatShort = d => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function toLocalISO(d) {
  // Format Date as "yyyy-MM-ddTHH:mm" for datetime-local inputs
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Score colours: >=70 forest, 40-69 amber, <40 red
function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

import PastLessonModal from './PastLessonModal'

export default function SessionsPanel({ planId, planTitle, canEdit = true, onChange }) {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [notice, setNotice]       = useState('')
  const [showPast, setShowPast]   = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft]         = useState({ scheduledAt: '', durationMins: 60, notes: '' })
  const [saving, setSaving]       = useState(false)
  const [cancelling, setCancelling] = useState(null) // session
  const [busyId, setBusyId]       = useState(null)
  const [confirm, confirmModal]   = useConfirm()
  const [groupTitles, setGroupTitles] = useState({}) // groupSessionId -> title

  // First load shows "Loading…"; later refreshes update in place
  function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    const range = `from=${new Date(Date.now() - 90 * 86400000).toISOString()}&to=${new Date(Date.now() + 90 * 86400000).toISOString()}`
    return api.get(`/sessions?${range}`)
      .then(res => {
        const mine = res.data.filter(s => s.lessonPlanId === planId)
        setSessions(mine)
        // Group titles for lessons that are part of a class (one cheap call)
        if (mine.some(s => s.groupSessionId)) {
          api.get(`/groups?${range}`)
            .then(g => setGroupTitles(Object.fromEntries((g.data || []).map(x => [x.id, x.title]))))
            .catch(() => {})
        }
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }

  async function refresh() {
    await load({ quiet: true })
    onChange?.()
  }

  useEffect(() => { load() }, [planId])

  function startAdd() {
    const next = new Date()
    next.setHours(15, 0, 0, 0)
    setDraft({ scheduledAt: toLocalISO(next), durationMins: 60, notes: '' })
    setEditingId(null)
    setShowAdd(true)
  }

  function startEdit(s) {
    setDraft({
      scheduledAt: toLocalISO(new Date(s.scheduledAt)),
      durationMins: s.durationMins || 60,
      notes: s.notes || ''
    })
    setEditingId(s.id)
    setShowAdd(true)
  }

  async function saveDraft() {
    if (!draft.scheduledAt) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        scheduledAt: new Date(draft.scheduledAt).toISOString(),
        durationMins: draft.durationMins ? parseInt(draft.durationMins) : null,
        notes: draft.notes || null
      }
      if (editingId) {
        const { scheduledAt, ...extra } = payload
        const res = await rescheduleSession(editingId, scheduledAt, extra, confirm)
        if (!res) return // kept as it was; leave the form open
        if (res.merged) setNotice(`Merged into the lesson on ${formatShort(res.scheduledAt)}. Its planned work moved across.`)
      } else {
        await api.post('/sessions', { lessonPlanId: planId, ...payload })
      }
      setShowAdd(false)
      setEditingId(null)
      await refresh()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function markAttended(s) {
    try {
      await api.put(`/sessions/${s.id}`, { markAttended: true })
      await refresh()
    } catch (e) { setError(e.response?.data?.error || 'Failed to update') }
  }

  async function unmarkAttended(s) {
    try {
      await api.put(`/sessions/${s.id}`, { attendedAt: null })
      await refresh()
    } catch (e) { setError(e.response?.data?.error || 'Failed to update') }
  }

  async function deleteSession(s) {
    const ok = await confirm({
      title: 'Delete this session?',
      message: `The session on ${formatShort(s.scheduledAt)} will be removed. Any planned work in it goes back to unscheduled.`,
      confirmLabel: 'Delete session',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/sessions/${s.id}`)
      await refresh()
    } catch (e) { setError(e.response?.data?.error || 'Failed to delete') }
  }

  async function carryOver(s) {
    setBusyId(s.id)
    setError('')
    setNotice('')
    try {
      const r = await carryOverSession(s.id)
      setNotice(r.carriedOver > 0
        ? `${r.carriedOver} unfinished item${r.carriedOver === 1 ? '' : 's'} copied into the next lesson.`
        : 'Nothing left to move: this lesson\'s work is already done or carried over.')
      await refresh()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not move the work')
    } finally {
      setBusyId(null)
    }
  }

  async function moveItem(item, target) {
    setError('')
    setNotice('')
    try {
      await api.put(`/lesson-plans/${planId}/items/${item.id}`, { sessionId: target === 'unscheduled' ? null : Number(target) })
      const dest = target === 'unscheduled' ? 'Unscheduled' : formatShort(sessions.find(s => s.id === Number(target))?.scheduledAt)
      setNotice(`Moved "${item.customTitle || item.sheet?.title || 'item'}" to ${dest}.`)
      await refresh()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not move the item')
    }
  }

  const now = new Date()
  const upcoming = sessions.filter(s => !s.attendedAt && new Date(s.scheduledAt) >= now)
  const past     = sessions.filter(s => s.attendedAt || new Date(s.scheduledAt) < now)
                            .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))

  // Items already copied forward (so a missed lesson doesn't offer to move them twice)
  const carriedIds = useMemo(() => {
    const set = new Set()
    for (const s of sessions) for (const it of s.items || []) if (it.carriedFromId) set.add(it.carriedFromId)
    return set
  }, [sessions])

  const rowProps = {
    canEdit,
    upcoming,
    groupTitles,
    carriedIds,
    busyId,
    onEdit: startEdit,
    onAttend: markAttended,
    onDelete: deleteSession,
    onCancel: setCancelling,
    onCarryOver: carryOver,
    onMoveItem: moveItem,
  }

  return (
    <div className="card">
      {showPast && (
        <PastLessonModal
          planId={planId}
          onClose={() => setShowPast(false)}
          onSaved={r => { setNotice(`Past lesson saved: ${r.added} item${r.added === 1 ? '' : 's'}${r.carriedOver ? `, ${r.carriedOver} unfinished moved to the next lesson` : ''}.`); refresh() }}
        />
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-title">Sessions</h3>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowPast(true)} className="btn-ghost btn-sm" title="Add a lesson that has already happened">
              <History className="icon-sm" aria-hidden /> Record past lesson
            </button>
            <button onClick={startAdd} className="btn-secondary btn-sm">
              <Plus className="icon-sm" aria-hidden /> Schedule session
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {notice && <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-3 flex items-start gap-2"><Check className="icon mt-0.5" aria-hidden /><span>{notice}</span></p>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          {/* Add/edit form */}
          {showAdd && (
            <div className="card-muted p-4 mb-4 space-y-3">
              <p className="eyebrow">{editingId ? 'Edit or reschedule session' : 'New session'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs" htmlFor="session-when">When</label>
                  <input
                    id="session-when"
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={e => setDraft({ ...draft, scheduledAt: e.target.value })}
                    className="input text-xs py-1.5 mt-0.5"
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor="session-duration">Duration (mins)</label>
                  <input
                    id="session-duration"
                    type="number"
                    value={draft.durationMins}
                    onChange={e => setDraft({ ...draft, durationMins: e.target.value })}
                    className="input text-xs py-1.5 mt-0.5"
                  />
                </div>
              </div>
              <div>
                <label className="label text-xs" htmlFor="session-notes">Notes (optional)</label>
                <textarea
                  id="session-notes"
                  value={draft.notes}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  className="input text-xs py-1.5 mt-0.5 resize-none"
                  rows={2}
                  placeholder="What was covered, observations, next steps…"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowAdd(false); setEditingId(null) }} className="btn-secondary btn-sm">Cancel</button>
                <button onClick={saveDraft} disabled={saving} className="btn-primary btn-sm">
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Schedule'}
                </button>
              </div>
            </div>
          )}

          {sessions.length === 0 && !showAdd && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2">
                <CalendarDays className="icon-lg" aria-hidden />
              </div>
              <p className="text-sm font-medium text-gray-900">No sessions yet</p>
              <p className="text-sm text-gray-500 mt-0.5">Schedule one to track lessons.</p>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-4">
              <p className="eyebrow mb-2">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map(s => (
                  <SessionRow key={s.id} session={s} isPast={false} {...rowProps} />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Past</p>
              <div className="space-y-2">
                {past.slice(0, 8).map(s => (
                  <SessionRow key={s.id} session={s} isPast onUnattend={unmarkAttended} {...rowProps} />
                ))}
                {past.length > 8 && <p className="text-xs text-gray-500 text-center pt-1">+{past.length - 8} older sessions</p>}
              </div>
            </div>
          )}
        </>
      )}

      {cancelling && (
        <CancelLessonModal
          session={cancelling}
          itemCount={(cancelling.items || []).filter(i => i.status !== 'completed').length}
          onClose={() => setCancelling(null)}
          onDone={r => {
            setNotice(r?.moved
              ? `Lesson cancelled. ${r.moved} item${r.moved === 1 ? '' : 's'} moved ${r.movedTo ? `to ${formatShort(r.movedTo.scheduledAt)}` : 'to unscheduled'}.`
              : 'Lesson cancelled.')
            refresh()
          }}
        />
      )}
      {confirmModal}
    </div>
  )
}

function SessionRow({ session, canEdit, upcoming, groupTitles = {}, carriedIds, busyId, onEdit, onAttend, onUnattend, onDelete, onCancel, onCarryOver, onMoveItem, isPast }) {
  const attended = !!session.attendedAt
  const missed = isPast && !attended
  const cancelledLabel = !attended && /^Cancelled/.test(session.notes || '')
  const items = (session.items || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  const completedCount = items.filter(i => i.status === 'completed').length
  const toCarry = missed ? items.filter(i => i.status !== 'completed' && !carriedIds.has(i.id)).length : 0
  const moveTargets = upcoming.filter(s => s.id !== session.id)
  const when = formatShort(session.scheduledAt)
  const iconBtn = 'p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md'

  return (
    <div className={`border rounded-lg p-3 ${
      attended ? 'bg-white border-forest-100' : missed ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{formatDateTime(session.scheduledAt)}</p>
            {session.durationMins && <span className="text-xs text-gray-500">· {session.durationMins} min</span>}
            {attended && <span className="badge-success">Attended</span>}
            {missed && !cancelledLabel && <span className="badge-warning">No record</span>}
            {cancelledLabel && <span className="badge">Cancelled</span>}
            {session.groupSessionId && (
              <span className="badge" title="This lesson is part of a group session">
                <Users className="icon-sm" aria-hidden />
                {groupTitles[session.groupSessionId] ? `Group: ${groupTitles[session.groupSessionId]}` : 'Group lesson'}
              </span>
            )}
            {items.length > 0 && (
              <span className="text-xs text-gray-600">
                · <strong>{completedCount}/{items.length}</strong> done
              </span>
            )}
          </div>
          {session.notes && (
            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{session.notes}</p>
          )}
          {canEdit && toCarry > 0 && (
            <button
              onClick={() => onCarryOver(session)}
              disabled={busyId === session.id}
              className="btn-secondary btn-sm mt-2"
              title="Copy this missed lesson's unfinished work into the next lesson"
            >
              <ArrowRight className="icon-sm" aria-hidden />
              {busyId === session.id ? 'Moving…' : `Move work to next lesson (${toCarry})`}
            </button>
          )}
          {/* Items in this session (history record) */}
          {items.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 inline-flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="icon-sm group-open:rotate-90 transition-transform" aria-hidden />
                Items in this session
              </summary>
              <ul className="mt-2 space-y-1.5 ml-3">
                {items.map(it => {
                  const isDone = it.status === 'completed'
                  const resp = it.studentResponses?.[0]
                  const title = it.customTitle || it.sheet?.title || 'Untitled'
                  const canMove = canEdit && !attended && !isDone
                  return (
                    <li key={it.id} className="text-xs flex items-start gap-2 flex-wrap sm:flex-nowrap">
                      <span className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded-full flex items-center justify-center ${
                        isDone ? 'bg-forest-600 text-white' : 'bg-gray-200'
                      }`}>
                        {isDone ? <Check className="w-2.5 h-2.5" strokeWidth={3} aria-label="Completed" /> : <span className="w-1 h-1 rounded-full bg-gray-400" aria-hidden />}
                      </span>
                      <span className="flex-1 min-w-0 pt-0.5">
                        <SheetLink sheetId={it.sheet?.id} className={`${isDone ? 'text-gray-700' : 'text-gray-500'} truncate`}>{title}</SheetLink>
                        {resp?.score != null && (
                          <span className={`ml-2 font-semibold ${scoreClass(resp.score)}`}>
                            {Math.round(resp.score)}%
                          </span>
                        )}
                        {it.carriedFromId && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-amber-800 italic"><CornerDownRight className="w-3 h-3" aria-hidden />carried over</span>
                        )}
                      </span>
                      {canMove && (
                        <select
                          value=""
                          onChange={e => e.target.value && onMoveItem(it, e.target.value)}
                          className="input text-xs py-0.5 px-1.5 w-auto max-w-[11rem] flex-shrink-0"
                          aria-label={`Move ${title} to another lesson`}
                        >
                          <option value="">Move to…</option>
                          {moveTargets.map(s => (
                            <option key={s.id} value={s.id}>{formatShort(s.scheduledAt)}</option>
                          ))}
                          <option value="unscheduled">Unscheduled</option>
                        </select>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          <a
            href={printPlanUrl(session.lessonPlanId, { session: session.id })}
            target="_blank"
            rel="noopener noreferrer"
            className={iconBtn}
            title="Print this session's sheets"
            aria-label={`Print the sheets for ${when}`}
          >
            <Printer className="icon" aria-hidden />
          </a>
        {canEdit && (
          <>
            {!attended && (
              <button onClick={() => onAttend(session)} className="p-1.5 text-forest-700 hover:bg-forest-50 rounded-md" title="Mark attended" aria-label={`Mark ${when} attended`}>
                <Check className="icon" aria-hidden />
              </button>
            )}
            {attended && onUnattend && (
              <button onClick={() => onUnattend(session)} className={iconBtn} title="Unmark attended" aria-label={`Unmark ${when} attended`}>
                <RotateCcw className="icon" aria-hidden />
              </button>
            )}
            <button onClick={() => onEdit(session)} className={iconBtn} title="Edit or reschedule" aria-label={`Edit or reschedule ${when}`}>
              <Pencil className="icon" aria-hidden />
            </button>
            {!attended && !cancelledLabel && (
              <button onClick={() => onCancel(session)} className={iconBtn} title="Cancel lesson" aria-label={`Cancel the lesson on ${when}`}>
                <CalendarX className="icon" aria-hidden />
              </button>
            )}
            <button onClick={() => onDelete(session)} className="p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-md" title="Delete" aria-label={`Delete the session on ${when}`}>
              <Trash2 className="icon" aria-hidden />
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  )
}
