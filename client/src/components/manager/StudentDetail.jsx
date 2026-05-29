import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import AddStudentModal from './AddStudentModal'
import ConfirmModal from '../shared/ConfirmModal'
import SessionsPanel from '../shared/SessionsPanel'
import api from '../../lib/api'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const statusConfig = {
  locked:      { label: 'Locked',      color: 'bg-gray-100 text-gray-500' },
  available:   { label: 'Available',   color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' },
  completed:   { label: 'Completed',   color: 'bg-green-100 text-green-700' }
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
  const [loading, setLoading]   = useState(true)
  const [showEdit, setShowEdit] = useState(false)
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

  async function load() {
    try {
      const [userRes, plansRes] = await Promise.all([
        api.get(`/users/${studentId}`),
        api.get('/lesson-plans')
      ])
      setStudent(userRes.data)
      const studentPlans = plansRes.data.filter(p => p.studentId === parseInt(studentId))
      setPlans(studentPlans)
      const active = studentPlans.find(p => p.status === 'active') || studentPlans[0] || null
      setActivePlan(active)

      if (active) {
        const logsRes = await api.get(`/lesson-plans/${active.id}/follow-up-logs`)
        setLogs(logsRes.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [studentId])

  async function handleDeletePlan() {
    if (!activePlan) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/lesson-plans/${activePlan.id}`)
      setConfirmDeletePlan(false)
      await load()
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
      alert('Score must be between 0 and 100, or leave blank.')
      return
    }
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
      alert(e.response?.data?.error || 'Failed to mark complete')
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
  if (!student) return <><Navbar /><div className="p-6 text-gray-500">Student not found.</div></>

  const items = activePlan?.items?.sort((a, b) => a.sequenceOrder - b.sequenceOrder) || []
  const completedItems = items.filter(i => i.status === 'completed')
  const totalPoints = completedItems.reduce((sum, i) => sum + (i.studentResponses?.[0]?.score ?? 0), 0)
  const avgScore    = completedItems.length > 0 ? Math.round(totalPoints / completedItems.length) : null
  const totalTime   = completedItems.reduce((sum, i) => sum + (i.studentResponses?.[0]?.timeSpentSeconds ?? 0), 0)

  const lessonDays = student.lessonDays?.map(d => typeof d === 'object' ? d.dayOfWeek : d) || []

  return (
    <>
      <Navbar title={student.name} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => navigate(basePath)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">
          ← Back
        </button>

        {/* Student header */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                {student.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{student.name}</h1>
                <p className="text-gray-500 text-sm">{student.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {student.age && (
                    <span className="badge bg-gray-100 text-gray-600">Age {student.age}</span>
                  )}
                  {student.subjectFocus && (
                    <span className="badge bg-brand-50 text-brand-700 capitalize">{student.subjectFocus}</span>
                  )}
                  {lessonDays.length > 0 && (
                    <div className="flex gap-1">
                      {lessonDays.map(d => (
                        <span key={d} className="badge bg-purple-50 text-purple-700 text-xs">{DAY_NAMES[d]}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {user?.role === 'manager' && (
                <div className="flex gap-2 flex-wrap justify-end">
                  <button onClick={() => setShowEdit(true)} className="btn-secondary text-xs py-1.5">
                    Edit Profile
                  </button>
                  <button onClick={() => setShowResetPassword(true)} className="text-xs py-1.5 px-3 text-brand-700 hover:bg-brand-50 rounded-lg border border-brand-200 transition-colors">
                    Reset Password
                  </button>
                  <button onClick={() => setConfirmDeleteStudent(true)} className="text-xs py-1.5 px-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors">
                    Delete
                  </button>
                </div>
              )}
              {user?.role === 'tutor' && (
                <button onClick={() => setShowResetPassword(true)} className="text-xs py-1.5 px-3 text-brand-700 hover:bg-brand-50 rounded-lg border border-brand-200 transition-colors">
                  Reset Password
                </button>
              )}
              {/* Stats */}
              <div className="flex gap-6 text-right">
                <div>
                  <p className="text-2xl font-bold text-brand-600">{completedItems.length}/{items.length}</p>
                  <p className="text-xs text-gray-500">Sheets done</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${avgScore !== null ? (avgScore >= 70 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
                    {avgScore !== null ? `${avgScore}%` : '--'}
                  </p>
                  <p className="text-xs text-gray-500">Avg score</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-700">{Math.round(totalTime / 60)}m</p>
                  <p className="text-xs text-gray-500">Time spent</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plan selector */}
        {plans.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {plans.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePlan(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activePlan?.id === p.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {activePlan && (
          <>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">{activePlan.title}</h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/live`)}
                  className="btn-primary text-sm py-1.5 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Start Live Session
                </button>
                <button
                  onClick={() => navigate(`${basePath}/lesson-plans/${activePlan.id}/builder`)}
                  className="btn-secondary text-sm py-1.5"
                >
                  Edit Plan
                </button>
                {user?.role === 'manager' && (
                  <button
                    onClick={() => setConfirmDeletePlan(true)}
                    className="text-sm py-1.5 px-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
                  >
                    Delete Plan
                  </button>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="card overflow-hidden p-0 mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Sheet</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Subject</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Score</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Completed</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const resp = item.studentResponses?.[0]
                    const cfg  = statusConfig[item.status]
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 font-mono">{item.sequenceOrder}</td>
                        <td className="px-4 py-3">
                          {item.sheet ? (
                            <p className="font-medium text-gray-800">{item.sheet.title}</p>
                          ) : (
                            <p className="font-medium text-gray-800">
                              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold mr-1">
                                {item.customType === 'ixl_maths' ? 'IXL Maths'
                                  : item.customType === 'ixl_english' ? 'IXL English'
                                  : item.customType === 'paper' ? 'Paper'
                                  : 'Custom'}
                              </span>
                              {item.customTitle}
                            </p>
                          )}
                          {item.autoGenerated && (
                            <span className="text-xs text-purple-600">Auto follow-up</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{item.sheet?.subject || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {resp?.score !== undefined && resp?.score !== null ? (
                            <span className={`font-bold ${resp.score >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                              {resp.score}%
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {resp?.timeSpentSeconds ? `${Math.round(resp.timeSpentSeconds / 60)}m` : '--'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                          {resp?.completedAt ? new Date(resp.completedAt).toLocaleDateString() : '--'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.status !== 'completed' && (
                            <button
                              onClick={() => setMarkCompleteItem(item)}
                              className="text-xs text-brand-600 hover:bg-brand-50 px-2 py-1 rounded font-medium whitespace-nowrap"
                            >
                              Mark done
                            </button>
                          )}
                          {item.tutorNotes && (
                            <p className="text-xs text-gray-500 italic mt-1 max-w-xs truncate" title={item.tutorNotes}>
                              📝 {item.tutorNotes}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Sessions */}
            <div className="mb-6">
              <SessionsPanel planId={activePlan.id} planTitle={activePlan.title} />
            </div>

            {/* Follow-up logs for this plan */}
            {logs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Auto Follow-Up Log</h3>
                <div className="space-y-2">
                  {logs.map(log => (
                    <div key={log.id} className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800">
                      Scored <strong>{log.studentScore}%</strong> on "{log.sourceSheet?.title}" →
                      Added follow-up: "{log.followUpSheet?.title}"
                      <span className="text-purple-400 ml-2">{new Date(log.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {plans.length === 0 && (
          <div className="card text-center py-12 text-gray-400">
            <p className="mb-3">No lesson plans assigned to this student.</p>
            <button onClick={() => navigate(`${basePath}/lesson-plans/new?studentId=${studentId}`)} className="btn-primary text-sm">
              Create Lesson Plan
            </button>
          </div>
        )}
      </main>

      {showEdit && (
        <AddStudentModal
          editStudent={{ ...student, lessonDays }}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            load()
          }}
        />
      )}

      {/* Reset password modal */}
      {showResetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeResetPassword}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            {!resetGenerated ? (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Reset password</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Set a new password for <strong>{student?.name}</strong>. Leave blank to generate a memorable one.
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-600">New password (optional)</label>
                  <input
                    type="text"
                    value={resetPasswordValue}
                    onChange={e => setResetPasswordValue(e.target.value)}
                    placeholder="Leave blank to generate"
                    className="input text-sm mt-0.5"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">Minimum 4 characters, or leave blank.</p>
                </div>
                {resetError && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{resetError}</p>
                )}
                <div className="flex gap-2 mt-5">
                  <button onClick={closeResetPassword} className="btn-secondary flex-1" disabled={resetLoading}>Cancel</button>
                  <button onClick={handleResetPassword} className="btn-primary flex-1" disabled={resetLoading}>
                    {resetLoading ? 'Resetting...' : 'Reset password'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Password reset</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Share this new password with <strong>{student?.name}</strong>. It won't be shown again.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="font-mono text-lg font-bold text-gray-900 break-all">{resetGenerated}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(resetGenerated)}
                  className="btn-secondary w-full mt-3 text-sm"
                >
                  📋 Copy to clipboard
                </button>
                <button onClick={closeResetPassword} className="btn-primary w-full mt-2">Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mark-complete modal */}
      {markCompleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMarkCompleteItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Mark as completed</h2>
            <p className="text-sm text-gray-500 mb-4 truncate">{markCompleteItem.sheet?.title}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Score (0–100, optional)</label>
                <input
                  type="number" min="0" max="100" step="1"
                  value={markScore}
                  onChange={e => setMarkScore(e.target.value)}
                  placeholder="Leave blank if not graded"
                  className="input text-sm mt-0.5"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tutor note (optional)</label>
                <textarea
                  value={markNotes}
                  onChange={e => setMarkNotes(e.target.value)}
                  rows={3}
                  placeholder="What was covered, observations..."
                  className="input text-sm mt-0.5 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setMarkCompleteItem(null); setMarkScore(''); setMarkNotes('') }}
                className="btn-secondary flex-1"
                disabled={marking}
              >
                Cancel
              </button>
              <button onClick={handleMarkComplete} className="btn-primary flex-1" disabled={marking}>
                {marking ? 'Saving...' : 'Mark complete'}
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
            {deleteError && <span className="block mt-3 text-red-600">{deleteError}</span>}
          </>
        }
        confirmLabel="Delete Plan"
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
            {deleteError && <span className="block mt-3 text-red-600">{deleteError}</span>}
          </>
        }
        confirmLabel="Delete Student"
        destructive
        loading={deleting}
        onConfirm={handleDeleteStudent}
        onClose={() => { setConfirmDeleteStudent(false); setDeleteError('') }}
      />
    </>
  )
}
