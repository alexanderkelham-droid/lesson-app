import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { fmtDate } from '../lib/datetime'

// The student's memory of every worksheet across all their plans:
// { [sheetId]: { timesSet, completed, lastCompletedAt, lastScore, bestScore, planned } }
// Any of the student's plan ids works — the history covers all of their plans.
export default function useSheetHistory(planId) {
  const [history, setHistory] = useState({})
  const reload = useCallback(() => {
    if (!planId) { setHistory({}); return }
    api.get(`/lesson-plans/${planId}/sheet-history`).then(r => setHistory(r.data || {})).catch(() => {})
  }, [planId])
  useEffect(() => { reload() }, [reload])
  return [history, reload]
}

// UK date, e.g. "7 Oct 2026"
const fmt = d => fmtDate(d)

// One-line description for tooltips and confirm dialogs
export function describeHistory(h) {
  if (!h) return ''
  if (h.completed > 0) {
    const score = h.lastScore != null ? ` (${Math.round(h.lastScore)}%)` : ''
    const when = h.lastCompletedAt ? ` on ${fmt(h.lastCompletedAt)}` : ''
    return h.completed > 1 ? `Done ${h.completed} times, last${when}${score}` : `Done${when}${score}`
  }
  if (h.planned) return 'Already planned'
  return ''
}

// Options for a styled confirm (useConfirm) before re-setting a sheet the
// student has already done / has planned. Returns null when no need to ask.
export function repeatConfirmOptions(h, studentName) {
  if (!h || (!h.completed && !h.planned)) return null
  const who = studentName ? studentName.split(' ')[0] : 'This student'
  if (h.completed > 0) {
    const when = h.lastCompletedAt ? ` on ${fmt(h.lastCompletedAt)}` : ''
    const score = h.lastScore != null ? ` (${Math.round(h.lastScore)}%)` : ''
    const times = h.completed > 1 ? ` ${h.completed} times, most recently` : ''
    return {
      title: 'Set this sheet again?',
      message: `${who} did this${times}${when}${score}. Set it again for revision?`,
      confirmLabel: 'Set it again',
    }
  }
  return {
    title: 'Already planned',
    message: `This sheet is already planned for ${who}. Add it again anyway?`,
    confirmLabel: 'Add anyway',
  }
}
