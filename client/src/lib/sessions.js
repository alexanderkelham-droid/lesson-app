import api from './api'
import { fmtDayLong, fmtTime, fmtDay, ukDateKey, todayUk, ukToIso } from './datetime'

// All lesson times are UK time, whatever the device's time zone
const fmtWhen = d => `${fmtDayLong(d)}, ${fmtTime(d)}`

// ── Lesson labels ──

const SUBJECT_LABELS = { maths: 'Maths', english: 'English', '11plus': '11+', other: 'Other' }
export const subjectLabel = subject => SUBJECT_LABELS[subject] || ''

// When a student has more than one lesson on the same (UK) day, number them
// by time: { [sessionId]: { index: 1, count: 2 } }. Lessons alone on their
// day are left out.
export function sameDayOrdinals(sessions = []) {
  const byDay = {}
  for (const s of sessions) {
    const key = ukDateKey(s.scheduledAt)
    ;(byDay[key] = byDay[key] || []).push(s)
  }
  const out = {}
  for (const list of Object.values(byDay)) {
    if (list.length < 2) continue
    list.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    list.forEach((s, i) => { out[s.id] = { index: i + 1, count: list.length } })
  }
  return out
}

export const sessionNumberLabel = ord => (ord ? `Session ${ord.index}` : '')

// "Tue 7 Oct · 17:40 · Maths · Session 2"
export function sessionLabel(session, ordinals = {}) {
  if (!session) return ''
  return [fmtDay(session.scheduledAt), fmtTime(session.scheduledAt), subjectLabel(session.subject), sessionNumberLabel(ordinals[session.id])]
    .filter(Boolean)
    .join(' · ')
}

// Start of a UK calendar day as a Date (offsetDays: 0 = today, 1 = tomorrow)
export function startOfUkDay(offsetDays = 0) {
  const [y, m, d] = todayUk().split('-').map(Number)
  const key = new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10)
  return new Date(ukToIso(key))
}

// Options for the styled merge dialog (pass to useConfirm's confirm())
export function mergeConfirmOptions(conflict) {
  return {
    title: 'Merge lessons?',
    message: `There's already a lesson on ${fmtWhen(conflict.scheduledAt)}.\n\nMerge them into that lesson? This lesson's planned work will move across.`,
    confirmLabel: 'Merge lessons',
    cancelLabel: 'Keep as it was',
  }
}

// Reschedule a lesson. If that day already has a lesson for the student,
// ask whether to merge the two (the work moves across). `confirm` is an async
// (options) => boolean, normally the one from useConfirm(). Returns the API
// result, or null if the user cancelled.
export async function rescheduleSession(sessionId, scheduledAt, extra = {}, confirm = null) {
  try {
    const res = await api.put(`/sessions/${sessionId}`, { scheduledAt, ...extra })
    return res.data
  } catch (e) {
    const conflict = e.response?.status === 409 && e.response.data?.conflict
    if (!conflict) throw e
    // Every caller passes the styled confirm; without one, keep the lesson as it was
    if (!confirm) return null
    const ok = await confirm(mergeConfirmOptions(conflict))
    if (!ok) return null
    const res = await api.put(`/sessions/${sessionId}`, { scheduledAt, merge: true, ...extra })
    return res.data
  }
}

export async function cancelSession(sessionId, moveWork = 'next') {
  const res = await api.post(`/sessions/${sessionId}/cancel`, { moveWork })
  return res.data
}

// Copy a missed lesson's unfinished work into the next lesson
export async function carryOverSession(sessionId) {
  const res = await api.post(`/sessions/${sessionId}/carryover`)
  return res.data
}
