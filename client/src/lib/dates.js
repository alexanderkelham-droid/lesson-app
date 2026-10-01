import { ukDateKey, ukTimeKey } from './datetime'

// "YYYY-MM-DD" for a moment, in UK time (Europe/London), whatever time zone
// the viewer's device is on. Kept under its old name so existing imports work.
// (Never use toISOString() for this — it converts to UTC, which shifts
// midnight to the previous day during British Summer Time.)
export function localDateKey(date = new Date()) {
  return ukDateKey(date)
}

// ── Weekly lesson slots ────────────────────────────────────────────────
// A student's regular lessons: { id, dayOfWeek (0 = Mon … 6 = Sun),
// time ("HH:MM" UK) | null, subject | null, durationMins | null }

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const SUBJECT_LABELS = { maths: 'Maths', english: 'English', '11plus': '11+', other: 'Other' }
export const subjectLabel = s => (s ? SUBJECT_LABELS[s] || s : '')

// Mon=0 … Sun=6 for a moment, in UK time
export function ukDayOfWeek(date) {
  const [y, m, d] = ukDateKey(date).split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday (UTC date maths, not device time)
  return js === 0 ? 6 : js - 1
}

// Normalise whatever the API returned (slot objects, or bare day numbers)
export function toSlots(lessonDays) {
  return (lessonDays || []).map(d => (typeof d === 'object' && d !== null ? d : { dayOfWeek: d, time: null, subject: null, durationMins: null }))
}

export function sortSlots(slots) {
  return [...toSlots(slots)].sort((a, b) => a.dayOfWeek - b.dayOfWeek || String(a.time || '').localeCompare(String(b.time || '')))
}

// "Tue 16:00 Maths"
export function fmtSlot(slot) {
  return [DAY_SHORT[slot.dayOfWeek], slot.time, subjectLabel(slot.subject)].filter(Boolean).join(' ')
}

// When a student has two or more lessons on the same UK day, label them
// "Session 1" / "Session 2" by time. Returns Map(sessionId -> label).
// `studentOf(s)` returns the student id for a session.
export function sessionNumbers(sessions, studentOf = s => s.lessonPlan?.studentId ?? s.studentId) {
  const groups = new Map()
  for (const s of sessions || []) {
    if (!s?.scheduledAt) continue
    const key = `${studentOf(s)}|${ukDateKey(s.scheduledAt)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  const out = new Map()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => ukTimeKey(a.scheduledAt).localeCompare(ukTimeKey(b.scheduledAt)))
    list.forEach((s, i) => out.set(s.id, `Session ${i + 1}`))
  }
  return out
}
