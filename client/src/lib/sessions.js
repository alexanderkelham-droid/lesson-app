import api from './api'

const fmtWhen = d => new Date(d).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

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
    const opts = mergeConfirmOptions(conflict)
    // Last-resort fallback only; every caller passes a styled confirm
    const ok = confirm ? await confirm(opts) : window.confirm(opts.message)
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
