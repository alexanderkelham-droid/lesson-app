import { useState, useEffect } from 'react'
import SheetLink from '../shared/SheetLink'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import AddUserModal from './AddUserModal'
import ConfirmModal, { CopyableText } from '../shared/ConfirmModal'
import SessionsPanel from '../shared/SessionsPanel'
import SessionHistory from '../shared/SessionHistory'
import PrintPackMenu from '../print/PrintPackMenu'
import AiPlanModal from '../shared/AiPlanModal'
import PastLessonModal from '../shared/PastLessonModal'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ClipboardList, Copy, FileText, GraduationCap, History, KeyRound, Pencil, Play, Plus, Sparkles, StickyNote, Trash2, UserX, Zap } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate, fmtDayTime } from '../../lib/datetime'
import { fmtSlot, sortSlots, subjectLabel, sessionNumbers } from '../../lib/dates'

const CUSTOM_LABELS = {
  ixl_maths: 'IXL Maths', ixl_english: 'IXL English', corbett_maths: 'Corbett Maths',
  eleven_plus: '11+', homework: 'Homework', paper: 'Paper activity', other: 'Custom task',
}

// IXL username with a copy button
function IxlUsername({ username }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(username)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked: the name is still visible to copy by hand */ }
  }
  return (
    <span className="badge gap-1">
      IXL: <span className="font-mono text-gray-900">{username}</span>
      <button
        type="button"
        onClick={copy}
        className="ml-0.5 -mr-1 p-0.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-redwood-500"
        aria-label={copied ? 'IXL username copied' : 'Copy IXL username'}
        title={copied ? 'Copied' : 'Copy IXL username'}
      >
        {copied ? <Check className="icon-sm text-forest-700" aria-hidden /> : <Copy className="icon-sm" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </span>
  )
}

// Score colours: >=70 forest, 40-69 amber, <40 red (rounded first)
function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

const statusConfig = {
  locked:      { label: 'Locked',      color: 'badge text-gray-500' },
  available:   { label: 'Available',   color: 'badge' },
  in_progress: { label: 'In progress', color: 'badge-warning' },
  completed:   { label: 'Completed',   color: 'badge-success' }
}

