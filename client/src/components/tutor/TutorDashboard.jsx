import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import TodayView from '../shared/TodayView'
import Tour from '../shared/Tour'
import { tutorTour } from '../shared/tourSteps'
import api from '../../lib/api'

function ProgressBar({ value }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}%</span>
    </div>
  )
}

export default function TutorDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab]           = useState('today') // 'today' | 'students'
  const [search, setSearch]     = useState('')
  const [tourForce, setTourForce] = useState(false)

  function load() {
    setLoading(true)
    setLoadError('')
    api.get('/users/students')
      .then(res => setStudents(res.data))
      .catch(err => setLoadError(err.response?.data?.error || 'Failed to load students. Please refresh.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const flagged = students.filter(s => s.flagged)
  const filtered = students.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
  })

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (loadError) return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="card text-center">
          <p className="text-red-600 font-medium mb-3">{loadError}</p>
          <button onClick={load} className="btn-primary">Retry</button>
        </div>
      </main>
    </>
  )

  return (
    <>
      <Navbar title="Tutor" onShowTour={() => setTourForce(true)} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user.name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{students.length} students assigned</p>
          </div>
          <Link data-tour="new-plan" to="/tutor/lesson-plans/new" className="btn-primary text-sm">
            + New Lesson Plan
          </Link>
        </div>

        {flagged.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-amber-800 font-semibold text-sm mb-2">{flagged.length} student{flagged.length > 1 ? 's' : ''} may need extra support</p>
            <div className="flex flex-wrap gap-2">
              {flagged.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/tutor/students/${s.id}`)}
                  className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full hover:bg-amber-200 transition-colors"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: 'today', label: 'Today' },
            { key: 'students', label: 'My Students' },
          ].map(t => (
            <button
              key={t.key}
              data-tour={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'today' && <TodayView />}

        {tab === 'students' && (
          <>
            <div className="mb-3">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students by name or email..."
                className="input max-w-md"
              />
            </div>
            {students.length === 0 ? (
              <div className="card text-center py-12 text-gray-400">
                <p className="text-2xl mb-2">👩‍🎓</p>
                <p>No students assigned to you yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map(s => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/tutor/students/${s.id}`)}
                    className={`card cursor-pointer hover:shadow-md transition-shadow ${s.flagged ? 'border-amber-200 bg-amber-50/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.email}</p>
                        </div>
                      </div>
                      {s.flagged && <span className="badge bg-amber-100 text-amber-700 text-xs">Needs attention</span>}
                    </div>

                    {s.plan ? (
                      <>
                        <p className="text-xs text-gray-500 mb-2 truncate">{s.plan.title}</p>
                        <ProgressBar value={s.progress} />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            Last active: {s.lastActivity ? new Date(s.lastActivity).toLocaleDateString() : 'Never'}
                          </span>
                          {s.avgScore != null && (
                            <span className={`text-xs font-semibold ${s.avgScore >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                              Avg: {Math.round(s.avgScore)}%
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No lesson plan</p>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-12 col-span-2">No students match your search.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <Tour
        id="tutor-intro"
        autoStart
        forceOpen={tourForce}
        onClose={() => setTourForce(false)}
        steps={tutorTour}
      />
    </>
  )
}
