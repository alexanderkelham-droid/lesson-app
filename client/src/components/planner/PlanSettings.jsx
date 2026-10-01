import { useState, useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Clock, Settings } from 'lucide-react'
import api from '../../lib/api'

// Plan-wide settings (title, status, tutor, note to student) with their own
// Save. Weekly lesson times live on the student's profile, not here.
export default function PlanSettings({ plan, tutors, isManager, basePath, onSaved }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(plan.title || '')
  const [status, setStatus] = useState(plan.status || 'draft')
  const [tutorId, setTutorId] = useState(String(plan.tutorId || ''))
  const [studentNotes, setStudentNotes] = useState(plan.studentNotes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const id = useId()

  // Reset the form when a different plan loads
  useEffect(() => {
    setTitle(plan.title || '')
    setStatus(plan.status || 'draft')
    setTutorId(String(plan.tutorId || ''))
    setStudentNotes(plan.studentNotes || '')
  }, [plan.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = title !== (plan.title || '') || status !== (plan.status || 'draft') ||
    tutorId !== String(plan.tutorId || '') || studentNotes !== (plan.studentNotes || '')

  async function save(e) {
    e.preventDefault()
    if (!title.trim()) return setError('The plan needs a title.')
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const body = { title: title.trim(), status, studentNotes: studentNotes || null }
      if (isManager && tutorId) body.tutorId = tutorId
      await api.put(`/lesson-plans/${plan.id}`, body)
      await onSaved?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the plan settings')
    } finally {
      setSaving(false)
    }
  }

  const tutorName = tutors.find(t => String(t.id) === tutorId)?.name || plan.tutor?.name || ''

  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={`${id}-body`} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <ChevronRight className={`icon text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <Settings className="icon text-gray-400" aria-hidden />
          <span className="section-title">Plan settings</span>
        </span>
        <span className="text-xs text-gray-500 capitalize">{dirty ? <span className="badge-warning normal-case">Unsaved changes</span> : plan.status}</span>
      </button>

      {open && (
        <form id={`${id}-body`} onSubmit={save} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor={`${id}-title`}>Plan title</label>
            <input id={`${id}-title`} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className="input" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor={`${id}-status`}>Status</label>
              <select id={`${id}-status`} value={status} onChange={e => setStatus(e.target.value)} className="input">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`${id}-tutor`}>Tutor</label>
              {isManager ? (
                <select id={`${id}-tutor`} value={tutorId} onChange={e => setTutorId(e.target.value)} className="input">
                  {tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <input id={`${id}-tutor`} value={tutorName} readOnly disabled className="input" />
              )}
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`${id}-note`}>Note for the student <span className="text-gray-400 font-normal">(optional, shown at the top of their portal)</span></label>
            <textarea
              id={`${id}-note`}
              value={studentNotes}
              onChange={e => setStudentNotes(e.target.value)}
              className="input resize-none"
              rows={2}
              maxLength={2000}
              placeholder="e.g. This week we're focusing on fractions. Try the first sheet before our lesson."
            />
          </div>
          <p className="text-xs text-gray-600 bg-cream/60 border border-gray-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <Clock className="icon-sm mt-0.5 text-gray-500" aria-hidden />
            <span>
              Weekly lesson times are set on the student's profile.{' '}
              <Link to={`${basePath}/students/${plan.studentId}`} className="link font-medium">Open {plan.student?.name ? `${plan.student.name.split(' ')[0]}'s` : 'the student'} profile</Link>
            </span>
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="icon mt-0.5" aria-hidden /> <span>{error}</span>
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <span role="status" aria-live="polite" className="text-sm">
              {saved && <span className="text-forest-700 inline-flex items-center gap-1"><Check className="icon-sm" aria-hidden /> Saved</span>}
            </span>
            <button type="submit" disabled={saving || !dirty} className="btn-primary btn-sm">{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
