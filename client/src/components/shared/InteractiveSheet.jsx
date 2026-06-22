import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'

/**
 * Interactive in-session sheet. Used in the live session view.
 *
 * Both the tutor and student render this when a sheet is active. State is
 * synced via the session's live state, polled every 2 seconds.
 *
 * - Teacher: navigates between sheets (from sidebar), marks each question
 *   ✓ correct / ✗ wrong, sees student's answers as they're typed.
 * - Student: types answers into the inputs, sees the teacher's marks
 *   appear next to each question.
 */
export default function InteractiveSheet({
  sessionId,
  sheetId,
  isTeacher,
  onCloseSheet,
}) {
  const [sheet, setSheet]       = useState(null)
  const [loading, setLoading]   = useState(true)
  // Locally-edited answers (student only — teacher's view is read-only on answers)
  const [localAnswers, setLocalAnswers] = useState({})
  // Remote state (from polling)
  const [remoteAnswers, setRemoteAnswers] = useState({})
  const [remoteMarks, setRemoteMarks]     = useState({})
  // Throttle debounce timer
  const saveTimer = useRef(null)
  const isMounted = useRef(true)

  // Load the sheet contents
  useEffect(() => {
    if (!sheetId) return
    setLoading(true)
    api.get(`/sheets/${sheetId}`)
      .then(res => setSheet(res.data))
      .finally(() => setLoading(false))
  }, [sheetId])

  // Poll session live-state every 2s for marks + (teacher-side) answers
  useEffect(() => {
    if (!sessionId) return
    isMounted.current = true

    async function poll() {
      try {
        const res = await api.get(`/sessions/${sessionId}/live-state`)
        if (!isMounted.current) return
        const incomingAnswers = res.data.liveAnswers || {}
        const incomingMarks   = res.data.liveMarks   || {}
        setRemoteAnswers(incomingAnswers)
        setRemoteMarks(incomingMarks)
        // For the student, only sync remote answers if we haven't been typing recently
        if (!isTeacher && !saveTimer.current) {
          setLocalAnswers(prev => ({ ...incomingAnswers, ...prev }))
        }
      } catch { /* swallow — keep polling */ }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [sessionId, isTeacher])

  // When sheet changes, reset local answers from remote
  useEffect(() => {
    setLocalAnswers(remoteAnswers || {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId])

  // Debounced save of student's answers
  const persistAnswers = useCallback((answers) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(`/sessions/${sessionId}/live-state`, { answers })
      } catch { /* ignore */ }
      finally {
        saveTimer.current = null
      }
    }, 600)
  }, [sessionId])

  function handleAnswerChange(qId, value) {
    const next = { ...localAnswers, [qId]: value }
    setLocalAnswers(next)
    if (!isTeacher) persistAnswers({ [qId]: value })
  }

  async function setMark(qId, mark) {
    const nextMarks = { ...remoteMarks }
    if (mark === null || nextMarks[qId] === mark) delete nextMarks[qId]
    else nextMarks[qId] = mark
    setRemoteMarks(nextMarks)
    try {
      await api.patch(`/sessions/${sessionId}/live-state`, { marks: nextMarks })
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    )
  }
  if (!sheet) return null

  const questions = sheet.contentJson?.questions || []

  // Per-question state derived
  const answersToShow = isTeacher ? remoteAnswers : localAnswers
  const correctCount = Object.values(remoteMarks).filter(m => m === 'correct').length
  const wrongCount   = Object.values(remoteMarks).filter(m => m === 'wrong').length
  const markedCount  = correctCount + wrongCount

  return (
    <div className="h-full flex flex-col bg-cream">
      {/* Sheet header */}
      <div className="px-5 py-3 border-b border-redwood-100 bg-white flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-serif font-bold text-gray-900 truncate">{sheet.title}</h2>
            <p className="text-xs text-forest-700">
              {sheet.subject} · {sheet.topic}
              {markedCount > 0 && (
                <span className="ml-2">
                  · <span className="text-green-600 font-medium">{correctCount} correct</span>
                  {wrongCount > 0 && <span className="text-red-500 font-medium">, {wrongCount} wrong</span>}
                </span>
              )}
            </p>
          </div>
          {onCloseSheet && isTeacher && (
            <button
              onClick={onCloseSheet}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
              title="Close sheet for both"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Reading passage (if this is a reading-comprehension sheet) */}
        {sheet.contentJson?.passage && (
          <div className="rounded-xl border border-redwood-200 bg-cream p-4 mb-2">
            <p className="text-xs uppercase tracking-wider font-semibold text-redwood-700 mb-2">📖 Read the story</p>
            <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">
              {sheet.contentJson.passage}
            </div>
          </div>
        )}

        {questions.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">This sheet has no questions to display.</p>
        )}

        {questions.map((q, i) => {
          const answer = answersToShow[q.id] || ''
          const mark   = remoteMarks[q.id]
          const isCorrect = mark === 'correct'
          const isWrong   = mark === 'wrong'

          return (
            <div
              key={q.id || i}
              className={`rounded-xl border bg-white p-4 transition-colors ${
                isCorrect ? 'border-green-300 bg-green-50/60'
                : isWrong  ? 'border-red-300 bg-red-50/60'
                : 'border-gray-200'
              }`}
            >
              {/* Question prompt (instruction, clearly separated) */}
              <div className="flex items-start gap-3 mb-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                  isCorrect ? 'bg-green-500 text-white'
                  : isWrong  ? 'bg-red-500 text-white'
                  : 'bg-brand-100 text-brand-700'
                }`}>
                  {isCorrect ? '✓' : isWrong ? '✗' : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-forest-600 font-semibold mb-1">Question {i + 1}</p>
                  <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
                  {q.options?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {q.options.map((opt, j) => (
                        <li key={j} className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="font-mono text-gray-400">{String.fromCharCode(97 + j)})</span>
                          {opt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Answer area (clearly visually separated) */}
              <div className="ml-10 pl-3 border-l-2 border-gray-100">
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Answer</p>
                {q.type === 'free_text' || q.type === 'image_based' ? (
                  <textarea
                    value={answer}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    readOnly={isTeacher}
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-redwood-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder={isTeacher ? 'Student hasn\'t answered yet' : 'Type your answer here...'}
                  />
                ) : (
                  <input
                    type="text"
                    value={answer}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    readOnly={isTeacher}
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-redwood-500 focus:border-transparent"
                    placeholder={isTeacher ? 'Student hasn\'t answered yet' : 'Your answer'}
                  />
                )}

                {/* Show correct answer to teacher */}
                {isTeacher && q.correct?.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-medium">Expected:</span> {q.correct.join(' / ')}
                  </p>
                )}

                {/* Teacher's mark controls */}
                {isTeacher && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setMark(q.id, 'correct')}
                      className={`text-xs px-2 py-1 rounded border ${
                        isCorrect ? 'bg-green-500 text-white border-green-500' : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                      }`}
                    >
                      ✓ Correct
                    </button>
                    <button
                      onClick={() => setMark(q.id, 'wrong')}
                      className={`text-xs px-2 py-1 rounded border ${
                        isWrong ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                      }`}
                    >
                      ✗ Wrong
                    </button>
                    {(isCorrect || isWrong) && (
                      <button
                        onClick={() => setMark(q.id, null)}
                        className="text-xs px-2 py-1 rounded border bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Student sees mark badge */}
                {!isTeacher && (isCorrect || isWrong) && (
                  <p className={`text-xs font-semibold mt-1 ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                    {isCorrect ? '✓ Marked correct' : '✗ Marked wrong'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
