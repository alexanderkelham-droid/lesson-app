import { useState, useEffect } from 'react'
import api from '../../lib/api'

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

  const isStudent = role === 'student'

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
    const adj = ['quick', 'happy', 'sunny', 'brave', 'bright', 'kind', 'eager']
    const noun = ['oak', 'pine', 'fern', 'willow', 'maple', 'birch', 'cedar']
    const num = Math.floor(100 + Math.random() * 900)
    setPassword(`${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${num}`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name || !email || (!isEdit && !password)) {
      setError('Name, email' + (isEdit ? '' : ' and password') + ' are required')
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
      } else {
        await api.post('/users', { ...payload, role, password })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const title = isEdit
    ? `Edit ${editUser.role === 'tutor' ? 'Tutor' : 'Student'}`
    : isStudent ? 'Add New Student' : 'Add New Tutor'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role toggle (only for new users) */}
            {!isEdit && (
              <div>
                <label className="label">Account Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      role === 'student'
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    🎓 Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('tutor')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      role === 'tutor'
                        ? 'bg-forest-50 border-forest-500 text-forest-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    👩‍🏫 Tutor
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="label">Full Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder={isStudent ? 'e.g. Alice Smith' : 'e.g. James Tutor'} />
            </div>

            <div>
              <label className="label">Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder={isStudent ? 'alice@school.com' : 'james@redwoodscholars.co.uk'} />
            </div>

            {!isEdit && (
              <div>
                <label className="label flex items-center justify-between">
                  <span>Temporary Password *</span>
                  <button type="button" onClick={generatePassword} className="text-xs text-brand-600 hover:text-brand-700 font-normal">
                    Generate
                  </button>
                </label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Set a temporary password" />
                <p className="text-xs text-gray-400 mt-1">
                  Share this with the {isStudent ? 'student' : 'tutor'} so they can sign in. They can change it later.
                </p>
              </div>
            )}

            {/* Student-specific fields */}
            {isStudent && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Age</label>
                    <input type="number" min="4" max="99" value={age} onChange={e => setAge(e.target.value)} className="input" placeholder="e.g. 12" />
                  </div>
                  <div>
                    <label className="label">Subject Focus</label>
                    <select value={subjectFocus} onChange={e => setSubjectFocus(e.target.value)} className="input">
                      <option value="">Select…</option>
                      <option value="maths">Maths</option>
                      <option value="english">English</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Lesson Days</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAY_NAMES.map((dayName, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          lessonDays.includes(idx)
                            ? 'bg-brand-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {dayName.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : `Add ${isStudent ? 'Student' : 'Tutor'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
