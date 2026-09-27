import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import TodayView from '../shared/TodayView'
import GroupSessionModal from '../shared/GroupSessionModal'
import CalendarView from '../manager/CalendarView'
import Tour from '../shared/Tour'
import { tutorTour } from '../shared/tourSteps'
import { AlertTriangle, Plus, Search, Users } from 'lucide-react'
import api from '../../lib/api'

function ProgressBar({ value }) {
  const color = value >= 70 ? 'bg-forest-500' : value >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${value}%` }} />
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
  const [plans, setPlans]       = useState([])
  const [tab, setTab]           = useState('today') // 'today' | 'students' | 'calendar'
  const [search, setSearch]     = useState('')
  const [tourForce, setTourForce] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupNotice, setGroupNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  function load() {
    setLoading(true)
    setLoadError('')
    Promise.all([api.get('/users/students'), api.get('/lesson-plans')])
      .then(([sRes, pRes]) => { setStudents(sRes.data); setPlans(pRes.data) })
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
          <p className="text-red-700 font-medium mb-3">{loadError}</p>
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
            <h1 className="page-title">Welcome back, {user.name}</h1>
            <p className="text-gray-500 text-sm mt-1">{students.length} student{students.length === 1 ? '' : 's'} assigned</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowNewGroup(true)} className="btn-secondary">
              <Users className="icon" aria-hidden /> New group session
            </button>
            <Link data-tour="new-plan" to="/tutor/lesson-plans/new" className="btn-primary">
              <Plus className="icon" aria-hidden /> New lesson plan
            </Link>
          </div>
        </div>

        {groupNotice && (
          <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-4">{groupNotice}</p>
        )}

        {flagged.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2"><AlertTriangle className="icon" aria-hidden />{flagged.length} student{flagged.length > 1 ? 's' : ''} may need extra support</p>
            <div className="flex flex-wrap gap-2">
              {flagged.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/tutor/students/${s.id}`)}
                  className="text-xs font-medium bg-white border border-amber-200 text-amber-800 px-3 py-1 rounded-md hover:bg-amber-100 transition-colors"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs mb-5" role="tablist">
          {[
            { key: 'today', label: 'Today' },
            { key: 'students', label: 'My students' },
            { key: 'calendar', label: 'Calendar' },
          ].map(t => (
            <button
              key={t.key}
              data-tour={`tab-${t.key}`}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'today' && <TodayView refreshKey={refreshKey} />}

        {tab === 'calendar' && <CalendarView students={students} plans={plans} refreshKey={refreshKey} />}

        {tab === 'students' && (
          <>
            <div className="relative mb-4 max-w-md">
              <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students by name or email"
                aria-label="Search students"
                className="input pl-9"
              />
            </div>
            {students.length === 0 ? (
              <div className="card text-center py-12">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                  <Users className="icon-lg" aria-hidden />
                </div>
                <p className="font-medium text-gray-900">No students yet</p>
                <p className="text-sm text-gray-500 mt-1">Students will appear here once a manager assigns them to you.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map(s => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/tutor/students/${s.id}`)}
                    className={`card p-5 cursor-pointer hover:border-gray-300 hover:shadow-pop transition-shadow ${s.flagged ? 'border-amber-200' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-redwood-50 text-redwood-700 rounded-full flex items-center justify-center font-semibold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                      </div>
                      {s.flagged && <span className="badge-warning">Needs attention</span>}
                    </div>

                    {s.plan ? (
                      <>
                        <p className="text-xs text-gray-500 mb-2 truncate">{s.plan.title}</p>
                        <ProgressBar value={s.progress} />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            Last active: {s.lastActivity ? new Date(s.lastActivity).toLocaleDateString('en-GB') : 'Never'}
                          </span>
                          {s.avgScore != null && (
                            <span className={`text-xs font-semibold ${Math.round(s.avgScore) >= 70 ? 'text-forest-700' : Math.round(s.avgScore) >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
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
                  <p className="text-center text-sm text-gray-500 py-12 sm:col-span-2">No students match your search.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showNewGroup && (
        <GroupSessionModal
          onClose={() => setShowNewGroup(false)}
          onSaved={r => {
            setShowNewGroup(false)
            setGroupNotice(r?.occurrences > 1 ? `${r.title} created: ${r.occurrences} weekly sessions.` : `${r?.title || 'Group session'} created.`)
            setRefreshKey(k => k + 1)
          }}
        />
      )}

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
