import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Today view shared by manager and tutor.
// Shows scheduled sessions today + students with no scheduled session who are
// due today based on their lessonDays (gap-fill).
export default function TodayView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'

  const [sessions, setSessions] = useState([])
  const [students, setStudents] = useState([])
  const [plans, setPlans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const today = new Date()
  const todayDayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1 // 0=Mon..6=Sun
  const dayLabel = DAY_NAMES[today.getDay()]
  const dateLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get(`/sessions?date=${todayISO()}`),
      api.get('/users/students'),
      api.get('/lesson-plans')
    ])
      .then(([sRes, stRes, pRes]) => {
        setSessions(sRes.data)
        setStudents(stRes.data)
        setPlans(pRes.data)
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load today\'s schedule'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <p className="text-sm text-gray-500">Loading today's schedule...</p>
  if (error) return (
    <div className="card text-center">
      <p className="text-red-600 mb-3">{error}</p>
      <button onClick={load} className="btn-primary">Retry</button>
    </div>
  )

  // Students whose lessonDays include today AND who have an active plan tied to today
  // AND don't already have a session record for today
  const sessionPlanIds = new Set(sessions.map(s => s.lessonPlanId))
  const expectedToday = students.filter(s => (s.lessonDays || []).includes(todayDayOfWeek))
  const expectedNotScheduled = expectedToday
    .map(s => {
      const plan = plans.find(p => p.studentId === s.id && p.status === 'active' && p.lessonDayOfWeek === todayDayOfWeek)
      return plan && !sessionPlanIds.has(plan.id) ? { student: s, plan } : null
    })
    .filter(Boolean)

  async function quickCreateSession(plan) {
    const now = new Date()
    const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString()
    try {
      await api.post('/sessions', { lessonPlanId: plan.id, scheduledAt })
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create session')
    }
  }

  async function markAttended(session) {
    try {
      await api.put(`/sessions/${session.id}`, { markAttended: true })
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="font-serif text-2xl font-bold text-gray-900">{dayLabel}</h2>
        <p className="text-sm text-gray-500">{dateLabel}</p>
      </div>

      {/* Scheduled sessions */}
      {sessions.length === 0 && expectedNotScheduled.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-2xl mb-2">📅</p>
          <p className="font-medium text-gray-700 mb-1">No lessons today</p>
          <p className="text-sm text-gray-500">Enjoy the day off, or use it to plan ahead.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const studentName = session.lessonPlan?.student?.name
            const tutorName = session.lessonPlan?.tutor?.name
            const isAttended = !!session.attendedAt
            const isMissed = !isAttended && new Date(session.scheduledAt) < new Date()

            return (
              <div
                key={session.id}
                className={`card flex flex-col sm:flex-row sm:items-center gap-3 p-4 ${
                  isAttended ? 'bg-green-50/40 border-green-200' : isMissed ? 'bg-amber-50/40 border-amber-200' : ''
                }`}
              >
                <div className="flex-shrink-0 text-center w-16">
                  <p className="text-xs text-gray-400 uppercase font-semibold">{formatTime(session.scheduledAt).split(':')[0]}:{formatTime(session.scheduledAt).split(':')[1]}</p>
                  {session.durationMins && (
                    <p className="text-[10px] text-gray-400">{session.durationMins} min</p>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900">{studentName}</p>
                    {session.lessonPlan?.student?.subjectFocus && (
                      <span className="badge bg-brand-50 text-brand-700 capitalize text-[10px]">
                        {session.lessonPlan.student.subjectFocus}
                      </span>
                    )}
                    {isAttended && <span className="badge bg-green-100 text-green-700 text-[10px]">Attended</span>}
                    {isMissed && <span className="badge bg-amber-100 text-amber-700 text-[10px]">No record yet</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {session.lessonPlan?.title}
                    {user?.role === 'manager' && tutorName && <span className="text-gray-400"> · with {tutorName}</span>}
                  </p>
                  {session.notes && (
                    <p className="text-xs text-gray-600 mt-1 italic line-clamp-2">📝 {session.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  {!isAttended && (
                    <button
                      onClick={() => navigate(`${basePath}/lesson-plans/${session.lessonPlan.id}/live`)}
                      className="btn-primary text-xs py-1.5 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`${basePath}/students/${session.lessonPlan.studentId}`)}
                    className="btn-secondary text-xs py-1.5"
                  >
                    Open
                  </button>
                  {!isAttended && (
                    <button
                      onClick={() => markAttended(session)}
                      className="text-xs py-1.5 px-3 text-green-700 hover:bg-green-50 rounded-lg border border-green-200"
                    >
                      Mark attended
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Expected-but-not-scheduled */}
          {expectedNotScheduled.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Scheduled by lesson day · no session created yet
              </p>
              <div className="space-y-2">
                {expectedNotScheduled.map(({ student, plan }) => (
                  <div key={plan.id} className="bg-cream border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{student.name}</p>
                      <p className="text-xs text-gray-500 truncate">{plan.title} · expected today</p>
                    </div>
                    <button
                      onClick={() => quickCreateSession(plan)}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Schedule
                    </button>
                    <button
                      onClick={() => navigate(`${basePath}/students/${student.id}`)}
                      className="text-xs py-1.5 px-3 text-brand-700 hover:bg-brand-50 rounded-lg"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