export default function StudentDetail() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'

  const [student, setStudent]   = useState(null)
  const [plans, setPlans]       = useState([])
  const [activePlan, setActivePlan] = useState(null)
  const [logs, setLogs]         = useState([])
  const [planSessions, setPlanSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [tab, setTab] = useState('plan') // 'plan' | 'history'
  const [confirmDeletePlan, setConfirmDeletePlan]       = useState(false)
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [markCompleteItem, setMarkCompleteItem] = useState(null)
  const [markScore, setMarkScore]   = useState('')
  const [markNotes, setMarkNotes]   = useState('')
  const [marking, setMarking]       = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resetGenerated, setResetGenerated] = useState(null)
  const [resetLoading, setResetLoading]   = useState(false)
  const [resetError, setResetError]       = useState('')
  const [showAiPlan, setShowAiPlan]       = useState(false)
  const [pastLessonPlanId, setPastLessonPlanId] = useState(null)
  const [creatingPlan, setCreatingPlan]   = useState(false)

  // Record a past lesson. A student with no plan yet gets one first, so the
  // lesson history has somewhere to live.
  async function openPastLesson() {
    setAiNotice('')
    if (activePlan) return setPastLessonPlanId(activePlan.id)
    setCreatingPlan(true)
    try {
      const res = await api.post('/lesson-plans', {
        title: `${student.name.split(' ')[0]}'s lessons`,
        studentId: student.id,
        tutorId: user.id,
        status: 'active',
      })
      await load()
      setPastLessonPlanId(res.data.id)
    } catch (e) {
      setAiNotice(e.response?.data?.error || 'Could not start a plan for this student')
    } finally {
      setCreatingPlan(false)
    }
  }
  const [aiNotice, setAiNotice]           = useState('')
  const [markError, setMarkError]         = useState('')

  // Escape closes whichever of this page's own dialogs is open
  useEffect(() => {
    if (!showResetPassword && !markCompleteItem) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (showResetPassword && !resetLoading) closeResetPassword()
      else if (markCompleteItem && !marking) closeMarkComplete()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // Save the items the tutor picked from the AI suggestions
  async function applyAiPlan(assignments) {
    let added = 0
    for (const a of assignments) {
      for (const it of a.items) {
        await api.post(`/lesson-plans/${activePlan.id}/items`, {
          sheetId: it.sheetId || undefined,
          customTitle: it.sheetId ? undefined : it.customTitle,
          customType: it.sheetId ? undefined : it.customType,
          sessionId: a.sessionId || undefined,
          tutorNotes: it.tutorNotes || undefined,
          status: 'available',
        })
        added++
      }
    }
    setAiNotice(`Added ${added} item${added === 1 ? '' : 's'} from the AI plan.`)
    await load()
  }

  // Refreshes keep the plan that's currently selected
  async function load(keepPlanId = activePlan?.id) {
    try {
      const [userRes, plansRes] = await Promise.all([
        api.get(`/users/${studentId}`),
        api.get('/lesson-plans')
      ])
      setStudent(userRes.data)
      const studentPlans = plansRes.data.filter(p => p.studentId === parseInt(studentId))
      setPlans(studentPlans)
      const active = (keepPlanId && studentPlans.find(p => p.id === keepPlanId))
        || studentPlans.find(p => p.status === 'active') || studentPlans[0] || null
      setActivePlan(active)

      if (active) {
        const [logsRes, detailRes] = await Promise.all([
          api.get(`/lesson-plans/${active.id}/follow-up-logs`),
          api.get(`/lesson-plans/${active.id}`).catch(() => null),
        ])
        setLogs(logsRes.data)
        setPlanSessions(detailRes?.data?.sessions || [])
      } else {
        setLogs([])
        setPlanSessions([])
      }
    } catch (e) {
      // 403/404: show the "not found" state below
      setStudent(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(null) }, [studentId])

  async function handleDeletePlan() {
    if (!activePlan) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/lesson-plans/${activePlan.id}`)
      setConfirmDeletePlan(false)
      await load(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete lesson plan')
    } finally {
      setDeleting(false)
    }
  }

  async function handleMarkComplete() {
    if (!markCompleteItem) return
    const scoreNum = markScore !== '' ? parseFloat(markScore) : null
    if (scoreNum !== null && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      setMarkError('Score must be between 0 and 100, or leave blank.')
      return
    }
    setMarkError('')
    setMarking(true)
    try {
      const isCustom = !markCompleteItem.sheetId

      // For sheet items, create a tutor-graded response
      if (!isCustom) {
        await api.post('/student-responses', {
          sheetId: markCompleteItem.sheetId,
          lessonPlanItemId: markCompleteItem.id,
          studentId: parseInt(studentId),
          responsesJson: { _tutorGraded: true, _note: markNotes || undefined },
          manualScore: scoreNum,
          timeSpentSeconds: null
        })
      }

      // Update the item: tutor notes + status. For custom items, this is the
      // only record of completion (no associated Sheet to grade).
      await api.put(`/lesson-plans/${activePlan.id}/items/${markCompleteItem.id}`, {
        status: 'completed',
        ...(markNotes && { tutorNotes: markNotes })
      })

      setMarkCompleteItem(null)
      setMarkScore('')
      setMarkNotes('')
      await load()
    } catch (e) {
      setMarkError(e.response?.data?.error || 'Failed to mark complete')
    } finally {
      setMarking(false)
    }
  }

  async function handleResetPassword() {
    setResetError('')
    setResetLoading(true)
    try {
      const res = await api.post(`/users/${studentId}/reset-password`, {
        password: resetPasswordValue || undefined
      })
      setResetGenerated(res.data.newPassword)
      setResetPasswordValue('')
    } catch (err) {
      setResetError(err.response?.data?.error || 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  function closeMarkComplete() {
    setMarkCompleteItem(null)
    setMarkScore('')
    setMarkNotes('')
    setMarkError('')
  }

  function closeResetPassword() {
    setShowResetPassword(false)
    setResetGenerated(null)
    setResetPasswordValue('')
    setResetError('')
  }

  async function handleDeleteStudent() {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/users/${studentId}`)
      navigate(basePath)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete student')
      setDeleting(false)
    }
  }

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (!student) return (
    <>
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="card text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <UserX className="icon-lg" aria-hidden />
          </div>
          <p className="text-gray-900 font-medium mb-1">Student not found</p>
          <p className="text-sm text-gray-500 mb-4">They may have been deleted, or you don't have access to them.</p>
          <button onClick={() => navigate(basePath)} className="btn-secondary">
            <ArrowLeft className="icon" aria-hidden /> Back to dashboard
          </button>
        </div>
      </div>
    </>
  )

  // Items carried forward to a later session are shown as their copy (the
  // original stays in that session's History)
  const items = [...(activePlan?.items || [])]
    .filter(i => i.status === 'completed' || !(i._count?.carriedTo > 0))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  const completedItems = items.filter(i => i.status === 'completed')
  const scores = completedItems.map(i => i.studentResponses?.[0]?.score).filter(v => v != null)
  const avgScore    = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const totalTime   = completedItems.reduce((sum, i) => sum + (i.studentResponses?.[0]?.timeSpentSeconds ?? 0), 0)
  const formatMins  = secs => secs > 0 && secs < 60 ? '<1m' : `${Math.round(secs / 60)}m`

  const slots = sortSlots(student.lessonDays)

  // Next lesson not yet taught (for the "plan it" link)
  const nowMs = Date.now()
  const nextSession = planSessions
    .filter(s => !s.attendedAt && new Date(s.scheduledAt).getTime() + (s.durationMins || 60) * 60000 > nowMs)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null
  const nextLabel = nextSession ? sessionNumbers(planSessions, () => student.id).get(nextSession.id) : null

  const TH = 'text-left px-3 py-2.5 eyebrow whitespace-nowrap'

  return (
    <>
      <Navbar title={student.name} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <button onClick={() => navigate(basePath)} className="btn-ghost btn-sm -ml-2.5 mb-3">
          <ArrowLeft className="icon-sm" aria-hidden /> Back
        </button>

        {/* Student header */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 bg-redwood-50 text-redwood-700 rounded-full flex items-center justify-center font-serif font-semibold text-xl flex-shrink-0">
                {student.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="page-title">{student.name}</h1>
                <p className="text-gray-500 text-sm">{student.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {student.age && (
                    <span className="badge">Age {student.age}</span>
                  )}
                  {student.schoolYear && (
                    <span className="badge">
                      <GraduationCap className="icon-sm text-gray-400" aria-hidden />{student.schoolYear}
                    </span>
                  )}
                  {student.subjectFocus && (
                    <span className="badge capitalize">{student.subjectFocus}</span>
                  )}
                  {student.ixlUsername && <IxlUsername username={student.ixlUsername} />}
                </div>
                {slots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label="Weekly lessons (UK time)">
                    <span className="eyebrow mr-1">Weekly</span>
                    {slots.map((sl, i) => (
                      <span key={sl.id ?? i} className="badge tabular-nums whitespace-nowrap" title={sl.durationMins ? `${sl.durationMins} minutes` : undefined}>
                        <CalendarDays className="icon-sm text-gray-400" aria-hidden />
                        {fmtSlot(sl)}
                        {!sl.time && <span className="text-amber-800">(no time)</span>}
                      </span>
                    ))}
                  </div>
                )}
                {nextSession && activePlan && (
                  <p className="text-sm text-gray-600 mt-2">
                    Next lesson:{' '}
                    <button
                      type="button"
                      onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/builder?session=${nextSession.id}`)}
                      className="link font-medium"
                      title="Plan this lesson"
                    >
                      {fmtDayTime(nextSession.scheduledAt)}
                      {nextSession.subject ? ` · ${subjectLabel(nextSession.subject)}` : ''}
                      {nextLabel ? ` · ${nextLabel}` : ''}
                    </button>
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end flex-shrink-0">
              {user?.role === 'manager' && (
                <>
                  <button onClick={() => setShowEdit(true)} className="btn-secondary btn-sm">
                    <Pencil className="icon-sm" aria-hidden /> Edit profile
                  </button>
                  <button onClick={() => setShowResetPassword(true)} className="btn-secondary btn-sm">
                    <KeyRound className="icon-sm" aria-hidden /> Reset password
                  </button>
                  <button onClick={() => setConfirmDeleteStudent(true)} className="btn-danger btn-sm">
                    <Trash2 className="icon-sm" aria-hidden /> Delete
                  </button>
                </>
              )}
              {user?.role === 'tutor' && (
                <button onClick={() => setShowResetPassword(true)} className="btn-secondary btn-sm">
                  <KeyRound className="icon-sm" aria-hidden /> Reset password
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100 sm:divide-x sm:divide-gray-100">
            <div className="sm:px-2">
              <p className="font-serif text-2xl font-semibold text-gray-900 tabular-nums">{completedItems.length}/{items.length}</p>
              <p className="eyebrow mt-0.5">Sheets done</p>
            </div>
            <div className="sm:px-4">
              <p className={`font-serif text-2xl font-semibold tabular-nums ${avgScore !== null ? scoreClass(avgScore) : 'text-gray-400'}`}>
                {avgScore !== null ? `${avgScore}%` : '—'}
              </p>
              <p className="eyebrow mt-0.5">Avg score</p>
            </div>
            <div className="sm:px-4">
              <p className="font-serif text-2xl font-semibold text-gray-900 tabular-nums">{formatMins(totalTime)}</p>
              <p className="eyebrow mt-0.5">Time spent</p>
            </div>
          </div>
        </div>

        {/* Plan / History tabs */}
        <div className="tabs mb-5" role="tablist">
          {[
            { key: 'plan',    label: 'Current plan' },
            { key: 'history', label: 'History' },
          ].map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'history' && (
          <SessionHistory studentId={studentId} />
        )}

        {tab === 'plan' && plans.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {plans.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePlan(p)}
                aria-pressed={activePlan?.id === p.id}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePlan?.id === p.id ? 'bg-redwood-50 border-redwood-200 text-redwood-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {tab === 'plan' && activePlan && (
          <>
            {aiNotice && (
              <p className="flex items-center gap-2 text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-4">
                <Check className="icon" aria-hidden /> {aiNotice}
              </p>
            )}
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="eyebrow">Lesson plan</p>
                <h2 className="section-title">{activePlan.title}</h2>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <button
                  onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/live`)}
                  className="btn-primary btn-sm"
                >
                  <Play className="icon-sm" aria-hidden />
                  Start live session
                </button>
                <button
                  onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/builder`)}
                  className="btn-secondary btn-sm"
                >
                  <Pencil className="icon-sm" aria-hidden /> Edit plan
                </button>
                <button
                  onClick={() => { setAiNotice(''); setShowAiPlan(true) }}
                  className="btn-secondary btn-sm"
                  title="Suggest the next lessons from this student's history"
                >
                  <Sparkles className="icon-sm" aria-hidden /> Plan with AI
                </button>
                <button
                  onClick={openPastLesson}
                  className="btn-secondary btn-sm"
                  title="Add a lesson that has already happened"
                >
                  <History className="icon-sm" aria-hidden /> Record past lesson
                </button>
                <PrintPackMenu planId={activePlan.id} />
                {user?.role === 'manager' && (
                  <button
                    onClick={() => setConfirmDeletePlan(true)}
                    className="btn-danger btn-sm"
                  >
                    <Trash2 className="icon-sm" aria-hidden /> Delete plan
                  </button>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="card overflow-hidden p-0 mb-6">
              <div className="overflow-x-auto relative">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={`${TH} w-8`}>#</th>
                    <th className={TH}>Sheet</th>
                    <th className={`${TH} hidden md:table-cell`}>Subject</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Score</th>
                    <th className={`${TH} hidden lg:table-cell`}>Time</th>
                    <th className={`${TH} hidden lg:table-cell`}>Completed</th>
                    <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => {
                    const resp = item.studentResponses?.[0]
                    const cfg  = statusConfig[item.status]
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 align-top">
                        <td className="px-3 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-3 min-w-[12rem]">
                          {item.sheet ? (
                            <SheetLink sheetId={item.sheet.id} className="font-medium text-gray-900">{item.sheet.title}</SheetLink>
                          ) : (
                            <p className="font-medium text-gray-900">
                              <span className="badge mr-1.5">
                                <ClipboardList className="icon-sm text-gray-500" aria-hidden />
                                {CUSTOM_LABELS[item.customType] || 'Custom task'}
                              </span>
                              {item.customTitle}
                            </p>
                          )}
                          {item.autoGenerated && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <Zap className="w-3 h-3" aria-hidden /> Auto follow-up
                            </span>
                          )}
                          {item.tutorNotes && (
                            <p className="flex items-start gap-1.5 text-xs text-gray-700 mt-1.5 max-w-md" title={item.tutorNotes}>
                              <StickyNote className="w-3 h-3 flex-shrink-0 text-gray-400 mt-0.5" aria-label="Tutor note" />
                              <span className="line-clamp-3 whitespace-pre-line leading-relaxed">{item.tutorNotes}</span>
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-500 hidden md:table-cell">{item.sheet?.subject || '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={cfg?.color || 'badge'}>{cfg?.label || item.status}</span>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {resp?.score !== undefined && resp?.score !== null ? (
                            <span className={`font-semibold ${scoreClass(resp.score)}`}>
                              {Math.round(resp.score)}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-gray-500 hidden lg:table-cell tabular-nums">
                          {resp?.timeSpentSeconds ? formatMins(resp.timeSpentSeconds) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs hidden lg:table-cell tabular-nums whitespace-nowrap">
                          {resp?.completedAt ? fmtDate(resp.completedAt) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.status !== 'completed' && (
                            <button
                              onClick={() => setMarkCompleteItem(item)}
                              className="btn-ghost btn-sm whitespace-nowrap"
                              aria-label={`Mark ${item.sheet?.title || item.customTitle || 'item'} done`}
                            >
                              <Check className="icon-sm" aria-hidden /> Mark done
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              {items.length === 0 && (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <FileText className="icon-lg" aria-hidden />
                  </div>
                  <p className="font-medium text-gray-900">No items in this plan</p>
                  <p className="text-sm text-gray-500 mt-1 mb-4">Add sheets or tasks in the plan builder.</p>
                  <button onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/builder`)} className="btn-secondary btn-sm">
                    <Pencil className="icon-sm" aria-hidden /> Edit plan
                  </button>
                </div>
              )}
            </div>

            {/* Sessions */}
            <div className="mb-6">
              <SessionsPanel planId={activePlan.id} planTitle={activePlan.title} onChange={() => load()} />
            </div>

            {/* Follow-up logs for this plan */}
            {logs.length > 0 && (
              <div className="card">
                <h3 className="section-title mb-3">Auto follow-up log</h3>
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {logs.map(log => (
                    <div key={log.id} className="py-2.5 text-sm text-gray-700 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <Zap className="icon-sm text-gray-400" aria-hidden />
                      Scored <strong className={scoreClass(log.studentScore)}>{Math.round(log.studentScore)}%</strong> on "{log.sourceSheet?.title}"
                      <ArrowRight className="icon-sm text-gray-400" aria-label="then" />
                      Added follow-up: "{log.followUpSheet?.title}"
                      <span className="text-xs text-gray-500 ml-auto tabular-nums">{fmtDate(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'plan' && plans.length === 0 && (
          <div className="card text-center py-12">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="icon-lg" aria-hidden />
            </div>
            <p className="font-medium text-gray-900">No lesson plan yet</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a plan to start assigning sheets and scheduling sessions.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => navigate(`${basePath}/lesson-plans/new?studentId=${studentId}`)} className="btn-primary">
                <Plus className="icon" aria-hidden /> Create lesson plan
              </button>
              <button onClick={openPastLesson} disabled={creatingPlan} className="btn-secondary">
                <History className="icon" aria-hidden /> {creatingPlan ? 'Starting…' : 'Record a past lesson'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">Already taught them? Record their last lesson first, then plan the next one from it.</p>
          </div>
        )}
      </main>

      {showEdit && (
        <AddUserModal
          editUser={student}
          defaultRole="student"
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            load()
          }}
        />
      )}

      {/* Reset password modal */}
      {showResetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={closeResetPassword}>
          <div role="dialog" aria-modal="true" aria-label="Reset password" className="modal-panel w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            {!resetGenerated ? (
              <>
                <h2 className="section-title mb-1">Reset password</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Set a new password for <strong className="text-gray-900">{student?.name}</strong>. Leave blank to generate a memorable one.
                </p>
                <div>
                  <label className="label" htmlFor="reset-password-value">New password (optional)</label>
                  <input
                    id="reset-password-value"
                    type="text"
                    value={resetPasswordValue}
                    onChange={e => setResetPasswordValue(e.target.value)}
                    placeholder="Leave blank to generate"
                    className="input"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum 8 characters, or leave blank.</p>
                </div>
                {resetError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mt-3">{resetError}</p>
                )}
                <div className="flex gap-2 mt-5">
                  <button onClick={closeResetPassword} className="btn-secondary flex-1" disabled={resetLoading}>Cancel</button>
                  <button onClick={handleResetPassword} className="btn-primary flex-1" disabled={resetLoading}>
                    {resetLoading ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center mb-3">
                  <Check className="icon-lg" aria-hidden />
                </div>
                <h2 className="section-title mb-1">Password reset</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Share this new password with <strong className="text-gray-900">{student?.name}</strong>. It won't be shown again.
                </p>
                <CopyableText text={resetGenerated} />
                <button onClick={closeResetPassword} className="btn-primary w-full mt-2">Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI plan modal */}
      {pastLessonPlanId && (
        <PastLessonModal
          planId={pastLessonPlanId}
          studentName={student?.name?.split(' ')[0]}
          onClose={() => setPastLessonPlanId(null)}
          onSaved={r => { setAiNotice(`Past lesson saved: ${r.added} item${r.added === 1 ? '' : 's'} recorded${r.carriedOver ? `, ${r.carriedOver} unfinished moved to the next lesson` : ''}.`); load() }}
        />
      )}

      {showAiPlan && activePlan && (
        <AiPlanModal planId={activePlan.id} onClose={() => setShowAiPlan(false)} onApply={applyAiPlan} />
      )}

      {/* Mark-complete modal */}
      {markCompleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !marking && closeMarkComplete()}>
          <div role="dialog" aria-modal="true" aria-label="Mark as completed" className="modal-panel w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="section-title mb-1">Mark as completed</h2>
            <p className="text-sm text-gray-500 mb-4 truncate">{markCompleteItem.sheet?.title || markCompleteItem.customTitle}</p>

            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="mark-score">Score (0–100, optional)</label>
                <input
                  id="mark-score"
                  type="number" min="0" max="100" step="1"
                  value={markScore}
                  onChange={e => setMarkScore(e.target.value)}
                  placeholder="Leave blank if not graded"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="label" htmlFor="mark-notes">Tutor note (optional)</label>
                <textarea
                  id="mark-notes"
                  value={markNotes}
                  onChange={e => setMarkNotes(e.target.value)}
                  rows={3}
                  placeholder="What was covered, observations…"
                  className="input resize-none"
                />
              </div>
            </div>
            {markError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mt-3">{markError}</p>}

            <div className="flex gap-2 mt-5">
              <button
                onClick={closeMarkComplete}
                className="btn-secondary flex-1"
                disabled={marking}
              >
                Cancel
              </button>
              <button onClick={handleMarkComplete} className="btn-primary flex-1" disabled={marking}>
                {marking ? 'Saving…' : 'Mark complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDeletePlan}
        title="Delete this lesson plan?"
        message={
          <>
            <span className="block mb-2">"{activePlan?.title}" will be permanently deleted along with all its items, scores and progress data.</span>
            <span className="block">This cannot be undone.</span>
            {deleteError && <span className="block mt-3 text-red-700">{deleteError}</span>}
          </>
        }
        confirmLabel="Delete plan"
        destructive
        loading={deleting}
        onConfirm={handleDeletePlan}
        onClose={() => { setConfirmDeletePlan(false); setDeleteError('') }}
      />

      <ConfirmModal
        open={confirmDeleteStudent}
        title={`Delete ${student?.name}?`}
        message={
          <>
            <span className="block mb-2">This will permanently delete <strong>{student?.name}</strong>'s account, all their lesson plans, responses and progress history.</span>
            <span className="block">This cannot be undone.</span>
            {deleteError && <span className="block mt-3 text-red-700">{deleteError}</span>}
          </>
        }
        confirmLabel="Delete student"
        destructive
        loading={deleting}
        onConfirm={handleDeleteStudent}
        onClose={() => { setConfirmDeleteStudent(false); setDeleteError('') }}
      />
    </>
  )
}
