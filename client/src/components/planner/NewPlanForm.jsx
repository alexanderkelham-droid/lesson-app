import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ClipboardList } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate } from '../../lib/datetime'
import LoadingSpinner from '../shared/LoadingSpinner'

// Start a lesson plan: title, student and (managers) tutor. Lessons come from
// the student's weekly times, so the planner opens on the next lesson.
export default function NewPlanForm({ user, basePath, initialStudentId = '' }) {
  const navigate = useNavigate()
  const isManager = user?.role === 'manager'
  const [students, setStudents] = useState([])
  const [tutors, setTutors] = useState([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState(initialStudentId)
  const [tutorId, setTutorId] = useState(isManager ? '' : String(user?.id || ''))
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/users')
      .then(res => {
        setStudents(res.data.filter(u => u.role === 'student'))
        setTutors(res.data.filter(u => u.role === 'tutor'))
      })
      .catch(() => setError('Could not load students and tutors'))
      .finally(() => setLoading(false))
  }, [])

  // Suggest a title from the student's first name until the tutor types one
  useEffect(() => {
    if (titleTouched) return
    const stu = students.find(s => String(s.id) === String(studentId))
    setTitle(stu ? `${stu.name.split(' ')[0]}'s lessons (from ${fmtDate(new Date())})` : '')
  }, [studentId, students, titleTouched])

  async function create(e) {
    e.preventDefault()
    if (!title.trim() || !studentId || (isManager && !tutorId)) {
      setError(isManager ? 'Choose a student and a tutor, and give the plan a title.' : 'Choose a student and give the plan a title.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/lesson-plans', { title: title.trim(), studentId, tutorId: isManager ? tutorId : undefined })
      navigate(`${basePath}/lesson-plans/${res.data.id}/builder`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the plan')
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <button type="button" onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-2.5 mb-3">
        <ArrowLeft className="icon-sm" aria-hidden /> Back
      </button>
      <h1 className="page-title">New lesson plan</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Create the plan, then plan each lesson one at a time.</p>

      <form onSubmit={create} className="card space-y-4">
        <div>
          <label className="label" htmlFor="np-student">Student</label>
          <select id="np-student" value={studentId} onChange={e => setStudentId(e.target.value)} className="input" required>
            <option value="">Select student…</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label className="label" htmlFor="np-tutor">Tutor</label>
            <select id="np-tutor" value={tutorId} onChange={e => setTutorId(e.target.value)} className="input" required>
              <option value="">Select tutor…</option>
              {tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="np-title">Plan title</label>
          <input
            id="np-title"
            value={title}
            onChange={e => { setTitle(e.target.value); setTitleTouched(true) }}
            maxLength={200}
            className="input"
            placeholder="e.g. Alice's Maths programme"
            required
          />
        </div>
        <p className="text-xs text-gray-500">Lessons are added from the weekly lesson times on the student's profile. You can also add one-off lessons in the planner.</p>
        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="icon mt-0.5" aria-hidden /> <span>{error}</span>
          </p>
        )}
        <button type="submit" disabled={saving} className="btn-primary w-full">
          <ClipboardList className="icon" aria-hidden /> {saving ? 'Creating…' : 'Create and start planning'}
        </button>
      </form>
    </main>
  )
}
