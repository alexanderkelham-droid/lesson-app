import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import AddUserModal from './AddUserModal'
import CalendarView from './CalendarView'
import TodayView from '../shared/TodayView'
import ConfirmModal from '../shared/ConfirmModal'
import Tour from '../shared/Tour'
import { managerTour } from '../shared/tourSteps'
import api from '../../lib/api'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [plans, setPlans]       = useState([])
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('today') // 'today' | 'students' | 'tutors' | 'calendar' | 'logs'
  const [studentSearch, setStudentSearch] = useState('')
  const [showAddUser, setShowAddUser] = useState(null) // null | 'student' | 'tutor'
  const [tutors, setTutors] = useState([])
  const [confirmDeleteTutor, setConfirmDeleteTutor] = useState(null)
  const [tutorActionError, setTutorActionError] = useState('')
  const [tourForce, setTourForce] = useState(false)
  // legacy state kept to avoid breaking references; new flow uses showAddUser
  const showAddStudent = showAddUser === 'student'
  const setShowAddStudent = (open) => setShowAddUser(open ? 'student' : null)

  const [loadError, setLoadError] = useState('')

  function loadData() {
    setLoading(true)
    setLoadError('')
    Promise.all([
      api.get('/users/students'),
      api.get('/lesson-plans'),
      api.get('/follow-up-rules/logs'),
      api.get('/users')
    ])
      .then(([sRes, pRes, lRes, uRes]) => {
        setStudents(sRes.data)
        setPlans(pRes.data)
        setLogs(lRes.data.slice(0, 20))
        setTutors(uRes.data.filter(u => u.role === 'tutor'))
      })
      .catch(err => {
        setLoadError(err.response?.data?.error || 'Failed to load dashboard. Please refresh.')
      })
      .finally(() => setLoading(false))
  }

  async function handleDeleteTutor() {
    if (!confirmDeleteTutor) return
    setTutorActionError('')
    try {
      await api.delete(`/users/${confirmDeleteTutor.id}`)
      setConfirmDeleteTutor(null)
      loadData()
    } catch (err) {
      setTutorActionError(err.response?.data?.error || 'Failed to delete tutor')
    }
  }

  useEffect(() => { loadData() }, [])

  const flagged = students.filter(s => s.flagged)

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (loadError) return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="card text-center">
          <p className="text-red-600 font-medium mb-3">{loadError}</p>
          <button onClick={loadData} className="btn-primary">Retry</button>
        </div>
      </main>
    </>
  )

  return (
    <>
      <Navbar title="Manager" onShowTour={() => setTourForce(true)} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">{students.length} students total</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button data-tour="add-tutor" onClick={() => setShowAddUser('tutor')} className="btn-secondary text-sm">
              + Add Tutor
            </button>
            <button data-tour="add-student" onClick={() => setShowAddUser('student')} className="btn-secondary text-sm">
              + Add Student
            </button>
            <Link data-tour="new-plan" to="/manager/lesson-plans/new" className="btn-primary text-sm">
              + New Lesson Plan
            </Link>
          </div>
        </div>

        {/* Flagged students alert */}
        {flagged.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-red-600 font-semibold text-sm">
                {flagged.length} student{flagged.length > 1 ? 's' : ''} need attention
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {flagged.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/manager/students/${s.id}`)}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 transition-colors"
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
            { key: 'students', label: 'Students' },
            { key: 'tutors', label: 'Tutors' },
            { key: 'calendar', label: 'Calendar' },
            { key: 'logs', label: 'Follow-Up Logs' }
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
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Search students by name or email..."
                className="input max-w-md"
              />
            </div>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Days</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Lesson Plan</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Progress</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Last Active</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Avg Score</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students
                  .filter(s => {
                    if (!studentSearch) return true
                    const q = studentSearch.toLowerCase()
                    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
                  })
                  .map(s => (
                  <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${s.flagged ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-400 hidden sm:block">{s.email}</p>
                        </div>
                        {s.flagged && <span className="badge bg-red-100 text-red-700 ml-1 hidden sm:inline-flex">Flagged</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {s.subjectFocus ? (
                        <span className="badge bg-brand-50 text-brand-700 capitalize">{s.subjectFocus}</span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.lessonDays && s.lessonDays.length > 0 ? (
                        <div className="flex gap-1">
                          {s.lessonDays.map(d => (
                            <span key={d} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {DAY_NAMES[d]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {s.plan ? (
                        <span className="text-gray-700">{s.plan.title}</span>
                      ) : (
                        <span className="text-gray-400 italic">No plan</span>
                      )}
                    </td>
                    <td className="px-4 py-3 w-40">
                      <ProgressBar value={s.progress} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                      {s.lastActivity ? new Date(s.lastActivity).toLocaleDateString() : '--'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.avgScore !== null && s.avgScore !== undefined ? (
                        <span className={`font-medium ${s.avgScore >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                          {Math.round(s.avgScore)}%
                        </span>
                      ) : '--'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/manager/students/${s.id}`)}
                        className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && (
              <p className="text-center text-gray-400 py-12">No students yet. Click "+ Add Student" to get started.</p>
            )}
          </div>
          </>
        )}

        {tab === 'tutors' && (
          <div>
            {tutors.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-3xl mb-2">👩‍🏫</p>
                <p className="text-gray-700 font-medium mb-1">No tutors yet</p>
                <p className="text-sm text-gray-500 mb-4">Add a tutor account so they can sign in and start teaching.</p>
                <button onClick={() => setShowAddUser('tutor')} className="btn-primary text-sm">+ Add Tutor</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tutors.map(t => {
                  const tutorPlans = plans.filter(p => p.tutorId === t.id)
                  const activePlanCount = tutorPlans.filter(p => p.status === 'active').length
                  const studentIds = new Set(tutorPlans.map(p => p.studentId))
                  return (
                    <div key={t.id} className="card">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-forest-100 text-forest-700 rounded-full flex items-center justify-center font-bold">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                          <p className="text-xs text-gray-400 truncate">{t.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm border-t border-gray-100 pt-3">
                        <div>
                          <p className="text-xl font-bold text-brand-600">{studentIds.size}</p>
                          <p className="text-xs text-gray-500">Students</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-forest-600">{activePlanCount}</p>
                          <p className="text-xs text-gray-500">Active plans</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => setConfirmDeleteTutor(t)}
                          className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'calendar' && (
          <CalendarView students={students} plans={plans} />
        )}

        {tab === 'logs' && (
          <div className="space-y-3">
            {logs.length === 0 && (
              <div className="card text-center py-12 text-gray-400">No auto follow-ups logged yet.</div>
            )}
            {logs.map(log => (
              <div key={log.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    <span className="text-brand-600">{log.lessonPlan?.student?.name}</span>
                    {' '}scored <span className={`font-bold ${log.studentScore >= 70 ? 'text-green-600' : 'text-red-500'}`}>{log.studentScore}%</span>
                    {' '}on "{log.sourceSheet?.title}"
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Rule triggered: <em>{log.triggerRule?.triggerCondition}</em> → Added: "{log.followUpSheet?.title}"
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddUser && (
        <AddUserModal
          defaultRole={showAddUser}
          onClose={() => setShowAddUser(null)}
          onSaved={() => {
            setShowAddUser(null)
            loadData()
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmDeleteTutor}
        title={`Delete ${confirmDeleteTutor?.name}?`}
        message={
          <>
            <span className="block mb-2">This will permanently remove the tutor's account.</span>
            <span className="block">If they have any lesson plans assigned, you'll need to reassign or delete those first.</span>
            {tutorActionError && <span className="block mt-3 text-red-600">{tutorActionError}</span>}
          </>
        }
        confirmLabel="Delete Tutor"
        destructive
        onConfirm={handleDeleteTutor}
        onClose={() => { setConfirmDeleteTutor(null); setTutorActionError('') }}
      />

      <Tour
        id="manager-intro"
        autoStart
        forceOpen={tourForce}
        onClose={() => setTourForce(false)}
        steps={managerTour}
      />
    </>
  )
}
