import { useState, useEffect, useRef, useId, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarX, Check, ChevronRight, ClipboardCheck, CornerDownRight, FileText, MapPin, Pencil,
  Plus, Repeat, StickyNote, Unlink, UserMinus, UserPlus, Users, X,
} from 'lucide-react'
import api from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { downloadOriginalsPack } from '../../lib/print'
import { useTopEscape } from '../../lib/escape'
import { useConfirm } from './ConfirmModal'
import SheetLink from './SheetLink'
import GroupSessionModal, { StudentPicker, MAX_GROUP_SIZE } from './GroupSessionModal'
import { fmtDayLong, fmtTime } from '../../lib/datetime'

const CUSTOM_LABELS = {
  ixl_maths: 'IXL Maths', ixl_english: 'IXL English', corbett_maths: 'Corbett Maths',
  eleven_plus: '11+', homework: 'Homework', paper: 'Paper activity', other: 'Custom task',
}

// Day and times in UK time, whatever the device's zone
export function formatGroupWhen(g) {
  const start = new Date(g.scheduledAt)
  const end = new Date(start.getTime() + (g.durationMins || 60) * 60000)
  const t = fmtTime
  return {
    day: fmtDayLong(start),
    time: `${t(start)} to ${t(end)}`,
    start: t(start),
  }
}

function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

function StatusBadge({ status }) {
  if (status === 'completed') return <span className="badge-success">Completed</span>
  if (status === 'in_progress') return <span className="badge-warning">In progress</span>
  return <span className="badge">Not started</span>
}

// Small modal shell used by the panel's sub-dialogs (Escape = close when on top)
function SubDialog({ title, icon: Icon, onClose, busy, children, footer }) {
  const ref = useRef(null)
  const titleId = useId()
  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  useTopEscape(ref, close)
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-gray-900/40 p-4" onClick={close}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {Icon && <span className="w-9 h-9 rounded-full bg-redwood-50 text-redwood-700 flex items-center justify-center"><Icon className="icon" aria-hidden /></span>}
            <h2 id={titleId} className="section-title">{title}</h2>
          </div>
          <button type="button" onClick={close} className="btn-ghost p-1" aria-label="Close" title="Close"><X className="icon" aria-hidden /></button>
        </div>
        {children}
        <div className="flex justify-end gap-2 mt-5">{footer}</div>
      </div>
    </div>
  )
}

function ApplyToFields({ value, onChange, name }) {
  return (
    <fieldset className="space-y-1.5 mb-1">
      <legend className="text-sm font-medium text-gray-800 mb-1">Apply to</legend>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="radio" name={name} checked={value === 'this'} onChange={() => onChange('this')} className="accent-redwood-600" />
        This session only
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="radio" name={name} checked={value === 'following'} onChange={() => onChange('following')} className="accent-redwood-600" />
        This and following sessions
      </label>
    </fieldset>
  )
}

/**
 * Cancel a group session: each child's unfinished work moves on (or goes
 * back to unscheduled). Calls onDone(result) after a successful cancel.
 */
