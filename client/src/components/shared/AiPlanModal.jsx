import { useState, useEffect, useId } from 'react'
import { AlertTriangle, RefreshCw, Sparkles, X } from 'lucide-react'
import api from '../../lib/api'
import SheetPreviewModal from './SheetPreviewModal'
import SheetHistoryBadge from './SheetHistoryBadge'
import useSheetHistory from '../../hooks/useSheetHistory'

import { CUSTOM_LABELS } from '../../lib/customTypes'
import { fmtDayTime } from '../../lib/datetime'
import { subjectLabel } from '../../lib/sessions'

// "Tue 7 Oct, 17:40 · Maths" (UK time)
const fmtSession = s => [fmtDayTime(s.scheduledAt), subjectLabel(s.subject)].filter(Boolean).join(' · ')

/**
 * "Plan with AI" — asks the API for suggested next lessons based on the
 * student's history, lets the tutor tick what they want and choose which
 * session each lesson goes into, then hands the chosen items to onApply.
 *
 * defaultSessionId preselects the lesson the first suggested lesson goes
 * into (later lessons follow on from it); defaultSessionLabel names it when
 * it isn't one of the upcoming lessons (e.g. a lesson already in the past).
 *
 * onApply(assignments) where assignments = [{ sessionId|null, items: [{ sheetId?, sheet?, customTitle?, customType?, tutorNotes }] }]
 */
