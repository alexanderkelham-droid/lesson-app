import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import Tour from '../shared/Tour'
import { studentTour } from '../shared/tourSteps'
import api from '../../lib/api'
import { Check, ChevronRight, ClipboardList, Hourglass, BookOpen, Radio, MessageSquareText, History, House } from 'lucide-react'
import { fmtDayLong, fmtTime, todayUk, ukDateKey } from '../../lib/datetime'
import { sessionNumbers, subjectLabel } from '../../lib/dates'

const CUSTOM_TYPE_LABELS = {
  ixl_maths: 'IXL Maths', ixl_english: 'IXL English', corbett_maths: 'Corbett Maths',
  eleven_plus: '11+', homework: 'Homework', paper: 'Paper activity', other: 'Task',
}

// Score colour rule: >=70 forest, 40-69 amber, <40 red (rounded first)
const scoreText = s => { const r = Math.round(s); return r >= 70 ? 'text-forest-700' : r >= 40 ? 'text-amber-700' : 'text-red-700' }
const scoreBar  = s => { const r = Math.round(s); return r >= 70 ? 'bg-forest-500' : r >= 40 ? 'bg-amber-400' : 'bg-red-400' }

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [tourForce, setTourForce] = useState(false)
  const [planSessions, setPlanSessions] = useState([])

  useEffect(() => {
    api.get('/lesson-plans')
      .then(async res => {
        const active = res.data.find(p => p.status === 'active') || res.data[0] || null
        setPlan(active)
        // Lesson times + subjects for the "next lesson" line
        if (active) {
          const detail = await api.get(`/lesson-plans/${active.id}`).catch(() => null)
          setPlanSessions(detail?.data?.sessions || [])
        }
      })
      .catch(() => setError('Failed to load your lesson plan.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (error)   return <><Navbar /><div className="p-6 text-red-700">{error}</div></>

  // Show only items the student should be working on:
  //  - completed items (so they can revisit)
  //  - items in the unscheduled pool or in upcoming/today's sessions
  // Hide items linked to PAST sessions — those are historical records,
  // not things they need to redo. If a sheet was carried over, the clone
  // in the upcoming session is what they'll see.
  const now = new Date()
  const today = todayUk()
  const items = (plan?.items || [])
    .filter(i => {
      if (i.status === 'completed') return true
      // Carried forward to a later lesson — the copy is shown instead
      if (i._count?.carriedTo > 0) return false
      if (!i.session) return true // unscheduled
      // Keep if the session is upcoming or attended-but-incomplete-clone
      // (clone has its own future session)
      return ukDateKey(i.session.scheduledAt) >= today
    })
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  const completed = items.filter(i => i.status === 'completed').length
  const total     = items.length
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0
  // Next lesson (UK time): from the plan's sessions, else from its items
  const lessonPool = planSessions.length > 0
    ? planSessions
    : (plan?.items || []).map(i => i.session).filter(Boolean)
  const nextSession = lessonPool
    .filter(s => s.scheduledAt && !s.attendedAt && new Date(s.scheduledAt).getTime() > now.getTime() - 2 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null
  const nextLesson = nextSession ? nextSession.scheduledAt : null
  const nextExtra = nextSession
    ? [subjectLabel(nextSession.subject), sessionNumbers(planSessions, () => 'me').get(nextSession.id)].filter(Boolean).join(', ')
    : ''
  // A sheet set again after an earlier completed attempt is a revision
  const allItems = plan?.items || []
  const sheetOf = i => i.sheetId ?? i.sheet?.id
  const isRevision = item => !!sheetOf(item) && allItems.some(o =>
    o.id !== item.id && sheetOf(o) === sheetOf(item) && o.status === 'completed' &&
    (o.sequenceOrder < item.sequenceOrder || (o.sequenceOrder === item.sequenceOrder && o.id < item.id)))
  const formatSpent = secs => secs < 60 ? '<1m' : `${Math.round(secs / 60)}m`

  return (
    <>
      <Navbar title="My Learning" onShowTour={() => setTourForce(true)} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="card mb-6 bg-cream/60 border-l-4 border-l-redwood-600">
          <p className="eyebrow mb-1">My learning</p>
          <h2 className="font-serif text-2xl font-semibold text-gray-900 tracking-tight">
            Welcome back, {user.name.split(' ')[0]}
          </h2>
          {plan ? (
            <p className="text-base text-gray-600 mt-1">{plan.title}</p>
          ) : (
            <p className="text-base text-gray-600 mt-1">No lesson plan assigned yet.</p>
          )}
        </div>

        {plan && (
          <>
            {/* Note from tutor */}
            {plan.studentNotes && (
              <div className="card mb-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-redwood-50 text-redwood-700 flex items-center justify-center">
                    <MessageSquareText className="icon-lg" aria-hidden />
                  </div>
                  <div>
                    <p className="eyebrow text-redwood-700 mb-1">From your tutor</p>
                    <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">{plan.studentNotes}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live session button */}
            <button
              type="button"
              data-tour="live-button"
              onClick={() => navigate(`/student/lesson-plans/${plan.id}/live`)}
              className="btn-primary w-full mb-6 py-4 px-5 text-base rounded-xl gap-3"
            >
              <Radio className="icon-lg" aria-hidden />
              <span className="text-left">
                Join live lesson with your tutor
                {nextLesson && (
                  <span className="block text-sm font-normal text-white/85">
                    Next lesson: {fmtDayLong(nextLesson)} at {fmtTime(nextLesson)}{nextExtra ? ` (${nextExtra})` : ''}
                  </span>
                )}
              </span>
            </button>

            {/* Progress bar */}
            <div data-tour="progress-bar" className="card mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-medium text-gray-800">Your progress</span>
                <span className="text-base font-semibold text-forest-700">{progress}%</span>
              </div>
              <div
                className="w-full bg-gray-100 rounded-full h-3"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Sheets completed"
              >
                <div
                  className="bg-forest-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">{completed} of {total} sheets done</p>
            </div>

            {/* Timeline */}
            <div data-tour="lesson-items" className="space-y-3">
              <h3 className="section-title mb-1">Your lesson plan</h3>
              {items.map((item, idx) => {
                const resp  = item.studentResponses?.[0]
                const isCompleted = item.status === 'completed'
                const isCustom = !item.sheet && item.customTitle
                const isHomework = isCustom && item.customType === 'homework'
                const customLabel = isCustom ? (CUSTOM_TYPE_LABELS[item.customType] || 'Task') : null
                const revision = !isCustom && isRevision(item)

                return (
                  <div
                    key={item.id}
                    role={isCustom ? undefined : 'button'}
                    tabIndex={isCustom ? undefined : 0}
                    className={`card p-4 sm:p-5 flex items-center gap-4 transition-colors ${
                      isCustom ? 'cursor-default' : 'cursor-pointer hover:border-gray-300 hover:bg-gray-50/60'
                    }`}
                    onClick={() => !isCustom && navigate(`/student/sheet/${item.id}`)}
                    aria-label={isCustom ? undefined : `${revision ? 'Revision: ' : ''}${item.sheet?.title}${isCompleted ? ', done' : ''}`}
                    onKeyDown={e => { if (!isCustom && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(`/student/sheet/${item.id}`) } }}
                  >
                    {/* Step number / check mark */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold ${
                      isCompleted ? 'bg-forest-600 text-white'
                      : isCustom ? 'bg-gray-100 text-gray-600'
                      : 'bg-redwood-50 text-redwood-700'
                    }`}>
                      {isCompleted
                        ? <Check className="icon-lg" aria-label="Done" />
                        : isHomework
                          ? <House className="icon-lg" aria-hidden />
                        : isCustom
                          ? <ClipboardList className="icon-lg" aria-hidden />
                          : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-base font-medium text-gray-900 leading-snug break-words">
                            {isCustom ? item.customTitle : item.sheet.title}
                          </h4>
                          {isCustom ? (
                            isHomework ? (
                              <span className="badge mt-1"><House className="icon-sm" aria-hidden /> Homework</span>
                            ) : (
                              <span className="badge mt-1">{customLabel}</span>
                            )
                          ) : (
                            <span className="text-sm text-gray-500 inline-flex items-center gap-2 flex-wrap">
                              {item.sheet.subject}
                              {revision && (
                                <span className="badge" title="You have done this sheet before">
                                  <History className="icon-sm" aria-hidden /> Revision
                                </span>
                              )}
                            </span>
                          )}
                          {isCustom && !isCompleted && (
                            <p className="text-sm text-gray-600 mt-1.5">
                              {isHomework
                                ? 'Do this at home before your next lesson.'
                                : item.customType?.startsWith('ixl')
                                  ? 'Do this on IXL. Your tutor will tick it off.'
                                  : 'Your tutor will tick this off when it\'s done.'}
                            </p>
                          )}
                        </div>
                        {isCompleted && resp && (
                          resp.score != null ? (
                            <span className={`text-base font-semibold flex-shrink-0 ${scoreText(resp.score)}`}>
                              {Math.round(resp.score)}%
                            </span>
                          ) : (
                            <span className="badge-warning flex-shrink-0">
                              <Hourglass className="icon-sm" aria-hidden />
                              Awaiting review
                            </span>
                          )
                        )}
                      </div>

                      {/* Score bar if completed */}
                      {isCompleted && resp && resp.score != null && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[120px]">
                            <div
                              className={`h-1.5 rounded-full ${scoreBar(resp.score)}`}
                              style={{ width: `${Math.max(0, Math.min(100, resp.score))}%` }}
                            />
                          </div>
                          {resp.timeSpentSeconds && (
                            <span className="text-xs text-gray-500">
                              {formatSpent(resp.timeSpentSeconds)} spent
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!isCustom && (
                      <ChevronRight className="icon-lg text-gray-400" aria-hidden />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!plan && (
          <div className="card text-center py-12">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
              <BookOpen className="icon-lg" aria-hidden />
            </div>
            <p className="text-base text-gray-800 font-medium">No lesson plan yet</p>
            <p className="text-gray-500 text-sm mt-1">Your tutor will set one up for you soon.</p>
          </div>
        )}
      </main>

      <Tour
        id="student-intro"
        autoStart
        forceOpen={tourForce}
        onClose={() => setTourForce(false)}
        steps={studentTour}
      />
    </>
  )
}
