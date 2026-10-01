import { useState, useEffect, useId } from 'react'
import { Check, GraduationCap, Plus, Trash2, UserRound, X } from 'lucide-react'
import api from '../../lib/api'
import { CopyableText } from '../shared/ConfirmModal'
import { DAY_LONG, SUBJECT_LABELS, sortSlots } from '../../lib/dates'

const SCHOOL_YEARS = ['Reception', ...Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`), 'Adult/Other']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

let rowSeq = 0
const newRow = (over = {}) => ({ key: `r${++rowSeq}`, dayOfWeek: 0, time: '', subject: '', durationMins: 60, ...over })

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
  const [schoolYear, setSchoolYear]   = useState('')
  const [ixlUsername, setIxlUsername] = useState('')
  const [slots, setSlots]             = useState([]) // weekly lesson rows
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
      setSchoolYear(editUser.schoolYear || '')
      setIxlUsername(editUser.ixlUsername || '')
      // Older students may only have a day (no time yet) — show those rows with an empty time to fill in
      setSlots(sortSlots(editUser.slots || editUser.lessonDays).map(sl => newRow({
        dayOfWeek: sl.dayOfWeek,
        time: sl.time || '',
        subject: sl.subject || '',
        durationMins: sl.durationMins || 60,
      })))
    }
  }, [editUser])

  const updateSlot = (key, patch) => setSlots(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const removeSlot = key => setSlots(prev => prev.filter(r => r.key !== key))
  const addSlot = () => setSlots(prev => {
    const last = prev[prev.length - 1]
    return [...prev, newRow(last ? { dayOfWeek: last.dayOfWeek, subject: last.subject, durationMins: last.durationMins } : {})]
  })

  // Returns an error message, or null when the rows are fine
  function checkSlots() {
    const seen = new Set()
    for (const r of slots) {
      if (r.time && !TIME_RE.test(r.time)) return `"${r.time}" isn't a valid time. Use 24-hour HH:MM, e.g. 16:00.`
      const len = Number(r.durationMins)
      if (r.durationMins !== '' && !(Number.isInteger(len) && len > 0 && len <= 600)) return 'Lesson length must be between 1 and 600 minutes.'
      if (r.time) {
        const k = `${r.dayOfWeek}|${r.time}`
        if (seen.has(k)) return `There are two lessons on ${DAY_LONG[r.dayOfWeek]} at ${r.time}. Change one of the times.`
        seen.add(k)
      }
    }
    return null
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
    if (isStudent) {
      const slotError = checkSlots()
      if (slotError) { setError(slotError); return }
    }
    setSaving(true)
    setError('')
    try {
      const lessonDays = slots.map(r => ({
        dayOfWeek: Number(r.dayOfWeek),
        time: r.time || null,
        subject: r.subject || null,
        durationMins: r.durationMins ? Number(r.durationMins) : null,
      }))
      const payload = isStudent
        ? { name, email, age, subjectFocus, schoolYear: schoolYear || null, ixlUsername: ixlUsername.trim() || null, lessonDays }
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
      <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} className={`modal-panel w-full ${isStudent ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor={`${uid}-year`}>School year</label>
                    <select id={`${uid}-year`} value={schoolYear} onChange={e => setSchoolYear(e.target.value)} className="input">
                      <option value="">Select…</option>
                      {SCHOOL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      {schoolYear && !SCHOOL_YEARS.includes(schoolYear) && <option value={schoolYear}>{schoolYear}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`${uid}-ixl`}>IXL username</label>
                    <input id={`${uid}-ixl`} value={ixlUsername} onChange={e => setIxlUsername(e.target.value)} maxLength={80} className="input" placeholder="e.g. alice.smith" autoComplete="off" spellCheck={false} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 -mt-2">The IXL username is printed at the top of each lesson plan.</p>

                <fieldset>
                  <legend className="label">Weekly lessons</legend>
                  <p className="text-xs text-gray-500 mb-2">
                    Add a row for each regular lesson. A student can have two on one day. Times are UK time.
                  </p>
                  {slots.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">No regular lessons yet.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="hidden sm:grid grid-cols-[1.3fr_1fr_1.2fr_0.9fr_auto] gap-2 eyebrow px-0.5" aria-hidden>
                        <span>Day</span><span>Time (UK)</span><span>Subject</span><span>Minutes</span><span className="w-8" />
                      </div>
                      {slots.map((r, i) => (
                        <div key={r.key} className="grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_1.2fr_0.9fr_auto] gap-2 items-center" role="group" aria-label={`Lesson ${i + 1}`}>
                          <select value={r.dayOfWeek} onChange={e => updateSlot(r.key, { dayOfWeek: Number(e.target.value) })} className="input" aria-label={`Lesson ${i + 1} day`}>
                            {DAY_LONG.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                          </select>
                          <input
                            type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5}
                            value={r.time}
                            onChange={e => updateSlot(r.key, { time: e.target.value.trim() })}
                            onBlur={e => { const v = e.target.value.trim(); if (/^\d:\d\d$/.test(v)) updateSlot(r.key, { time: `0${v}` }) }}
                            className={`input tabular-nums ${r.time && !TIME_RE.test(r.time) ? 'border-red-300' : ''}`}
                            aria-label={`Lesson ${i + 1} time, UK, 24-hour HH:MM`}
                            aria-invalid={!!r.time && !TIME_RE.test(r.time)}
                          />
                          <select value={r.subject} onChange={e => updateSlot(r.key, { subject: e.target.value })} className="input" aria-label={`Lesson ${i + 1} subject`}>
                            <option value="">Subject…</option>
                            {Object.entries(SUBJECT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <div className="flex items-center gap-1 sm:contents">
                            <input
                              type="number" min="1" max="600" step="5"
                              value={r.durationMins}
                              onChange={e => updateSlot(r.key, { durationMins: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="input tabular-nums"
                              aria-label={`Lesson ${i + 1} length in minutes`}
                            />
                            <button type="button" onClick={() => removeSlot(r.key)} className="btn-ghost px-2 text-gray-500 hover:text-red-700" aria-label={`Remove lesson ${i + 1}`} title="Remove lesson">
                              <Trash2 className="icon" aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={addSlot} className="btn-secondary btn-sm mt-2">
                    <Plus className="icon" aria-hidden /> Add lesson
                  </button>
                  {slots.some(r => !r.time) && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                      Lessons without a time can't be added to the timetable yet. Add a time to each row.
                    </p>
                  )}
                  {isEdit && (
                    <p className="text-xs text-gray-500 mt-2">Changing these updates the student's upcoming lessons.</p>
                  )}
                </fieldset>
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