export default function AiPlanModal({ planId, onClose, onApply, applyLabel = 'Add to lessons', defaultSessionId = null, defaultSessionLabel = '' }) {
  const [lessons, setLessons] = useState(1)
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [picked, setPicked] = useState({})       // "l-i" -> bool
  const [targets, setTargets] = useState({})     // lesson index -> sessionId|''
  const [previewId, setPreviewId] = useState(null)
  const [applying, setApplying] = useState(false)
  const [history] = useSheetHistory(planId)
  const titleId = useId()

  // Escape closes (unless busy, or the sheet preview on top is open)
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || previewId || loading || applying) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewId, loading, applying, onClose])

  async function generate() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.post(`/lesson-plans/${planId}/ai-plan`, { lessons, instructions })
      const r = res.data
      if (!r || !Array.isArray(r.lessons) || r.lessons.length === 0 || r.lessons.every(l => !l.items?.length)) {
        setError('The AI could not put together a usable plan this time. Try again, or add a short note about what to focus on.')
        return
      }
      r.upcomingSessions = r.upcomingSessions || []
      setResult(r)
      const p = {}
      r.lessons.forEach((l, li) => l.items.forEach((_, ii) => { p[`${li}-${ii}`] = true }))
      setPicked(p)
      const t = {}
      const up = r.upcomingSessions
      const startIdx = defaultSessionId ? up.findIndex(s => s.id === defaultSessionId) : -1
      r.lessons.forEach((_, li) => {
        if (!defaultSessionId) t[li] = up[li]?.id ?? ''
        else if (startIdx >= 0) t[li] = up[startIdx + li]?.id ?? ''
        // Chosen lesson isn't upcoming: first lesson goes there, the rest into the next lessons
        else t[li] = li === 0 ? defaultSessionId : (up[li - 1]?.id ?? '')
      })
      setTargets(t)
    } catch (e) {
      const msg = e.response?.data?.error
      setError(e.response?.status === 502
        ? `The AI could not put together a usable plan${msg ? `: ${msg}` : ''}. Try again in a moment.`
        : msg || 'Could not generate a plan. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function apply() {
    const assignments = result.lessons.map((l, li) => ({
      sessionId: targets[li] ? Number(targets[li]) : null,
      items: l.items.filter((_, ii) => picked[`${li}-${ii}`]).map((it, ii) => ({
        sheetId: it.sheetId,
        sheet: it.sheet,
        customTitle: it.customTitle,
        customType: it.customType,
        // Keep the AI's reasoning as a private tutor note; the lesson goal on the first item
        tutorNotes: [ii === 0 && l.goal ? `Goal: ${l.goal}` : null, it.reason ? `AI: ${it.reason}` : null, ii === 0 && l.tutorNotes ? `Tips: ${l.tutorNotes}` : null].filter(Boolean).join('\n'),
      })),
    })).filter(a => a.items.length)
    if (!assignments.length) return
    setApplying(true)
    try {
      await onApply(assignments)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not add the items')
    } finally {
      setApplying(false)
    }
  }

  const pickedCount = Object.values(picked).filter(Boolean).length

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !loading && !applying && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-redwood-50 text-redwood-700 flex items-center justify-center flex-shrink-0">
              <Sparkles className="icon" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="section-title">Plan with AI</h2>
              <p className="text-xs text-gray-500 mt-0.5">Suggests the next lessons from this student's history, scores and mistakes. Nothing is saved until you add it.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={loading || applying} className="btn-ghost -mr-2" aria-label="Close" title="Close">
            <X className="icon" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Options */}
          <div className="grid sm:grid-cols-[auto,1fr] gap-3 items-start">
            <div>
              <label className="label" htmlFor={`${titleId}-lessons`}>Lessons to plan</label>
              <select id={`${titleId}-lessons`} value={lessons} onChange={e => setLessons(Number(e.target.value))} className="input w-auto" disabled={loading}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? 'Next lesson' : `Next ${n} lessons`}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`${titleId}-focus`}>Anything to focus on? (optional)</label>
              <textarea
                id={`${titleId}-focus`}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                disabled={loading}
                rows={2}
                maxLength={800}
                className="input resize-none text-sm"
                placeholder="e.g. 45 minutes. Mock SATs in May — focus on fractions and reading inference. No IXL this week."
              />
            </div>
          </div>
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading
              ? 'Thinking… (up to ~30s)'
              : result
                ? <><RefreshCw className="icon" aria-hidden /> Suggest again</>
                : <><Sparkles className="icon" aria-hidden /> Suggest lessons</>}
          </button>

          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="icon mt-0.5" aria-hidden />
              <span>{error}</span>
            </p>
          )}

          {result && (
            <>
              <div className="card-muted p-4">
                <p className="eyebrow text-redwood-700 mb-1">Assessment</p>
                <p className="text-sm text-gray-800 leading-relaxed">{result.assessment}</p>
                {result.focusAreas?.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {result.focusAreas.map((f, i) => (
                      <li key={i} className="text-sm text-gray-700"><span className="font-semibold">{f.topic}</span> — {f.why}</li>
                    ))}
                  </ul>
                )}
              </div>

              {result.lessons.map((l, li) => (
                <div key={li} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="eyebrow text-forest-700">Lesson {li + 1}</p>
                      <p className="text-sm font-medium text-gray-900">{l.goal}</p>
                    </div>
                    <select
                      value={targets[li] ?? ''}
                      onChange={e => setTargets(t => ({ ...t, [li]: e.target.value }))}
                      className="input w-auto text-xs py-1"
                      aria-label={`Session for lesson ${li + 1}`}
                    >
                      {defaultSessionId && !result.upcomingSessions.some(s => s.id === defaultSessionId) && (
                        <option value={defaultSessionId}>{defaultSessionLabel || 'This lesson'}</option>
                      )}
                      {result.upcomingSessions.map(s => <option key={s.id} value={s.id}>{fmtSession(s)}</option>)}
                      <option value="">Unscheduled</option>
                    </select>
                  </div>
                  <ul className="space-y-2">
                    {l.items.map((it, ii) => {
                      const key = `${li}-${ii}`
                      return (
                        <li key={key} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={!!picked[key]}
                            onChange={e => setPicked(p => ({ ...p, [key]: e.target.checked }))}
                            className="mt-1 accent-redwood-600"
                            aria-label={`Include ${it.sheet?.title || it.customTitle}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {it.sheet ? (
                                <button type="button" onClick={() => setPreviewId(it.sheetId)} className="text-sm font-medium text-gray-900 hover:text-redwood-700 hover:underline text-left">
                                  {it.sheet.title}
                                </button>
                              ) : (
                                <span className="text-sm font-medium text-gray-900">
                                  <span className="badge mr-1">{CUSTOM_LABELS[it.customType] || 'Custom task'}</span>
                                  {it.customTitle}
                                </span>
                              )}
                              {it.sheet && <span className="text-xs text-gray-500">{it.sheet.subject} · {it.sheet.topic}{it.sheet.difficultyLevel ? ` · Level ${it.sheet.difficultyLevel}` : ''}</span>}
                              {it.sheetId && <SheetHistoryBadge history={history[it.sheetId]} />}
                              {it.sheet?.needsReview && <span className="badge-warning">Needs review</span>}
                              {it.minutes && <span className="text-xs text-gray-500">~{it.minutes} min</span>}
                            </div>
                            <p className="text-xs text-gray-600">{it.reason}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {l.tutorNotes && <p className="text-xs text-gray-500 mt-2 italic">Tip: {l.tutorNotes}</p>}
                </div>
              ))}
            </>
          )}
        </div>

        {result && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">The AI's reasons are saved as private tutor notes on each item.</p>
            <button onClick={apply} disabled={applying || pickedCount === 0} className="btn-primary">
              {applying ? 'Adding…' : `${applyLabel} (${pickedCount})`}
            </button>
          </div>
        )}
      </div>
    </div>
    <SheetPreviewModal sheetId={previewId} onClose={() => setPreviewId(null)} />
    </>
  )
}
