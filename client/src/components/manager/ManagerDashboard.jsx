import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import AddUserModal from './AddUserModal'
import CalendarView from './CalendarView'
import TodayView from '../shared/TodayView'
import GroupSessionModal from '../shared/GroupSessionModal'
import ConfirmModal, { CopyableText } from '../shared/ConfirmModal'
import Tour from '../shared/Tour'
import { managerTour } from '../shared/tourSteps'
import { AlertTriangle, ArrowRight, ChevronRight, KeyRound, Library, Pencil, Plus, Search, Trash2, UserPlus, Users, Zap } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate } from '../../lib/datetime'
import { DAY_SHORT, fmtSlot, sortSlots } from '../../lib/dates'

// Score colours: >=70 forest, 40-69 amber, <40 red (rounded first)
function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

function ProgressBar({ value }) {
  const color = value >= 70 ? 'bg-forest-500' : value >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right tabular-nums">{value}%</span>
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
  const [editTutor, setEditTutor] = useState(null)
  const [tutorReset, setTutorReset] = useState(null) // { name, email, password }
  const [confirmResetTutor, setConfirmResetTutor] = useState(null) // tutor
  const [resettingTutor, setResettingTutor] = useState(false)
  const [tutors, setTutors] = useState([])
  const [confirmDeleteTutor, setConfirmDeleteTutor] = useState(null)
  const [tutorActionError, setTutorActionError] = useState('')
  const [tourForce, setTourForce] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupNotice, setGroupNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  // legacy state kept to avoid breaking references; new flow uses showAddUser
  const showAddStudent = showAddUser === 'student'
  const setShowAddStudent = (open) => setShowAddUser(open ? 'student' : null)

  const [loadError, setLoadError] = useState('')

  // First load shows the spinner; later refreshes (after adding or editing a
  // user) update the data in place without a full-page loading flash
  function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    if (!quiet) setLoadError('')
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
        if (!quiet) setLoadError(err.response?.data?.error || 'Failed to load dashboard. Please refresh.')
      })
      .finally(() => setLoading(false))
  }

  async function handleDeleteTutor() {
    if (!confirmDeleteTutor) return
    setTutorActionError('')
    try {
      await api.delete(`/users/${confirmDeleteTutor.id}`)
      setConfirmDeleteTutor(null)
      loadData({ quiet: true })
    } catch (err) {
      setTutorActionError(err.response?.data?.error || 'Failed to delete tutor')
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleResetTutor() {
    const t = confirmResetTutor
    if (!t) return
    setResettingTutor(true)
    setTutorActionError('')
    try {
      const res = await api.post(`/users/${t.id}/reset-password`, {})
      setConfirmResetTutor(null)
      setTutorReset({ name: t.name, email: t.email, password: res.data.newPassword })
    } catch (err) {
      setTutorActionError(err.response?.data?.error || 'Failed to reset password')
    } finally {
      setResettingTutor(false)
    }
  }

  // Escape closes the new-password dialog
  useEffect(() => {
    if (!tutorReset) return
    const onKey = e => { if (e.key === 'Escape') setTutorReset(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tutorReset])

  const flagged = students.filter(s => s.flagged)

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (loadError) return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="card text-center">
          <p className="text-red-700 font-medium mb-3">{loadError}</p>
          <button onClick={loadData} className="btn-primary">Retry</button>
        </div>
      </main>
    </>
  )

  const TH = 'text-left px-4 py-2.5 eyebrow'

  return (
    <>
      <Navbar title="Manager" onShowTour={() => setTourForce(true)} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header row */}
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="page-title">Manager dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {students.length} student{students.length === 1 ? '' : 's'} · {tutors.length} tutor{tutors.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button data-tour="add-tutor" onClick={() => setShowAddUser('tutor')} className="btn-secondary">
              <UserPlus className="icon" aria-hidden /> Add tutor
            </button>
            <button data-tour="add-student" onClick={() => setShowAddUser('student')} className="btn-secondary">
              <UserPlus className="icon" aria-hidden /> Add student
            </button>
            <button onClick={() => setShowNewGroup(true)} className="btn-secondary">
              <Users className="icon" aria-hidden /> New group session
            </button>
            <Link to="/manager/sheets" className="btn-secondary">
              <Library className="icon" aria-hidden /> Sheet library
            </Link>
            <Link data-tour="new-plan" to="/manager/lesson-plans/new" className="btn-primary">
              <Plus className="icon" aria-hidden /> New lesson plan
            </Link>
          </div>
        </div>

        {groupNotice && (
          <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-4">{groupNotice}</p>
        )}

        {/* Flagged students alert */}
        {flagged.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle className="icon text-red-700" aria-hidden />
              <span className="text-red-700 font-semibold text-sm">
                {flagged.length} student{flagged.length > 1 ? 's need' : ' needs'} attention
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {flagged.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/manager/students/${s.id}`)}
                  className="text-xs bg-white border border-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-100 transition-colors"
                  title={s.flagReasons?.join(' · ')}
                  aria-label={`Open ${s.name}, needs attention${s.flagReasons?.length ? `: ${s.flagReasons.join(', ')}` : ''}`}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.flagReasons?.length > 0 && <span className="text-red-700/80"> — {s.flagReasons.join(' · ')}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs mb-5 flex-wrap" role="tablist">
          {[
            { key: 'today', label: 'Today' },
            { key: 'students', label: 'Students' },
            { key: 'tutors', label: 'Tutors' },
            { key: 'calendar', label: 'Calendar' },
            { key: 'logs', label: 'Follow-up logs' }
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

        {tab === 'students' && (
          <>
            <div className="relative mb-4 max-w-md">
              <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
              <input
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Search students by name or email"
                aria-label="Search students"
                className="input pl-9"
              />
            </div>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={TH}>Student</th>
                  <th className={`${TH} hidden md:table-cell`}>Subject</th>
                  <th className={`${TH} hidden md:table-cell`}>Year</th>
                  <th className={`${TH} hidden lg:table-cell`}>Weekly lessons</th>
                  <th className={`${TH} hidden md:table-cell`}>Lesson plan</th>
                  <th className={TH}>Progress</th>
                  <th className={`${TH} hidden sm:table-cell`}>Last active</th>
                  <th className={`${TH} hidden lg:table-cell`}>Avg score</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
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
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/manager/students/${s.id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-redwood-50 text-redwood-700 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500 hidden sm:block">{s.email}</p>
                          {s.schoolYear && <p className="text-xs text-gray-500 md:hidden">{s.schoolYear}</p>}
                        </div>
                        {s.flagged && <span className="badge-danger ml-1 hidden sm:inline-flex">Flagged</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {s.subjectFocus ? (
                        <span className="badge capitalize">{s.subjectFocus}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-700 whitespace-nowrap">
                      {s.schoolYear || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {(s.slots?.length || s.lessonDays?.length) ? (
                        <div className="flex flex-wrap gap-1">
                          {(s.slots?.length ? sortSlots(s.slots) : sortSlots(s.lessonDays)).map((sl, i) => (
                            <span key={sl.id ?? i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded tabular-nums whitespace-nowrap">
                              {sl.time || sl.subject ? fmtSlot(sl) : DAY_SHORT[sl.dayOfWeek]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
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
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs tabular-nums">
                      {s.lastActivity ? fmtDate(s.lastActivity) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell tabular-nums">
                      {s.avgScore !== null && s.avgScore !== undefined ? (
                        <span className={`font-medium ${scoreClass(s.avgScore)}`}>
                          {Math.round(s.avgScore)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/manager/students/${s.id}`) }}
                        className="inline-flex items-center gap-0.5 link text-xs font-medium"
                        aria-label={`View ${s.name}`}
                      >
                        View <ChevronRight className="icon-sm" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && (
              <div className="text-center py-12 px-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                  <Users className="icon-lg" aria-hidden />
                </div>
                <p className="font-medium text-gray-900">No students yet</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">Add your first student to start planning lessons.</p>
                <button onClick={() => setShowAddUser('student')} className="btn-primary">
                  <UserPlus className="icon" aria-hidden /> Add student
                </button>
              </div>
            )}
          </div>
          </>
        )}

        {tab === 'tutors' && (
          <div>
            {tutors.length === 0 ? (
              <div className="card text-center py-12">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                  <Users className="icon-lg" aria-hidden />
                </div>
                <p className="text-gray-900 font-medium">No tutors yet</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">Add a tutor account so they can sign in and start teaching.</p>
                <button onClick={() => setShowAddUser('tutor')} className="btn-primary">
                  <UserPlus className="icon" aria-hidden /> Add tutor
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tutors.map(t => {
                  const tutorPlans = plans.filter(p => p.tutorId === t.id)
                  const activePlanCount = tutorPlans.filter(p => p.status === 'active').length
                  const studentIds = new Set(tutorPlans.map(p => p.studentId))
                  return (
                    <div key={t.id} className="card p-5 flex flex-col">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 bg-forest-50 text-forest-700 rounded-full flex items-center justify-center font-semibold flex-shrink-0">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                          <p className="text-xs text-gray-500 truncate">{t.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                        <div>
                          <p className="font-serif text-xl font-semibold text-gray-900 tabular-nums">{studentIds.size}</p>
                          <p className="eyebrow mt-0.5">Students</p>
                        </div>
                        <div>
                          <p className="font-serif text-xl font-semibold text-gray-900 tabular-nums">{activePlanCount}</p>
                          <p className="eyebrow mt-0.5">Active plans</p>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-4 pt-3 border-t border-gray-100 -mx-1">
                        <button onClick={() => setEditTutor(t)} className="btn-ghost btn-sm" aria-label={`Edit ${t.name}`}>
                          <Pencil className="icon-sm" aria-hidden /> Edit
                        </button>
                        <button
                          onClick={() => { setTutorActionError(''); setConfirmResetTutor(t) }}
                          className="btn-ghost btn-sm"
                          aria-label={`Reset ${t.name}'s password`}
                        >
                          <KeyRound className="icon-sm" aria-hidden /> Reset password
                        </button>
                        <button
                          onClick={() => setConfirmDeleteTutor(t)}
                          className="btn-ghost btn-sm ml-auto text-red-700 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Delete ${t.name}`}
                        >
                          <Trash2 className="icon-sm" aria-hidden /> Delete
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
          <CalendarView students={students} plans={plans} refreshKey={refreshKey} />
        )}

        {tab === 'logs' && (
          <div>
            {logs.length === 0 ? (
              <div className="card text-center py-12">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                  <Zap className="icon-lg" aria-hidden />
                </div>
                <p className="font-medium text-gray-900">No follow-ups yet</p>
                <p className="text-sm text-gray-500 mt-1">Automatic follow-up sheets will be logged here when a rule is triggered.</p>
              </div>
            ) : (
              <div className="card p-0 divide-y divide-gray-100">
                {logs.map(log => (
                  <div key={log.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                      <Zap className="icon" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{log.lessonPlan?.student?.name}</span>
                        {' '}scored <span className={`font-semibold ${scoreClass(log.studentScore)}`}>{Math.round(log.studentScore)}%</span>
                        {' '}on "{log.sourceSheet?.title}"
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-1">
                        Rule: <em>{log.triggerRule?.triggerCondition}</em>
                        <ArrowRight className="icon-sm text-gray-400" aria-label="then" />
                        Added "{log.followUpSheet?.title}"
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
                      {fmtDate(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showAddUser && (
        <AddUserModal
          defaultRole={showAddUser}
          onClose={() => setShowAddUser(null)}
          onSaved={() => {
            setShowAddUser(null)
            loadData({ quiet: true })
          }}
        />
      )}

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

      {editTutor && (
        <AddUserModal
          editUser={editTutor}
          onClose={() => setEditTutor(null)}
          onSaved={() => { setEditTutor(null); loadData({ quiet: true }) }}
        />
      )}

      {tutorReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => setTutorReset(null)}>
          <div role="dialog" aria-modal="true" aria-label={`New password for ${tutorReset.name}`} className="modal-panel w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-redwood-50 text-redwood-700 flex items-center justify-center mb-3">
              <KeyRound className="icon-lg" aria-hidden />
            </div>
            <h2 className="section-title mb-1">New password for {tutorReset.name}</h2>
            <p className="text-sm text-gray-600 mb-4">Share it with them. It won't be shown again.</p>
            <CopyableText multiline text={`Email: ${tutorReset.email}\nPassword: ${tutorReset.password}`} label="Copy login details" />
            <button onClick={() => setTutorReset(null)} className="btn-primary w-full mt-2">Done</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmResetTutor}
        title={`Reset ${confirmResetTutor?.name}'s password?`}
        message={
          <>
            <span className="block">A new password will be generated and shown once. Their current password stops working straight away.</span>
            {tutorActionError && <span className="block mt-3 text-red-700">{tutorActionError}</span>}
          </>
        }
        confirmLabel="Reset password"
        loading={resettingTutor}
        onConfirm={handleResetTutor}
        onClose={() => { setConfirmResetTutor(null); setTutorActionError('') }}
      />

      <ConfirmModal
        open={!!confirmDeleteTutor}
        title={`Delete ${confirmDeleteTutor?.name}?`}
        message={
          <>
            <span className="block mb-2">This will permanently remove the tutor's account.</span>
            <span className="block">If they have any lesson plans assigned, you'll need to reassign or delete those first.</span>
            {tutorActionError && <span className="block mt-3 text-red-700">{tutorActionError}</span>}
          </>
        }
        confirmLabel="Delete tutor"
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
