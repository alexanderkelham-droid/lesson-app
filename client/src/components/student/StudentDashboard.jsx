import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import Tour from '../shared/Tour'
import { studentTour } from '../shared/tourSteps'
import api from '../../lib/api'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [tourForce, setTourForce] = useState(false)

  useEffect(() => {
    api.get('/lesson-plans')
      .then(res => {
        const active = res.data.find(p => p.status === 'active') || res.data[0] || null
        setPlan(active)
      })
      .catch(() => setError('Failed to load your lesson plan.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (error)   return <><Navbar /><div className="p-6 text-red-600">{error}</div></>

  // Show only items the student should be working on:
  //  - completed items (so they can revisit)
  //  - items in the unscheduled pool or in upcoming/today's sessions
  // Hide items linked to PAST sessions — those are historical records,
  // not things they need to redo. If a sheet was carried over, the clone
  // in the upcoming session is what they'll see.
  const now = new Date()
  const items = (plan?.items || [])
    .filter(i => {
      if (i.status === 'completed') return true
      if (!i.session) return true // unscheduled
      // Keep if the session is upcoming or attended-but-incomplete-clone
      // (clone has its own future session)
      return new Date(i.session.scheduledAt) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
    })
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  const completed = items.filter(i => i.status === 'completed').length
  const total     = items.length
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <>
      <Navbar title="My Learning" onShowTour={() => setTourForce(true)} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Welcome banner */}
        <div className="card mb-6 bg-gradient-to-r from-brand-600 to-indigo-500 text-white border-0">
          <h2 className="text-xl font-bold mb-1">Welcome back, {user.name.split(' ')[0]}!</h2>
          {plan ? (
            <p className="text-indigo-100 text-sm">{plan.title}</p>
          ) : (
            <p className="text-indigo-100 text-sm">No lesson plan assigned yet.</p>
          )}
        </div>

        {plan && (
          <>
            {/* Note from tutor */}
            {plan.studentNotes && (
              <div className="card mb-4 border-l-4 border-l-redwood-500 bg-redwood-50/50">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">📝</div>
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-redwood-700 mb-1">From your tutor</p>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{plan.studentNotes}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live session button */}
            <button
              data-tour="live-button"
              onClick={() => navigate(`/student/lesson-plans/${plan.id}/live`)}
              className="w-full mb-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl py-3 px-4 font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              Join Live Lesson with Tutor
            </button>

            {/* Progress bar */}
            <div data-tour="progress-bar" className="card mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm font-bold text-brand-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-brand-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{completed} of {total} sheets completed</p>
            </div>

            {/* Timeline */}
            <div data-tour="lesson-items" className="space-y-3">
              <h3 className="text-base font-semibold text-gray-900">Your Lesson Plan</h3>
              {items.map((item, idx) => {
                const resp  = item.studentResponses?.[0]
                const isCompleted = item.status === 'completed'
                const isCustom = !item.sheet && item.customTitle
                const customTypeLabels = {
                  ixl_maths: 'IXL Maths',
                  ixl_english: 'IXL English',
                  paper: 'Paper activity',
                  other: 'Task'
                }
                const customLabel = isCustom ? (customTypeLabels[item.customType] || 'Task') : null

                return (
                  <div
                    key={item.id}
                    className={`card p-4 flex items-start gap-4 transition-shadow ${
                      isCustom ? 'cursor-default bg-gray-50/50' : 'cursor-pointer hover:shadow-md'
                    }`}
                    onClick={() => !isCustom && navigate(`/student/sheet/${item.id}`)}
                  >
                    {/* Step number / check mark */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      isCompleted ? 'bg-green-500 text-white'
                      : isCustom ? 'bg-purple-500 text-white'
                      : 'bg-brand-600 text-white'
                    }`}>
                      {isCompleted ? '✓' : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {isCustom ? item.customTitle : item.sheet.title}
                          </h4>
                          <span className="text-xs text-gray-500">
                            {isCustom ? customLabel : item.sheet.subject}
                          </span>
                        </div>
                        {isCompleted && resp && (
                          resp.score != null ? (
                            <span className={`text-sm font-bold flex-shrink-0 ${resp.score >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                              {resp.score}%
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-gray-500 flex-shrink-0">Awaiting review</span>
                          )
                        )}
                      </div>

                      {/* Score bar if completed */}
                      {isCompleted && resp && resp.score != null && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[120px]">
                            <div
                              className={`h-1.5 rounded-full ${resp.score >= 70 ? 'bg-green-500' : 'bg-red-400'}`}
                              style={{ width: `${resp.score}%` }}
                            />
                          </div>
                          {resp.timeSpentSeconds && (
                            <span className="text-xs text-gray-400">
                              {Math.round(resp.timeSpentSeconds / 60)}m spent
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!plan && (
          <div className="card text-center py-12">
            <p className="text-gray-400 text-lg mb-2">📚</p>
            <p className="text-gray-600 font-medium">No lesson plan assigned yet</p>
            <p className="text-gray-400 text-sm mt-1">Your tutor will set one up for you soon.</p>
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
