import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  AlertTriangle, ArrowLeft, Check, ClipboardList, Eraser, FileText, Inbox, Plus, Printer, Sparkles, Users, X
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import { useConfirm } from '../shared/ConfirmModal'
import SheetPreviewModal from '../shared/SheetPreviewModal'
import AiPlanModal from '../shared/AiPlanModal'
import PrintPackMenu from '../print/PrintPackMenu'
import useSheetHistory, { repeatConfirmOptions } from '../../hooks/useSheetHistory'
import api from '../../lib/api'
import { printPlanUrl } from '../../lib/print'
import { ukToIso, fmtTime } from '../../lib/datetime'
import { sameDayOrdinals, sessionLabel } from '../../lib/sessions'
import { customTypeLabel } from '../../lib/customTypes'
import LessonPicker, { isOver } from '../planner/LessonPicker'
import LessonItem, { itemTitle } from '../planner/LessonItem'
import SheetLibraryPanel from '../planner/SheetLibraryPanel'
import BringForwardPanel from '../planner/BringForwardPanel'
import CustomTaskModal from '../planner/CustomTaskModal'
import PlanSettings from '../planner/PlanSettings'
import NewPlanForm from '../planner/NewPlanForm'

const bySeq = (a, b) => a.sequenceOrder - b.sequenceOrder
const byTime = (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The planner opens on the next lesson that hasn't finished, else the most
// recent lesson, else the unscheduled pool.
function defaultLessonKey(sessions) {
  const now = Date.now()
  const next = sessions.find(s => !isOver(s, now))
  if (next) return next.id
  if (sessions.length) return sessions[sessions.length - 1].id
  return 'unscheduled'
}

export default function LessonPlanBuilder() {
  const { planId } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'

  if (!planId) {
    return (
      <>
        <Navbar title="New lesson plan" />
        <NewPlanForm user={user} basePath={basePath} initialStudentId={searchParams.get('studentId') || ''} />
      </>
    )
  }
  return <SessionPlanner key={planId} planId={planId} basePath={basePath} user={user} />
}

function SessionPlanner({ planId, basePath, user }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isManager = user?.role === 'manager'

  const [plan, setPlan] = useState(null)
  const [sheets, setSheets] = useState([])
  const [tutors, setTutors] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { text, undo? }
  const [savedFlash, setSavedFlash] = useState('')
  const flashTimer = useRef(null)

  const [showCustom, setShowCustom] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [previewSheetId, setPreviewSheetId] = useState(null)
  const [confirm, confirmModal] = useConfirm()
  const [sheetHistory, reloadHistory] = useSheetHistory(planId)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Loading ──
  const refresh = useCallback(async () => {
    const res = await api.get(`/lesson-plans/${planId}`)
    setPlan(res.data)
    return res.data
  }, [planId])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get(`/lesson-plans/${planId}`),
      api.get('/sheets').catch(() => ({ data: [] })),
      api.get('/users').catch(() => ({ data: [] })),
    ])
      .then(([planRes, sheetsRes, usersRes]) => {
        if (cancelled) return
        setPlan(planRes.data)
        setSheets(sheetsRes.data || [])
        setTutors((usersRes.data || []).filter(u => u.role === 'tutor' || (u.role === 'manager' && u.id === planRes.data.tutorId)))
      })
      .catch(e => {
        if (cancelled) return
        if (e.response?.status === 404 || e.response?.status === 403) setNotFound(true)
        else setError('Could not load the lesson plan')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [planId])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  // ── Derived ──
  const sessions = useMemo(() => (plan?.sessions || []).slice().sort(byTime), [plan])
  const items = useMemo(() => (plan?.items || []).slice().sort(bySeq), [plan])
  const ordinals = useMemo(() => sameDayOrdinals(sessions), [sessions])

  const param = searchParams.get('session')
  const selectedKey = useMemo(() => {
    if (param === 'unscheduled') return 'unscheduled'
    const id = Number(param)
    if (id && sessions.some(s => s.id === id)) return id
    return defaultLessonKey(sessions)
  }, [param, sessions])
  const selectedSession = sessions.find(s => s.id === selectedKey) || null
  const isUnscheduled = selectedKey === 'unscheduled'
  const targetSessionId = isUnscheduled ? null : selectedKey
  const lessonLabel = isUnscheduled ? 'Unscheduled' : sessionLabel(selectedSession, ordinals)

  const lessonItems = useMemo(
    () => items.filter(i => (isUnscheduled ? i.sessionId == null : i.sessionId === selectedKey)),
    [items, isUnscheduled, selectedKey]
  )
  const inLesson = useMemo(() => new Set(lessonItems.map(i => i.sheetId).filter(Boolean)), [lessonItems])

  const counts = useMemo(() => {
    const c = {}
    for (const it of items) {
      if (it.sessionId == null) continue
      const e = c[it.sessionId] || (c[it.sessionId] = { total: 0, done: 0 })
      e.total++
      if (it.status === 'completed') e.done++
    }
    return c
  }, [items])
  const unscheduledCount = items.filter(i => i.sessionId == null).length

  // "Move to…" targets: recent and upcoming lessons (not the current one), then Unscheduled
  const moveOptions = useMemo(() => {
    const now = Date.now()
    const past = sessions.filter(s => isOver(s, now)).slice(-3)
    const upcoming = sessions.filter(s => !isOver(s, now))
    const opts = [...past, ...upcoming]
      .filter(s => s.id !== selectedKey)
      .map(s => ({ value: String(s.id), label: sessionLabel(s, ordinals) }))
    if (!isUnscheduled) opts.push({ value: 'unscheduled', label: 'Unscheduled' })
    return opts
  }, [sessions, ordinals, selectedKey, isUnscheduled])

  const maxSeq = items.reduce((m, i) => Math.max(m, i.sequenceOrder || 0), 0)
  const studentFirst = plan?.student?.name?.split(' ')[0] || ''

  // Default time for a new one-off lesson: the selected lesson's time
  const defaultTime = selectedSession ? fmtTime(selectedSession.scheduledAt) : '16:00'

  // ── Helpers ──
  function selectLesson(key) {
    const next = new URLSearchParams(searchParams)
    next.set('session', String(key))
    setSearchParams(next, { replace: true })
    setNotice(null)
    setError('')
  }

  function flash(text = 'Saved') {
    setSavedFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setSavedFlash(''), 2500)
  }

  // Run an API change, then reload the plan. Returns true on success.
  async function run(fn, { saved = 'Saved', notice: noticeFor } = {}) {
    setBusy(true)
    setError('')
    try {
      const result = await fn()
      await refresh()
      flash(saved)
      if (noticeFor) setNotice(typeof noticeFor === 'function' ? noticeFor(result) : noticeFor)
      return true
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Something went wrong. Try again.')
      refresh().catch(() => {})
      return false
    } finally {
      setBusy(false)
    }
  }

  // ── Adding ──
  async function requestAddSheet(sheet) {
    if (inLesson.has(sheet.id)) return
    const opts = repeatConfirmOptions(sheetHistory[sheet.id], plan?.student?.name)
    if (opts && !(await confirm(opts))) return
    const ok = await run(
      () => api.post(`/lesson-plans/${planId}/items`, { sheetId: sheet.id, sessionId: targetSessionId || undefined }),
      { saved: `Added "${sheet.title}"` }
    )
    if (ok) reloadHistory()
  }

  function addCustom({ customType, customTitle }) {
    return run(
      () => api.post(`/lesson-plans/${planId}/items`, { customType, customTitle, sessionId: targetSessionId || undefined }),
      { saved: `Added ${customTypeLabel(customType)}` }
    )
  }

  async function repeatItem(item) {
    const opts = item.sheetId
      ? repeatConfirmOptions(sheetHistory[item.sheetId], plan?.student?.name) || {
          title: 'Set this sheet again?', message: `Add "${itemTitle(item)}" to this lesson again?`, confirmLabel: 'Set it again',
        }
      : { title: 'Repeat this task?', message: `Add "${itemTitle(item)}" (${customTypeLabel(item.customType)}) to this lesson again?`, confirmLabel: 'Repeat task' }
    if (!(await confirm(opts))) return
    const body = item.sheetId
      ? { sheetId: item.sheetId }
      : { customTitle: item.customTitle, customType: item.customType }
    const ok = await run(
      () => api.post(`/lesson-plans/${planId}/items`, { ...body, sessionId: targetSessionId || undefined }),
      { saved: `Added "${itemTitle(item)}" again` }
    )
    if (ok) reloadHistory()
  }

  async function applyAiPlan(assignments) {
    setBusy(true)
    setError('')
    let added = 0
    try {
      for (const a of assignments) {
        for (const it of a.items) {
          await api.post(`/lesson-plans/${planId}/items`, {
            ...(it.sheetId ? { sheetId: it.sheetId } : { customTitle: it.customTitle, customType: it.customType || 'other' }),
            tutorNotes: it.tutorNotes || undefined,
            sessionId: a.sessionId || undefined,
          })
          added++
        }
      }
      flash(`Added ${plural(added, 'item')}`)
    } finally {
      await refresh().catch(() => {})
      reloadHistory()
      setBusy(false)
    }
  }

  // ── Changing items ──
  async function saveNote(item, text) {
    try {
      await api.put(`/lesson-plans/${planId}/items/${item.id}`, { tutorNotes: text })
      setPlan(p => ({ ...p, items: p.items.map(i => (i.id === item.id ? { ...i, tutorNotes: text || null } : i)) }))
      flash('Note saved')
      return true
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save the note')
      return false
    }
  }

  function moveItem(item, target) {
    const sessionId = target === 'unscheduled' ? null : Number(target)
    const dest = sessionId ? sessionLabel(sessions.find(s => s.id === sessionId), ordinals) : 'Unscheduled'
    return run(
      () => api.put(`/lesson-plans/${planId}/items/${item.id}`, { sessionId, sequenceOrder: maxSeq + 1 }),
      { saved: 'Moved', notice: { text: `Moved "${itemTitle(item)}" to ${dest}.` } }
    )
  }

  function moveHere(item) {
    return run(
      () => api.put(`/lesson-plans/${planId}/items/${item.id}`, { sessionId: targetSessionId, sequenceOrder: maxSeq + 1 }),
      { saved: `Moved "${itemTitle(item)}" here` }
    )
  }

  async function removeItem(item) {
    const hasWork = !!item.studentResponses?.length
    if (hasWork) {
      setError(`"${itemTitle(item)}" has the student's work, so it stays in their history. You can move it to another lesson instead.`)
      return
    }
    if (item.status === 'completed' || item.status === 'in_progress') {
      const ok = await confirm({
        title: 'Remove this item?',
        message: item.status === 'completed'
          ? `"${itemTitle(item)}" is marked as completed. Removing it takes it out of the student's history.`
          : `${studentFirst || 'The student'} has started "${itemTitle(item)}". Remove it anyway?`,
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (!ok) return
    }
    const removed = item
    await run(
      () => api.delete(`/lesson-plans/${planId}/items/${item.id}`),
      { saved: 'Removed', notice: { text: `Removed "${itemTitle(item)}".`, undo: removed } }
    )
    reloadHistory()
  }

  function undoRemove(item) {
    return run(
      () => api.post(`/lesson-plans/${planId}/items`, {
        ...(item.sheetId ? { sheetId: item.sheetId } : { customTitle: item.customTitle, customType: item.customType }),
        sessionId: item.sessionId || undefined,
        tutorNotes: item.tutorNotes || undefined,
        status: item.status === 'locked' ? undefined : item.status,
        sequenceOrder: item.sequenceOrder || undefined,
      }),
      { saved: 'Restored', notice: null }
    ).then(ok => { if (ok) { setNotice(null); reloadHistory() } })
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIdx = lessonItems.findIndex(i => i.id === active.id)
    const newIdx = lessonItems.findIndex(i => i.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    // Reorder within this lesson, keeping every other item where it is in the plan
    const reordered = arrayMove(lessonItems, oldIdx, newIdx)
    const lessonIds = new Set(lessonItems.map(i => i.id))
    let k = 0
    const full = items.map(i => (lessonIds.has(i.id) ? reordered[k++] : i))
    const seq = Object.fromEntries(full.map((i, idx) => [i.id, idx + 1]))
    setPlan(p => ({ ...p, items: p.items.map(i => ({ ...i, sequenceOrder: seq[i.id] ?? i.sequenceOrder })) }))
    try {
      await api.patch(`/lesson-plans/${planId}/items/reorder`, { orderedIds: full.map(i => i.id) })
      flash('Order saved')
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save the new order')
      refresh().catch(() => {})
    }
  }

  // ── Lesson-level actions ──
  async function clearLesson() {
    const removable = lessonItems.filter(i => i.status !== 'completed' && !i.studentResponses?.length)
    const kept = lessonItems.length - removable.length
    if (!removable.length) {
      setNotice({ text: 'Nothing to clear: everything in this lesson is completed or has the student\'s work.' })
      return
    }
    const ok = await confirm({
      title: 'Clear this lesson?',
      message: `This removes ${plural(removable.length, 'item')} not started yet from ${lessonLabel}.` +
        (kept ? `\n\n${plural(kept, 'item')} with completed work will be kept, so the student's history isn't lost.` : '\n\nCompleted work is always kept.'),
      confirmLabel: 'Clear lesson',
      destructive: true,
    })
    if (!ok) return
    if (isUnscheduled) {
      await run(async () => {
        let removed = 0
        for (const it of removable) {
          try { await api.delete(`/lesson-plans/${planId}/items/${it.id}`); removed++ } catch { /* has work: kept */ }
        }
        return { removed, kept: lessonItems.length - removed }
      }, { saved: 'Cleared', notice: r => ({ text: clearedText(r) }) })
    } else {
      await run(
        async () => (await api.post(`/lesson-plans/${planId}/sessions/${selectedKey}/clear`)).data,
        { saved: 'Cleared', notice: r => ({ text: clearedText(r) }) }
      )
    }
    reloadHistory()
  }

  const clearedText = r => `Cleared ${plural(r?.removed || 0, 'item')}.${r?.kept ? ` ${plural(r.kept, 'item')} with completed work kept.` : ''}`

  async function addLesson(date, time) {
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/sessions', { lessonPlanId: Number(planId), scheduledAt: ukToIso(date, time) })
      await refresh()
      selectLesson(res.data.id)
      flash('Lesson added')
      return true
    } catch (e) {
      setError(e.response?.data?.error || 'Could not add the lesson')
      return false
    } finally {
      setBusy(false)
    }
  }

  // ── Render ──
  if (loading) return <><Navbar title="Lesson planner" /><LoadingSpinner /></>
  if (notFound || !plan) return (
    <>
      <Navbar title="Lesson planner" />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="card text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <FileText className="icon-lg" aria-hidden />
          </div>
          <p className="text-gray-900 font-medium mb-1">{notFound ? 'Lesson plan not found' : 'Could not load the lesson plan'}</p>
          <p className="text-sm text-gray-500 mb-4">{notFound ? 'It may have been deleted, or it belongs to another tutor.' : error || 'Try again in a moment.'}</p>
          <button onClick={() => navigate(basePath)} className="btn-secondary">
            <ArrowLeft className="icon" aria-hidden /> Back to dashboard
          </button>
        </div>
      </div>
    </>
  )

  const doneCount = lessonItems.filter(i => i.status === 'completed').length
  const lessonState = selectedSession
    ? selectedSession.attendedAt ? 'attended' : isOver(selectedSession) ? 'past' : 'upcoming'
    : 'unscheduled'

  return (
    <>
      <Navbar title="Lesson planner" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Link to={`${basePath}/students/${plan.studentId}`} className="btn-ghost btn-sm -ml-2.5 mb-3 inline-flex">
          <ArrowLeft className="icon-sm" aria-hidden /> {plan.student?.name ? `Back to ${plan.student.name}` : 'Back'}
        </Link>

        <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="page-title">Lesson planner</h1>
            <p className="text-sm text-gray-500 mt-1 truncate">
              {plan.student?.name}{plan.title ? ` · ${plan.title}` : ''}{plan.status === 'draft' ? ' · Draft' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm" role="status" aria-live="polite">
            {busy && <span className="text-gray-500">Saving…</span>}
            {!busy && savedFlash && <span className="text-forest-700 inline-flex items-center gap-1"><Check className="icon-sm" aria-hidden /> {savedFlash}</span>}
          </div>
        </div>

        <LessonPicker
          sessions={sessions}
          ordinals={ordinals}
          selectedKey={selectedKey}
          counts={counts}
          unscheduledCount={unscheduledCount}
          onSelect={selectLesson}
          onAddLesson={addLesson}
          defaultTime={defaultTime}
        />

        {error && (
          <div role="alert" className="mt-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-100 flex items-start gap-2">
            <AlertTriangle className="icon mt-0.5" aria-hidden />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError('')} className="p-0.5 rounded hover:bg-red-100" aria-label="Dismiss message" title="Dismiss">
              <X className="icon-sm" aria-hidden />
            </button>
          </div>
        )}
        {notice && !error && (
          <div role="status" className="mt-4 bg-forest-50 text-forest-700 text-sm px-4 py-3 rounded-lg border border-forest-100 flex items-start gap-2">
            <Check className="icon mt-0.5" aria-hidden />
            <span className="flex-1">{notice.text}</span>
            {notice.undo && (
              <button type="button" onClick={() => undoRemove(notice.undo)} disabled={busy} className="font-medium underline underline-offset-2 hover:text-forest-800">Undo</button>
            )}
            <button type="button" onClick={() => setNotice(null)} className="p-0.5 rounded hover:bg-forest-100" aria-label="Dismiss message" title="Dismiss">
              <X className="icon-sm" aria-hidden />
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full space-y-5">
            {/* This lesson */}
            <section className="card" aria-labelledby="this-lesson-title">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div className="min-w-0">
                  <p className="eyebrow">This lesson</p>
                  <h2 id="this-lesson-title" className="section-title flex items-center gap-2 flex-wrap">
                    {isUnscheduled && <Inbox className="icon-lg text-gray-400" aria-hidden />}
                    {lessonLabel}
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                    {lessonState === 'attended' && <span className="badge-success">Attended</span>}
                    {lessonState === 'past' && <span className="badge">Already happened</span>}
                    {lessonState === 'unscheduled' && <span>Work not in a lesson yet. Move items into a lesson when you're ready.</span>}
                    {selectedSession?.groupSessionId && <span className="badge"><Users className="icon-sm" aria-hidden /> Group lesson</span>}
                    {lessonItems.length > 0 && <span>{plural(lessonItems.length, 'item')}{doneCount ? `, ${doneCount} done` : ''}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={printPlanUrl(planId, { session: selectedKey })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`btn-secondary btn-sm ${lessonItems.length ? '' : 'pointer-events-none opacity-50'}`}
                    aria-disabled={!lessonItems.length}
                    tabIndex={lessonItems.length ? undefined : -1}
                    title="Open this lesson's sheets in the print view"
                  >
                    <Printer className="icon-sm" aria-hidden /> Print this lesson
                  </a>
                  <PrintPackMenu planId={planId} />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                <button type="button" onClick={() => setShowCustom(true)} disabled={busy} className="btn-secondary btn-sm">
                  <Plus className="icon-sm" aria-hidden /> Add custom task
                </button>
                <button type="button" onClick={() => setShowAi(true)} disabled={busy} className="btn-secondary btn-sm" title="Suggest work for this lesson from the student's history">
                  <Sparkles className="icon-sm" aria-hidden /> Plan with AI
                </button>
                <span className="flex-1" />
                <button type="button" onClick={clearLesson} disabled={busy || lessonItems.length === 0} className="btn-ghost btn-sm text-gray-600 hover:text-red-700" title="Remove everything not started yet from this lesson">
                  <Eraser className="icon-sm" aria-hidden /> Clear lesson
                </button>
              </div>

              {lessonItems.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <ClipboardList className="icon-lg" aria-hidden />
                  </div>
                  <p className="font-medium text-gray-900">{isUnscheduled ? 'Nothing unscheduled' : 'A clean lesson plan'}</p>
                  <p className="text-sm text-gray-500 mt-1 mb-4 max-w-sm mx-auto">
                    {isUnscheduled
                      ? 'All of this plan\'s work is in a lesson.'
                      : 'Add sheets from the library, add a custom task, or bring work forward from earlier lessons.'}
                  </p>
                  {!isUnscheduled && (
                    <div className="flex justify-center gap-2 flex-wrap">
                      <button type="button" onClick={() => setShowCustom(true)} className="btn-secondary btn-sm">
                        <Plus className="icon-sm" aria-hidden /> Add custom task
                      </button>
                      <button type="button" onClick={() => setShowAi(true)} className="btn-secondary btn-sm">
                        <Sparkles className="icon-sm" aria-hidden /> Plan with AI
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={lessonItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <ol className="space-y-2" aria-label={`Items in ${lessonLabel}`}>
                      {lessonItems.map((item, idx) => (
                        <LessonItem
                          key={item.id}
                          item={item}
                          index={idx}
                          moveOptions={moveOptions}
                          onPreview={setPreviewSheetId}
                          onSaveNote={saveNote}
                          onMove={moveItem}
                          onRemove={removeItem}
                          disabled={busy}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              )}
              {lessonItems.length > 1 && (
                <p className="text-xs text-gray-500 mt-3 hidden sm:block">Drag the handle to reorder, or focus it and use Space and the arrow keys. Changes save straight away.</p>
              )}
            </section>

            <BringForwardPanel
              items={items}
              sessions={sessions}
              ordinals={ordinals}
              selectedKey={selectedKey}
              onMoveHere={moveHere}
              onRepeat={repeatItem}
              onPreview={setPreviewSheetId}
              busy={busy}
            />

            <PlanSettings plan={plan} tutors={tutors} isManager={isManager} basePath={basePath} onSaved={refresh} />
          </div>

          <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-20" aria-label="Sheet library">
            <SheetLibraryPanel
              sheets={sheets}
              inLesson={inLesson}
              history={sheetHistory}
              onAdd={requestAddSheet}
              onPreview={setPreviewSheetId}
              busy={busy}
            />
          </aside>
        </div>
      </main>

      {showCustom && (
        <CustomTaskModal lessonLabel={lessonLabel} onClose={() => setShowCustom(false)} onAdd={addCustom} />
      )}

      {showAi && (
        <AiPlanModal
          planId={planId}
          defaultSessionId={targetSessionId}
          defaultSessionLabel={lessonLabel}
          onClose={() => setShowAi(false)}
          onApply={applyAiPlan}
          applyLabel="Add to lesson"
        />
      )}

      <SheetPreviewModal
        sheetId={previewSheetId}
        onClose={() => setPreviewSheetId(null)}
        onAdd={previewSheetId && !inLesson.has(previewSheetId) ? sheet => requestAddSheet(sheet) : null}
        alreadyAdded={inLesson.has(previewSheetId)}
      />

      {confirmModal}
    </>
  )
}
