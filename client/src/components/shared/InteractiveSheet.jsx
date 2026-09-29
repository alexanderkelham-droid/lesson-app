import { openOriginalPdf } from '../../lib/print'
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'
import SheetIntro, { ImageHint } from './SheetIntro'
import { isQuestionCorrect } from '../../lib/marking'
import { AlertCircle, BookOpen, Check, CircleCheck, CircleX, Loader2, X, FileText } from 'lucide-react'

/**
 * Interactive in-session sheet. Used in the live session view.
 *
 * Both the tutor and student render this when a sheet is active. State is
 * synced via the session's live state, polled every 2 seconds.
 *
 * - Teacher: sees the student's answers as they're typed, marks each
 *   question correct / wrong, then "Save result".
 * - Student: types answers, sees the teacher's marks appear.
 *
 * Answers and marks are stored per lesson-plan item on the session
 * (liveAnswers[itemId][questionId]). The student's edits are queued and sent
 * in batches, so typing quickly across several boxes never drops an answer,
 * and anything still queued is sent before the sheet closes.
 *
 * A sheet that is already completed (homework, or saved earlier) shows the
 * saved answers read-only.
 */
export default function InteractiveSheet({
  sessionId,
  itemId,
  itemStatus,
  sheetId,
  isTeacher,
  onCloseSheet,
  onFinalized,
}) {
  const [sheet, setSheet]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [localAnswers, setLocalAnswers]   = useState({}) // student's own view
  const [remoteAnswers, setRemoteAnswers] = useState({})
  const [remoteMarks, setRemoteMarks]     = useState({})
  const [savedResponse, setSavedResponse] = useState(null) // for completed items
  const [syncState, setSyncState] = useState('idle') // idle | saving | saved | error
  const [finalizing, setFinalizing] = useState(false)
  const [savedScore, setSavedScore] = useState(undefined)
  const [marksDirty, setMarksDirty] = useState(false)
  const [saveError, setSaveError]   = useState('')

  const pending = useRef({})      // questionId -> value not yet sent
  const flushTimer = useRef(null)
  const isMounted = useRef(true)
  const pendingMarks = useRef(new Set())   // in-flight mark requests
  const marksRef = useRef({})               // latest marks, incl. unsent changes
  const markEdits = useRef({})              // qId -> mark the tutor set but the server hasn't confirmed
  // Refs mirror state for use inside the polling closure
  const syncStateRef = useRef('idle')
  useEffect(() => { syncStateRef.current = syncState }, [syncState])

  const completed = itemStatus === 'completed' || savedScore !== undefined
  const readOnlyForStudent = !isTeacher && itemStatus === 'completed'

  // Load the sheet contents
  useEffect(() => {
    if (!sheetId) return
    setLoading(true)
    api.get(`/sheets/${sheetId}`)
      .then(res => setSheet(res.data))
      .finally(() => setLoading(false))
  }, [sheetId])

  // Completed item: show the saved attempt instead of an empty sheet
  useEffect(() => {
    if (itemStatus !== 'completed' || !itemId) return
    api.get(`/student-responses?lessonPlanItemId=${itemId}`)
      .then(res => setSavedResponse(res.data[0] || null))
      .catch(() => {})
  }, [itemId, itemStatus])

  // Send everything queued (merged) in one request
  const flush = useCallback(async () => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }
    const batch = pending.current
    if (Object.keys(batch).length === 0) return
    pending.current = {}
    if (isMounted.current) setSyncState('saving')
    try {
      await api.patch(`/sessions/${sessionId}/live-state`, { itemId, answers: batch })
      if (isMounted.current && Object.keys(pending.current).length === 0) setSyncState('saved')
    } catch (e) {
      if (e.response?.status === 409) { // sheet was finished meanwhile
        if (isMounted.current) setSyncState('idle')
        return
      }
      // Put the batch back (newer edits win); the next poll retries
      pending.current = { ...batch, ...pending.current }
      if (isMounted.current) setSyncState('error')
    }
  }, [sessionId, itemId])

  // Poll live state for marks + answers
  useEffect(() => {
    if (!sessionId) return
    isMounted.current = true

    async function poll() {
      try {
        const res = await api.get(`/sessions/${sessionId}/live-state`)
        if (!isMounted.current) return
        const incomingAnswers = res.data.liveAnswers?.[itemId] || {}
        setRemoteAnswers(incomingAnswers)
        // Don't let a poll clobber marks the tutor is mid-way through changing:
        // the server copy wins except for questions with a request in flight.
        const serverMarks = { ...(res.data.liveMarks?.[itemId] || {}) }
        if (isTeacher) {
          for (const [q, m] of Object.entries(markEdits.current)) {
            if (m === null) delete serverMarks[q]
            else serverMarks[q] = m
          }
        }
        marksRef.current = serverMarks
        setRemoteMarks(serverMarks)
        if (!isTeacher) {
          // Never overwrite what the student has typed but not yet sent
          setLocalAnswers(prev => {
            const next = { ...incomingAnswers }
            for (const k of Object.keys(pending.current)) next[k] = prev[k]
            return next
          })
          if (syncStateRef.current === 'error') flush()
        }
      } catch { /* keep polling */ }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [sessionId, isTeacher, itemId, flush])

  // Send anything queued when this sheet closes (tutor switched sheets, etc.)
  useEffect(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    if (Object.keys(pending.current).length) {
      api.patch(`/sessions/${sessionId}/live-state`, { itemId, answers: pending.current }).catch(() => {})
      pending.current = {}
    }
  }, [sessionId, itemId])

  function handleAnswerChange(qId, value) {
    if (isTeacher || readOnlyForStudent) return
    setLocalAnswers(prev => ({ ...prev, [qId]: value }))
    pending.current[qId] = value
    setSyncState('saving')
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flush, 400)
  }

  // Send only the changed question; the server merges it atomically.
  function setMark(qId, mark) {
    const current = marksRef.current
    const value = (mark === null || current[qId] === mark) ? null : mark
    const nextMarks = { ...current }
    if (value === null) delete nextMarks[qId]
    else nextMarks[qId] = value
    marksRef.current = nextMarks
    setRemoteMarks(nextMarks)
    if (completed) setMarksDirty(true)
    markEdits.current[qId] = value
    const req = api.patch(`/sessions/${sessionId}/live-state`, { itemId, marks: { [qId]: value } })
      .catch(() => {})
      .finally(() => {
        pendingMarks.current.delete(req)
        // Only stop overriding polls once the latest edit for this question has landed
        if (markEdits.current[qId] === value && ![...pendingMarks.current].some(r => r.qId === qId)) {
          delete markEdits.current[qId]
        }
      })
    req.qId = qId
    pendingMarks.current.add(req)
    return req
  }

  async function finalize() {
    setFinalizing(true)
    setSaveError('')
    try {
      // Make sure every mark has reached the server before saving
      while (pendingMarks.current.size) await Promise.all([...pendingMarks.current])
      const res = await api.post(`/sessions/${sessionId}/finalize-item`, { itemId })
      setSavedScore(res.data.score)
      setMarksDirty(false)
      onFinalized?.()
    } catch (e) {
      setSaveError(e.response?.data?.error || 'Could not save result')
    } finally {
      setFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    )
  }
  if (!sheet) return null

  if (sheet.contentJson?.printOnly) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-cream">
        <div className="card text-center max-w-md">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
            <FileText className="icon-lg" aria-hidden />
          </div>
          <h2 className="section-title mb-1">{sheet.title}</h2>
          <p className="text-sm text-gray-600">
            {isTeacher ? 'This is a paper worksheet (no online version yet). Work through the printed copy together.' : 'This is a paper worksheet. Use the printed copy your tutor gives you.'}
          </p>
          {isTeacher && (
            <button onClick={() => openOriginalPdf(sheet)} className="btn-secondary mt-4">
              <FileText className="icon" aria-hidden /> Open original PDF
            </button>
          )}
        </div>
      </div>
    )
  }

  const questions = sheet.contentJson?.questions || []

  // A completed item that was finished elsewhere (homework, or a previous
  // lesson) shows its saved attempt read-only. If it was saved during THIS
  // lesson, keep showing the live answers/marks so the tutor can adjust.
  const savedHere = savedResponse?.responsesJson?._liveSessionId === sessionId
  const useSaved = itemStatus === 'completed' && !!savedResponse && !savedHere
  const savedAnswers = savedResponse?.responsesJson || {}
  const savedMarks = savedResponse?.responsesJson?._tutorMarks || {}
  const answersToShow = useSaved ? savedAnswers : (isTeacher ? remoteAnswers : localAnswers)
  const marksToShow = useSaved && Object.keys(remoteMarks).length === 0 ? savedMarks : remoteMarks

  // A finished sheet (saved homework or a saved result) also shows what the
  // answer key says for questions the tutor didn't mark.
  const showKeyMarks = itemStatus === 'completed' || savedScore !== undefined
  const effectiveMark = q => {
    const m = marksToShow[q.id]
    if (m === 'correct' || m === 'wrong') return m
    if (!showKeyMarks) return undefined
    const auto = isQuestionCorrect(q, answersToShow[q.id])
    return auto === null ? undefined : auto ? 'correct' : 'wrong'
  }
  const effectiveMarks = questions.map(effectiveMark)
  const correctCount = effectiveMarks.filter(m => m === 'correct').length
  const wrongCount   = effectiveMarks.filter(m => m === 'wrong').length
  const markedCount  = correctCount + wrongCount
  const shownScore = savedScore !== undefined ? savedScore : savedResponse?.score
  const studentCanEdit = !isTeacher && !readOnlyForStudent && !useSaved && savedScore === undefined

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Sheet header */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
          <div className="min-w-[12rem] flex-1">
            <h2 className="font-serif font-semibold text-lg text-gray-900 leading-snug">{sheet.title}</h2>
            <p className="text-xs text-gray-500">
              {sheet.subject} · {sheet.topic}
              {markedCount > 0 && (
                <span className="ml-1">
                  · <span className="text-forest-700 font-medium">{correctCount} correct</span>
                  {wrongCount > 0 && <span className="text-red-700 font-medium">, {wrongCount} {isTeacher ? 'wrong' : studentCanEdit ? 'to try again' : 'not quite'}</span>}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {!isTeacher && !readOnlyForStudent && syncState !== 'idle' && (
              <span
                role="status"
                className={`inline-flex items-center gap-1 text-xs font-medium ${syncState === 'error' ? 'text-amber-800' : syncState === 'saving' ? 'text-gray-500' : 'text-forest-700'}`}
              >
                {syncState === 'saving' ? <Loader2 className="icon-sm animate-spin" aria-hidden />
                  : syncState === 'saved' ? <Check className="icon-sm" aria-hidden />
                  : <AlertCircle className="icon-sm" aria-hidden />}
                {syncState === 'saving' ? 'Sending…' : syncState === 'saved' ? 'Sent to your tutor' : 'Not sent yet, retrying…'}
              </span>
            )}
            {readOnlyForStudent && (
              <span className="badge-success"><Check className="icon-sm" aria-hidden /> Finished</span>
            )}
            {isTeacher && (
              completed && !marksDirty ? (
                <span className={shownScore == null || Math.round(shownScore) >= 70 ? 'badge-success' : Math.round(shownScore) >= 40 ? 'badge-warning' : 'badge-danger'}>
                  <Check className="icon-sm" aria-hidden />
                  Saved{shownScore != null ? ` · ${Math.round(shownScore)}%` : ''}
                </span>
              ) : (
                <button
                  onClick={finalize}
                  disabled={finalizing}
                  className="btn-primary btn-sm"
                  title="Save the student's answers and your marks to their record, and mark this item done"
                >
                  {finalizing ? 'Saving…' : completed ? 'Update result' : 'Save result'}
                </button>
              )
            )}
            {onCloseSheet && isTeacher && (
              <button
                onClick={onCloseSheet}
                className="btn-ghost p-1.5 flex-shrink-0"
                title="Close sheet for both"
                aria-label="Close sheet for both"
              >
                <X className="icon-lg" aria-hidden />
              </button>
            )}
          </div>
        </div>
        {saveError && <p className="text-xs text-red-700 mt-1">{saveError}</p>}
        {useSaved && (
          <p className="text-xs text-gray-500 mt-1">
            {isTeacher ? 'Already completed. Showing the saved answers.' : 'You already finished this sheet. Here are your answers.'}
          </p>
        )}
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        <div className="max-w-3xl mx-auto space-y-3">
        <SheetIntro content={sheet.contentJson} />
        {sheet.contentJson?.passage && (
          <div className="rounded-xl border border-gray-200 border-l-4 border-l-redwood-600 bg-cream p-5 mb-2">
            <p className="eyebrow text-redwood-700 mb-2 flex items-center gap-1.5">
              <BookOpen className="icon-sm" aria-hidden /> Read the story
            </p>
            <div className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">
              {sheet.contentJson.passage}
            </div>
          </div>
        )}

        {questions.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-12">This sheet has no questions to display.</p>
        )}

        {questions.map((q, i) => {
          const answer = answersToShow[q.id] ?? ''
          const mark   = effectiveMarks[i]
          const isCorrect = mark === 'correct'
          const isWrong   = mark === 'wrong'
          // Students can't change an answer once it's marked correct
          const locked = isTeacher || !studentCanEdit || isCorrect
          const isChoice = q.type === 'multiple_choice' && q.options?.length > 0
          const expected = q.type === 'ordering' ? q.correct_order
            : q.type === 'matching' ? q.pairs?.map(p => `${p.left} – ${p.right}`)
            : q.correct

          return (
            <div
              key={q.id || i}
              className={`rounded-xl border p-4 sm:p-5 shadow-card transition-colors ${
                isCorrect ? 'border-forest-200 bg-forest-50/60'
                : isWrong  ? 'border-red-200 bg-red-50/60'
                : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className={`flex-shrink-0 w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center ${
                  isCorrect ? 'bg-forest-600 text-white'
                  : isWrong  ? 'bg-red-700 text-white'
                  : 'bg-redwood-50 text-redwood-700'
                }`}>
                  {isCorrect ? <Check className="icon" aria-label="Correct" />
                    : isWrong ? <X className="icon" aria-label="Not quite" />
                    : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="eyebrow mb-1">
                    Question {i + 1}{q.points > 1 ? ` · ${q.points} points` : ''}
                  </p>
                  <p className="text-base text-gray-900 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
                  <ImageHint question={q} />
                  {q.options?.length > 0 && !isChoice && (
                    <ul className="mt-2 space-y-1">
                      {q.options.map((opt, j) => (
                        <li key={j} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="font-mono text-gray-400">{String.fromCharCode(97 + j)})</span>
                          {opt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="sm:ml-11">
                <p className="eyebrow mb-1.5">{isTeacher ? 'Answer' : 'Your answer'}</p>
                {isChoice ? (
                  <ChoiceButtons
                    question={q}
                    value={answer}
                    disabled={locked}
                    onChange={v => handleAnswerChange(q.id, v)}
                  />
                ) : q.type === 'free_text' || q.type === 'image_based' ? (
                  <textarea
                    value={typeof answer === 'string' ? answer : JSON.stringify(answer)}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    readOnly={locked}
                    className="input text-base resize-none read-only:bg-gray-50 read-only:focus:ring-0 read-only:focus:border-gray-300"
                    rows={3}
                    placeholder={isTeacher ? 'Student hasn\'t answered yet' : 'Type your answer here…'}
                  />
                ) : (
                  <input
                    type="text"
                    value={Array.isArray(answer) ? answer.join(', ') : typeof answer === 'object' ? JSON.stringify(answer) : answer}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    readOnly={locked}
                    className="input text-base py-2.5 read-only:bg-gray-50 read-only:focus:ring-0 read-only:focus:border-gray-300"
                    placeholder={isTeacher ? 'Student hasn\'t answered yet' : 'Your answer'}
                  />
                )}

                {isTeacher && expected?.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    <span className="font-medium text-gray-700">Expected:</span> {expected.join(q.type === 'ordering' ? ', ' : ' / ')}
                  </p>
                )}

                {isTeacher && !useSaved && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setMark(q.id, 'correct')}
                      aria-pressed={marksToShow[q.id] === 'correct'}
                      className={`btn btn-sm border ${
                        marksToShow[q.id] === 'correct' ? 'bg-forest-600 text-white border-forest-600 hover:bg-forest-700' : 'bg-white text-forest-700 border-forest-200 hover:bg-forest-50'
                      }`}
                    >
                      <Check className="icon-sm" aria-hidden /> Correct
                    </button>
                    <button
                      onClick={() => setMark(q.id, 'wrong')}
                      aria-pressed={marksToShow[q.id] === 'wrong'}
                      className={`btn btn-sm border ${
                        marksToShow[q.id] === 'wrong' ? 'bg-red-700 text-white border-red-700 hover:bg-red-800' : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
                      }`}
                    >
                      <X className="icon-sm" aria-hidden /> Wrong
                    </button>
                    {marksToShow[q.id] && (
                      <button
                        onClick={() => setMark(q.id, null)}
                        className="btn-ghost btn-sm"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {!isTeacher && (
                  // Space is reserved so the sheet doesn't jump when a mark arrives
                  <p
                    aria-live="polite"
                    className={`text-sm font-medium mt-2 min-h-[1.5rem] flex items-center gap-1.5 ${isCorrect ? 'text-forest-700' : 'text-red-700'}`}
                  >
                    {isCorrect
                      ? <><CircleCheck className="icon" aria-hidden /> {marksToShow[q.id] === 'correct' ? 'Well done! Your tutor marked this correct.' : 'Well done! That\'s correct.'}</>
                      : isWrong
                        ? <><CircleX className="icon" aria-hidden /> {studentCanEdit ? 'Not quite. Have another go.' : 'Not quite — your tutor will go through this with you.'}</>
                        : null}
                  </p>
                )}
                {isTeacher && useSaved && (isCorrect || isWrong) && (
                  <p className={`text-sm font-medium mt-2 flex items-center gap-1.5 ${isCorrect ? 'text-forest-700' : 'text-red-700'}`}>
                    {isCorrect ? <><CircleCheck className="icon" aria-hidden /> Correct</> : <><CircleX className="icon" aria-hidden /> Not correct</>}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}

// Big tap targets for multiple choice (stored as an array, like homework)
function ChoiceButtons({ question, value, disabled, onChange }) {
  const selected = Array.isArray(value) ? value : value ? [value] : []
  const multi = question.multi ?? (question.correct || []).length > 1
  function toggle(opt) {
    if (disabled) return
    if (multi) onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
    else onChange([opt])
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {question.options.map((opt, j) => {
        const on = selected.includes(opt)
        return (
          <button
            key={j}
            type="button"
            onClick={() => toggle(opt)}
            disabled={disabled}
            aria-pressed={on}
            className={`text-left text-base min-h-[48px] px-4 py-3 rounded-lg border-2 transition-colors ${
              on ? 'border-gray-800 bg-gray-50 text-gray-900 font-medium' : 'border-gray-200 bg-white text-gray-800'
            } ${disabled ? 'cursor-default' : 'hover:border-gray-400'} flex items-center gap-2`}
          >
            <span className="font-mono text-gray-400">{String.fromCharCode(97 + j)})</span>
            <span className="flex-1">{opt}</span>
            {on && <Check className="icon text-gray-800" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