export function CancelGroupDialog({ group, onClose, onDone }) {
  const [moveWork, setMoveWork] = useState('next')
  const [applyTo, setApplyTo] = useState('this')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = useId()
  const when = formatGroupWhen(group)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/groups/${group.id}/cancel`, { moveWork, applyTo: group.seriesId ? applyTo : 'this' })
      onDone?.(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Could not cancel the group session')
      setBusy(false)
    }
  }

  return (
    <SubDialog
      title="Cancel group session"
      icon={CalendarX}
      onClose={onClose}
      busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Keep session</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Cancelling…' : 'Cancel session'}</button>
      </>}
    >
      <p className="text-sm text-gray-600 mb-4">{group.title} · {when.day}, {when.start}</p>
      <fieldset className="space-y-2 mb-4">
        <legend className="text-sm font-medium text-gray-800 mb-1">What should happen to each student's planned work?</legend>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="radio" name={`${name}-move`} checked={moveWork === 'next'} onChange={() => setMoveWork('next')} className="mt-0.5 accent-redwood-600" />
          <span><span className="font-medium">Move to their next lesson</span><span className="block text-gray-500 text-xs">Recommended, so nothing gets forgotten.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="radio" name={`${name}-move`} checked={moveWork === 'unscheduled'} onChange={() => setMoveWork('unscheduled')} className="mt-0.5 accent-redwood-600" />
          <span><span className="font-medium">Keep it unscheduled</span><span className="block text-gray-500 text-xs">You'll assign it to a lesson later.</span></span>
        </label>
      </fieldset>
      {group.seriesId && <ApplyToFields value={applyTo} onChange={setApplyTo} name={`${name}-apply`} />}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>}
    </SubDialog>
  )
}

/** Quick register: tick who is here, save once. */
export function GroupRegisterDialog({ group, onClose, onDone }) {
  const [present, setPresent] = useState(() => new Set(group.members.filter(m => m.attendedAt).map(m => m.student.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggle(id) {
    setPresent(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const ids = group.members.map(m => m.student.id)
      const r = await api.post(`/groups/${group.id}/attendance`, {
        present: ids.filter(id => present.has(id)),
        absent: ids.filter(id => !present.has(id)),
      })
      onDone?.(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save the register')
      setBusy(false)
    }
  }

  return (
    <SubDialog
      title={`Register: ${group.title}`}
      icon={ClipboardCheck}
      onClose={onClose}
      busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancel</button>
        <button type="button" onClick={submit} disabled={busy || group.members.length === 0} className="btn-primary">{busy ? 'Saving…' : 'Save register'}</button>
      </>}
    >
      {group.members.length === 0 ? (
        <p className="text-sm text-gray-600">This group has no students yet.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">Tick everyone who is here. Present students' unfinished work carries to their next lesson.</p>
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {group.members.map(m => (
              <li key={m.student.id}>
                <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={present.has(m.student.id)} onChange={() => toggle(m.student.id)} className="w-4 h-4 accent-forest-600" />
                  <span className="flex-1 text-sm font-medium text-gray-900">{m.student.name}</span>
                  {present.has(m.student.id) ? <span className="badge-success">Present</span> : <span className="badge">Absent</span>}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>}
    </SubDialog>
  )
}

/**
 * Drill-down for one group session. `onChanged(kind)` fires after any change;
 * kind is 'deleted' when the group no longer exists (cancelled / ungrouped).
 */
export default function GroupDetailPanel({ groupId, onClose, onChanged }) {
  const { user } = useAuth()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'
  const [group, setGroup] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [absent, setAbsent] = useState(() => new Set()) // marked absent this visit (the API only stores attendance)
  const [busyId, setBusyId] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addSel, setAddSel] = useState([])
  const [addApply, setAddApply] = useState('this')
  const [allStudents, setAllStudents] = useState(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removeApply, setRemoveApply] = useState('this')
  const [confirm, confirmModal] = useConfirm()
  const ref = useRef(null)
  const titleId = useId()
  const nameId = useId()

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/groups/${groupId}`)
      setGroup(r.data)
      setLoadError('')
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Could not load this group session')
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  const busyAny = busyId !== null || printing
  const close = useCallback(() => { if (!busyAny) onClose() }, [busyAny, onClose])
  useTopEscape(ref, close)

  function changed(kind) { onChanged?.(kind) }

  async function setAttendance(member, present) {
    setBusyId(member.student.id)
    setError('')
    setNotice('')
    try {
      const r = await api.post(`/groups/${groupId}/attendance`, present ? { present: [member.student.id] } : { absent: [member.student.id] })
      setGroup(r.data)
      setAbsent(prev => {
        const next = new Set(prev)
        present ? next.delete(member.student.id) : next.add(member.student.id)
        return next
      })
      if (present && r.data.carriedOver > 0) setNotice(`${member.student.name} marked present. ${r.data.carriedOver} unfinished item${r.data.carriedOver === 1 ? '' : 's'} carried to their next lesson.`)
      changed()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not update attendance')
    } finally {
      setBusyId(null)
    }
  }

  async function printOriginals() {
    setPrinting(true)
    setError('')
    setNotice('')
    const summary = await downloadOriginalsPack(`/groups/${groupId}/originals`, { quiet: true })
    setPrinting(false)
    if (summary?.error) setError(summary.error)
    else if (summary?.empty) setError('None of these students has sheets with an original PDF in this lesson.')
    else if (summary) {
      const missing = Array.isArray(summary.missing) ? summary.missing.length : summary.missing || 0
      setNotice(`Print pack ready: ${summary.included} sheet${summary.included === 1 ? '' : 's'}, ${summary.pages} page${summary.pages === 1 ? '' : 's'}${missing ? `, ${missing} without an original (listed on the cover pages)` : ''}.`)
    }
  }

  async function openAdd() {
    setAdding(true)
    setAddSel([])
    setAddApply('this')
    if (!allStudents) {
      try { setAllStudents((await api.get('/users/students')).data || []) } catch { setAllStudents([]) }
    }
  }

  async function saveAdd() {
    if (!addSel.length) return
    setBusyId('add')
    setError('')
    try {
      const r = await api.post(`/groups/${groupId}/members`, { studentIds: addSel.map(s => s.id), applyTo: group.seriesId ? addApply : 'this' })
      setGroup(r.data)
      setAdding(false)
      setNotice(`${addSel.map(s => s.name).join(', ')} added.`)
      changed()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not add the students')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRemove() {
    const m = removeTarget
    setBusyId('remove')
    setError('')
    try {
      await api.delete(`/groups/${groupId}/members/${m.student.id}`, { params: { applyTo: group.seriesId ? removeApply : 'this' } })
      setRemoveTarget(null)
      setNotice(`${m.student.name} removed from the group. Their planned work stays on their own lesson.`)
      await load()
      changed()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not remove the student')
    } finally {
      setBusyId(null)
    }
  }

  async function ungroup() {
    const ok = await confirm({
      title: 'Ungroup this session?',
      message: 'The group slot is removed. Each student keeps their own lesson at the same time, with their planned work.',
      confirmLabel: 'Ungroup',
    })
    if (!ok) return
    setBusyId('ungroup')
    try {
      await api.delete(`/groups/${groupId}`)
      changed('deleted')
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not ungroup the session')
      setBusyId(null)
    }
  }

  function toggleExpanded(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const when = group && formatGroupWhen(group)
  const full = group && group.members.length >= MAX_GROUP_SIZE

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={close}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="min-w-0 flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center flex-shrink-0"><Users className="icon-lg" aria-hidden /></span>
            <div className="min-w-0">
              <p className="eyebrow">Group session</p>
              <h2 id={titleId} className="section-title truncate">{group?.title || (loadError ? 'Group session' : 'Loading…')}</h2>
              {group && (
                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                  <p><span className="font-medium text-gray-800">{when.day}</span> · <span className="tabular-nums">{when.time}</span> ({group.durationMins} min)</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>Tutor: {group.tutor?.name || 'Unassigned'}</span>
                    {group.location && <span className="inline-flex items-center gap-1"><MapPin className="icon-sm" aria-hidden />{group.location}</span>}
                    {group.seriesId && <span className="inline-flex items-center gap-1"><Repeat className="icon-sm" aria-hidden />Repeats weekly</span>}
                  </p>
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={close} className="btn-ghost p-1 -mr-2 -mt-1" aria-label="Close" title="Close"><X className="icon" aria-hidden /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          {loadError && (
            <div className="text-center py-6">
              <p className="text-sm text-red-700 mb-3" role="alert">{loadError}</p>
              <button onClick={load} className="btn-secondary btn-sm">Retry</button>
            </div>
          )}
          {!group && !loadError && <p className="text-sm text-gray-500">Loading…</p>}

          {group && (
            <>
              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setEditing(true)} className="btn-secondary btn-sm"><Pencil className="icon-sm" aria-hidden /> Edit</button>
                <button onClick={printOriginals} disabled={printing || group.members.length === 0} className="btn-secondary btn-sm" title="One PDF of every student's original worksheets, a cover page per child">
                  <FileText className="icon-sm" aria-hidden /> {printing ? 'Building…' : 'Print originals for the class'}
                </button>
                <button onClick={openAdd} disabled={full} className="btn-secondary btn-sm" title={full ? `Groups are up to ${MAX_GROUP_SIZE} students` : undefined}>
                  <UserPlus className="icon-sm" aria-hidden /> Add students
                </button>
                <button onClick={() => setCancelOpen(true)} className="btn-secondary btn-sm"><CalendarX className="icon-sm" aria-hidden /> Cancel session</button>
                <button onClick={ungroup} disabled={busyId === 'ungroup'} className="btn-ghost btn-sm" title="Remove the group slot; students keep their own lessons">
                  <Unlink className="icon-sm" aria-hidden /> Ungroup
                </button>
              </div>

              {group.notes && (
                <p className="text-sm text-gray-600 italic mb-4 flex items-start gap-1.5">
                  <StickyNote className="icon-sm mt-0.5 text-gray-400 not-italic" aria-hidden />
                  <span className="whitespace-pre-wrap">{group.notes}</span>
                </p>
              )}

              {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
              {notice && <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-3 flex items-start gap-2"><Check className="icon mt-0.5" aria-hidden /><span>{notice}</span></p>}

              {/* Add students inline */}
              {adding && (
                <div className="card-muted p-4 mb-4 space-y-3">
                  <StudentPicker
                    label="Add students"
                    students={allStudents || []}
                    selected={addSel}
                    onChange={setAddSel}
                    exclude={group.members.map(m => m.student.id)}
                    max={MAX_GROUP_SIZE - group.members.length}
                  />
                  {group.seriesId && <ApplyToFields value={addApply} onChange={setAddApply} name={`${nameId}-add`} />}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAdding(false)} className="btn-secondary btn-sm" disabled={busyId === 'add'}>Cancel</button>
                    <button onClick={saveAdd} className="btn-primary btn-sm" disabled={!addSel.length || busyId === 'add'}>
                      <Plus className="icon-sm" aria-hidden /> {busyId === 'add' ? 'Adding…' : addSel.length > 1 ? `Add ${addSel.length} to group` : 'Add to group'}
                    </button>
                  </div>
                </div>
              )}

              {/* Members */}
              <div className="flex items-center justify-between mb-2">
                <p className="eyebrow">Students ({group.members.length} of {MAX_GROUP_SIZE})</p>
                <p className="text-xs text-gray-500">{group.members.filter(m => m.attendedAt).length} present</p>
              </div>
              {group.members.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2"><Users className="icon-lg" aria-hidden /></div>
                  <p className="text-sm font-medium text-gray-900">No students yet</p>
                  <p className="text-sm text-gray-500 mt-0.5 mb-3">Add up to {MAX_GROUP_SIZE} students to this class.</p>
                  <button onClick={openAdd} className="btn-primary btn-sm"><UserPlus className="icon-sm" aria-hidden /> Add students</button>
                </div>
              ) : (
                <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {group.members.map(m => {
                    const sid = m.student.id
                    const present = !!m.attendedAt
                    const isAbsent = !present && absent.has(sid)
                    const open = expanded.has(sid)
                    const panelId = `${nameId}-m-${sid}`
                    return (
                      <li key={sid} className="p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(sid)}
                            className="p-1 -ml-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            aria-expanded={open}
                            aria-controls={panelId}
                            aria-label={`${open ? 'Hide' : 'Show'} ${m.student.name}'s planned work`}
                            title={open ? 'Hide planned work' : 'Show planned work'}
                          >
                            <ChevronRight className={`icon transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
                          </button>
                          <div className="flex-1 min-w-[9rem]">
                            <Link to={`${basePath}/students/${sid}`} className="text-sm font-medium text-gray-900 hover:text-redwood-700 hover:underline underline-offset-2">{m.student.name}</Link>
                            <p className="text-xs text-gray-500 truncate">
                              {m.itemCount > 0 ? <><span className="tabular-nums font-medium text-gray-700">{m.completedCount}/{m.itemCount}</span> done</> : 'No work planned'}
                              {m.student.subjectFocus && <span className="capitalize"> · {m.student.subjectFocus}</span>}
                            </p>
                          </div>
                          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="group" aria-label={`Attendance for ${m.student.name}`}>
                            <button
                              type="button"
                              onClick={() => !present && setAttendance(m, true)}
                              disabled={busyId === sid}
                              aria-pressed={present}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 ${present ? 'bg-forest-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                              {present && <Check className="icon-sm" aria-hidden />} Present
                            </button>
                            <button
                              type="button"
                              onClick={() => (present || !isAbsent) && setAttendance(m, false)}
                              disabled={busyId === sid}
                              aria-pressed={isAbsent}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium ${isAbsent ? 'bg-white text-gray-900 shadow-card' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                              Absent
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setRemoveApply('this'); setRemoveTarget(m) }}
                            className="p-1.5 rounded-md text-gray-500 hover:text-red-700 hover:bg-red-50"
                            aria-label={`Remove ${m.student.name} from the group`}
                            title="Remove from group"
                          >
                            <UserMinus className="icon" aria-hidden />
                          </button>
                        </div>

                        {open && (
                          <div id={panelId} className="mt-2 ml-7 pl-3 border-l border-gray-100">
                            {m.items?.length ? (
                              <ul className="space-y-1.5">
                                {m.items.map(it => {
                                  const resp = it.studentResponses?.[0]
                                  const title = it.sheet?.title || it.customTitle || 'Untitled'
                                  return (
                                    <li key={it.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <SheetLink sheetId={it.sheet?.id} className="text-gray-800 min-w-0 truncate max-w-[18rem]">{title}</SheetLink>
                                      {!it.sheet && <span className="badge">{CUSTOM_LABELS[it.customType] || 'Custom task'}</span>}
                                      {it.sheet?.difficultyLevel && <span className="text-xs text-gray-500">L{it.sheet.difficultyLevel}</span>}
                                      <StatusBadge status={it.status} />
                                      {resp?.score != null && <span className={`text-xs font-semibold tabular-nums ${scoreClass(resp.score)}`}>{Math.round(resp.score)}%</span>}
                                      {it.carriedFromId && <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-800 italic"><CornerDownRight className="w-3 h-3" aria-hidden />carried over</span>}
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : (
                              <p className="text-xs text-gray-500">Nothing planned for this lesson yet.</p>
                            )}
                            {m.notes && <p className="text-xs text-gray-600 italic mt-2 whitespace-pre-wrap">{m.notes}</p>}
                            <Link to={`${basePath}/lesson-plans/${m.planId}/builder`} className="link text-xs font-medium inline-flex items-center gap-1 mt-2">
                              <Plus className="icon-sm" aria-hidden /> Add work in {m.student.name.split(' ')[0]}'s plan
                            </Link>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-dialogs render outside the panel so clicks don't bubble into it */}
      <div onClick={e => e.stopPropagation()}>
        {editing && group && (
          <GroupSessionModal
            group={group}
            onClose={() => setEditing(false)}
            onSaved={r => {
              setEditing(false)
              setNotice(r?.updated > 1 ? `Saved for ${r.updated} sessions.` : 'Changes saved.')
              load()
              changed()
            }}
          />
        )}
        {cancelOpen && group && (
          <CancelGroupDialog
            group={group}
            onClose={() => setCancelOpen(false)}
            onDone={() => { setCancelOpen(false); changed('deleted'); onClose() }}
          />
        )}
        {removeTarget && (
          <SubDialog
            title={`Remove ${removeTarget.student.name}?`}
            icon={UserMinus}
            onClose={() => setRemoveTarget(null)}
            busy={busyId === 'remove'}
            footer={<>
              <button type="button" onClick={() => setRemoveTarget(null)} disabled={busyId === 'remove'} className="btn-secondary">Keep in group</button>
              <button type="button" onClick={confirmRemove} disabled={busyId === 'remove'} className="btn-danger">{busyId === 'remove' ? 'Removing…' : 'Remove from group'}</button>
            </>}
          >
            <p className="text-sm text-gray-600 mb-3">Their lesson leaves the group. If it has planned work it stays as an individual lesson at the same time; an empty lesson is removed.</p>
            {group?.seriesId && <ApplyToFields value={removeApply} onChange={setRemoveApply} name={`${nameId}-remove`} />}
          </SubDialog>
        )}
        {confirmModal}
      </div>
    </div>
  )
}
