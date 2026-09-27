import { useState, useEffect, useId } from 'react'
import { Check, GraduationCap, UserRound, X } from 'lucide-react'
import api from '../../lib/api'
import { CopyableText } from '../shared/ConfirmModal'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * AddUserModal — manager-only.
 * Modes:
 *  - new student: defaultRole='student'
 *  - new tutor: defaultRole='tutor'
 *  - edit existing: pass `editUser` (existing user object). Role can't be changed when editing.
 */
export default function AddUserModal({ onClose, onSaved, editUser, defaultRole = 'student' }) {
  const isEdit = !!editUser
  const [role, setRole] = useState(editUser?.role || defaultRole)

  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [age, setAge]                 = useState('')
  const [subjectFocus, setSubjectFocus] = useState('')
  const [lessonDays, setLessonDays]   = useState([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [created, setCreated]         = useState(null) // { name, email, password } after creating
  const uid = useId()

  const isStudent = role === 'student'

  // Escape closes (on the "added" screen it behaves like Done)
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || saving) return
      if (created) onSaved()
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [created, saving, onClose, onSaved])

  useEffect(() => {
    if (editUser) {
      setName(editUser.name || '')
      setEmail(editUser.email || '')
      setAge(editUser.age || '')
      setSubjectFocus(editUser.subjectFocus || '')
      setLessonDays(editUser.lessonDays?.map(d => typeof d === 'object' ? d.dayOfWeek : d) || [])
    }
  }, [editUser])

  function toggleDay(day) {
    setLessonDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  function generatePassword() {
    // Friendly readable temporary password
    const words = ['amber', 'birch', 'bloom', 'brave', 'bright', 'cedar', 'cloud', 'comet', 'coral', 'daisy',
      'eagle', 'ember', 'forest', 'frost', 'harbor', 'hazel', 'honey', 'lemon', 'maple', 'meadow',
      'ocean', 'olive', 'otter', 'panda', 'pebble', 'planet', 'river', 'robin', 'rocket', 'sunny',
      'tiger', 'tulip', 'poppy', 'willow', 'zebra']
    const pick = () => {
      const buf = new Uint32Array(1)
      crypto.getRandomValues(buf)
      return buf[0]
    }
    const w = () => words[pick() % words.length]
    setPassword(`${w()}-${w()}-${w()}-${10 + (pick() % 90)}`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name || !email || (!isEdit && !password)) {
      setError('Name, email' + (isEdit ? '' : ' and password') + ' are required')
      return
    }
    if (!isEdit && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = isStudent
        ? { name, email, age, subjectFocus, lessonDays }
        : { name, email }
      if (isEdit) {
        await api.put(`/users/${editUser.id}`, payload)
        onSaved()
      } else {
        await api.post('/users', { ...payload, role, password })
        // Show the login details once so they can be passed on
        setCreated({ name, email: email.trim().toLowerCase(), password })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const title = isEdit
    ? `Edit ${editUser.role === 'tutor' ? 'tutor' : 'student'}`
    : isStudent ? 'Add new student' : 'Add new tutor'

  if (created) {
    const details = `Email: ${created.email}\nPassword: ${created.password}`
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-added`} className="modal-panel w-full max-w-md p-6">
          <div className="w-10 h-10 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center mb-3">
            <Check className="icon-lg" aria-hidden />
          </div>
          <h2 id={`${uid}-added`} className="section-title mb-1">{created.name} added</h2>
          <p className="text-sm text-gray-600 mb-4">
            Share these login details with them. The password won't be shown again (you can always reset it from their profile).
          </p>
          <CopyableText multiline text={details} label="Copy details" />
          <button type="button" onClick={onSaved} className="btn-primary w-full mt-2">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} className="modal-panel w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 id={`${uid}-title`} className="section-title">{title}</h2>
            <button type="button" onClick={onClose} className="btn-ghost -mr-2" aria-label="Close" title="Close">
              <X className="icon" aria-hidden />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role toggle (only for new users) */}
            {!isEdit && (
              <div>
                <p className="label" id={`${uid}-type`}>Account type *</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={`${uid}-type`}>
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    aria-pressed={role === 'student'}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      role === 'student'
                        ? 'bg-redwood-50 border-redwood-500 text-redwood-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <GraduationCap className="icon" aria-hidden /> Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('tutor')}
                    aria-pressed={role === 'tutor'}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      role === 'tutor'
                        ? 'bg-redwood-50 border-redwood-500 text-redwood-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <UserRound className="icon" aria-hidden /> Tutor
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="label" htmlFor={`${uid}-name`}>Full name *</label>
              <input id={`${uid}-name`} value={name} onChange={e => setName(e.target.value)} maxLength={120} className="input" placeholder={isStudent ? 'e.g. Alice Smith' : 'e.g. James Tutor'} />
            </div>

            <div>
              <label className="label" htmlFor={`${uid}-email`}>Email *</label>
              <input id={`${uid}-email`} type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder={isStudent ? 'alice.smith@redwoodscholars.uk' : 'james@redwoodscholars.uk'} />
            </div>

            {!isEdit && (
              <div>
                <label className="label flex items-center justify-between">
                  <span>Temporary password *</span>
                  <button type="button" onClick={generatePassword} className="link text-xs font-medium">
                    Generate
                  </button>
                </label>
                <input type="text" aria-label="Temporary password" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="At least 8 characters" minLength={8} />
                <p className="text-xs text-gray-500 mt-1">
                  Share this with the {isStudent ? 'student' : 'tutor'} so they can sign in. They can change it later.
                </p>
              </div>
            )}

            {/* Student-specific fields */}
            {isStudent && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor={`${uid}-age`}>Age</label>
                    <input id={`${uid}-age`} type="number" min="4" max="99" value={age} onChange={e => setAge(e.target.value)} className="input" placeholder="e.g. 12" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`${uid}-subject`}>Subject focus</label>
                    <select id={`${uid}-subject`} value={subjectFocus} onChange={e => setSubjectFocus(e.target.value)} className="input">
                      <option value="">Select…</option>
                      <option value="maths">Maths</option>
                      <option value="english">English</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>

                <div>
                  <p className="label" id={`${uid}-days`}>Lesson days</p>
                  <div className="flex flex-wrap gap-2 mt-1" role="group" aria-labelledby={`${uid}-days`}>
                    {DAY_NAMES.map((dayName, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        aria-pressed={lessonDays.includes(idx)}
                        aria-label={dayName}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          lessonDays.includes(idx)
                            ? 'bg-redwood-600 border-redwood-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {dayName.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-red-700 text-sm bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${isStudent ? 'student' : 'tutor'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
