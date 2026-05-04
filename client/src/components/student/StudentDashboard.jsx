import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import api from '../../lib/api'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

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

  const items     = plan?.items?.sort((a, b) => a.sequenceOrder - b.sequenceOrder) || []
  const completed = items.filter(i => i.status === 'completed').length
  const total     = items.length
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <>
      <Navbar title="My Learning" />
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
            {/* Live session button */}
            <button
              onClick={() => navigate(`/student/lesson-plans/${plan.id}/live`)}
              className="w-full mb-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl py-3 px-4 font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              Join Live Lesson with Tutor
            </button>

            {/* Progress bar */}
            <div className="card mb-6">
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
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-900">Your Lesson Plan</h3>
              {items.map((item, idx) => {
                const resp  = item.studentResponses?.[0]
                const isCompleted = item.status === 'completed'

                return (
                  <div
                    key={item.id}
                    className="card p-4 flex items-start gap-4 transition-shadow cursor-pointer hover:shadow-md"
                    onClick={() => navigate(`/student/sheet/${item.id}`)}
                  >
                    {/* Step number / check mark */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      isCompleted ? 'bg-green-500 text-white' : 'bg-brand-600 text-white'
                    }`}>
                      {isCompleted ? '✓' : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">{item.sheet.title}</h4>
                          <span className="text-xs text-gray-500">{item.sheet.subject}</span>
                        </div>
                        {isCompleted && resp && (
                          <span className={`text-sm font-bold flex-shrink-0 ${resp.score >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                            {resp.score}%
                          </span>
                        )}
                      </div>

                      {/* Score bar if completed */}
                      {isCompleted && resp && (
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
    </>
  )
}
