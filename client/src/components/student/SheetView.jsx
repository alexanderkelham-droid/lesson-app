import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import api from '../../lib/api'
import { isQuestionCorrect } from '../../lib/marking'
import SheetIntro, { ImageHint } from '../shared/SheetIntro'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, CircleCheck, CircleX, Hourglass, PenLine, Sparkles } from 'lucide-react'

// Score colour rule: >=70 forest, 40-69 amber, <40 red (rounded first)
function scoreTone(score) {
  const s = Math.round(score)
  return s >= 70 ? 'good' : s >= 40 ? 'mid' : 'low'
}

function CorrectnessIcon({ correct }) {
  return correct
    ? <CircleCheck className="w-6 h-6 flex-shrink-0 text-forest-600" aria-label="Correct" />
    : <CircleX className="w-6 h-6 flex-shrink-0 text-red-700" aria-label="Not quite" />
}

// ─── Question renderers ────────────────────────────────────────────────────

function MultipleChoice({ question, value, onChange, readOnly, showCorrect }) {
  const correctSet = showCorrect && Array.isArray(question.correct) ? question.correct : []
  const isMulti = question.multi ?? (question.correct || []).length > 1
  const selected = Array.isArray(value) ? value : (value ? [value] : [])

  function toggle(opt) {
    if (readOnly) return
    if (isMulti) {
      onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
    } else {
      onChange([opt])
    }
  }

  const groupName = `q-${question.id}`
  return (
    <div className="space-y-2" role={isMulti ? 'group' : 'radiogroup'} aria-label={question.prompt}>
      {(question.options || []).map((opt, j) => {
        const on = selected.includes(opt)
        const isAnswer = correctSet.includes(opt)
        const inputId = `${groupName}-${j}`
        return (
          <label key={opt} htmlFor={inputId} className={`flex items-center gap-3 min-h-[48px] px-4 py-3 rounded-lg border transition-colors ${
            readOnly ? 'cursor-default' : 'cursor-pointer'
          } ${
            isAnswer ? 'border-forest-600 bg-forest-50'
            : on ? 'border-gray-800 bg-gray-50 text-gray-900'
            : 'border-gray-200'
          } ${!readOnly && !on ? 'hover:bg-gray-50' : ''}`}>
            <input
              id={inputId}
              name={groupName}
              type={isMulti ? 'checkbox' : 'radio'}
              checked={on}
              onChange={() => toggle(opt)}
              disabled={readOnly}
              className="accent-gray-800 w-5 h-5 flex-shrink-0"
            />
            <span className={`text-base ${on ? 'text-gray-900 font-medium' : 'text-gray-800'}`}>{opt}</span>
            {isAnswer ? (
              <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-forest-700">
                <Check className="icon" aria-hidden /> Correct answer
              </span>
            ) : on && (
              <span className="ml-auto inline-flex items-center gap-1 text-sm text-gray-600">
                <Check className="icon" aria-hidden /> {showCorrect ? 'Your answer' : 'Selected'}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

function FillInBlank({ question, value, onChange, readOnly }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => !readOnly && onChange(e.target.value)}
      readOnly={readOnly}
      className={`input max-w-sm text-base py-2.5 ${readOnly ? 'bg-gray-50 focus:ring-0 focus:border-gray-300' : ''}`}
      placeholder="Your answer…"
    />
  )
}

function FreeText({ question, value, onChange, readOnly }) {
  return (
    <textarea
      value={value || ''}
      onChange={e => !readOnly && onChange(e.target.value)}
      readOnly={readOnly}
      className={`input resize-none h-32 text-base ${readOnly ? 'bg-gray-50 focus:ring-0 focus:border-gray-300' : ''}`}
      placeholder="Write your answer here…"
    />
  )
}

function Matching({ question, value, onChange, readOnly }) {
  const pairs = question.pairs || []
  const rights = pairs.map(p => p.right)
  const current = value || {}

  return (
    <div className="space-y-3">
      {pairs.map(pair => (
        <div key={pair.left} className="flex items-center gap-3">
          <span className="text-base font-medium text-gray-800 w-36 flex-shrink-0 bg-gray-100 px-3 py-2.5 rounded-lg">{pair.left}</span>
          <ArrowRight className="icon text-gray-400" aria-hidden />
          <select
            value={current[pair.left] || ''}
            onChange={e => !readOnly && onChange({ ...current, [pair.left]: e.target.value })}
            disabled={readOnly}
            className={`input flex-1 text-base py-2.5 ${readOnly ? 'bg-gray-50' : ''}`}
          >
            <option value="">Choose a match…</option>
            {rights.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

function Ordering({ question, value, onChange, readOnly }) {
  const options = question.options || []
  const current = Array.isArray(value) && value.length ? value : [...options]

  function move(idx, dir) {
    if (readOnly) return
    const arr = [...current]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    onChange(arr)
  }

  return (
    <div className="space-y-2">
      {current.map((item, idx) => (
        <div key={item} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg pl-3 pr-1.5 py-1.5 min-h-[52px]">
          <span className="w-7 h-7 bg-redwood-50 text-redwood-700 rounded-md text-sm font-semibold flex items-center justify-center flex-shrink-0">
            {idx + 1}
          </span>
          <span className="flex-1 text-base text-gray-800">{item}</span>
          {!readOnly && (
            <div className="flex gap-1">
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up" title="Move up" className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronUp className="icon-lg" aria-hidden />
              </button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === current.length - 1} aria-label="Move down" title="Move down" className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronDown className="icon-lg" aria-hidden />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ImageBased({ question, value, onChange, readOnly }) {
  return (
    <div className="space-y-3">
      {question.imageUrl && (
        <img src={question.imageUrl} alt="Question image" className="rounded-lg max-h-64 object-contain border border-gray-200" />
      )}
      <FreeText question={question} value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  )
}

// ─── Score display ────────────────────────────────────────────────────────

function ScoreDisplay({ score, followUp, onContinue, onReview, tally, hasWritten }) {
  const needsReview = score == null
  const tone = needsReview ? null : scoreTone(score)
  const good = tone === 'good'
  return (
    <div className="text-center py-8 space-y-4">
      <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-semibold mb-2 ${
        needsReview ? 'bg-amber-50 text-amber-800'
        : tone === 'good' ? 'bg-forest-50 text-forest-700'
        : tone === 'mid' ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700'
      }`}>
        {needsReview ? <Hourglass className="w-9 h-9" aria-label="Awaiting review" /> : `${Math.round(score)}%`}
      </div>
      {tally && tally.total > 0 && (
        <p className="text-base text-gray-700 font-medium">
          {tally.weighted
            ? `You scored ${tally.earned} out of ${tally.possible} marks`
            : `You got ${tally.correct} out of ${tally.total} right`}
        </p>
      )}
      <h3 className="font-serif text-2xl font-semibold text-gray-900">
        {needsReview ? 'All sent to your tutor' : good ? 'Well done!' : 'Good try. Keep practising!'}
      </h3>
      {needsReview && (
        <p className="text-gray-600 text-base max-w-sm mx-auto">
          Your tutor will check your answers and give you a score next session.
        </p>
      )}
      {!needsReview && hasWritten && (
        <p className="text-gray-600 text-base max-w-sm mx-auto">
          Your tutor will check your written answers.
        </p>
      )}
      {!needsReview && followUp && (
        <div className="card-muted text-left text-sm text-gray-700 max-w-sm mx-auto">
          <p className="font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
            <Sparkles className="icon text-redwood-700" aria-hidden />
            A practice sheet has been added
          </p>
          <p>"{followUp.sheet?.title}" has been added to your lesson plan to help you practise this topic.</p>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {onReview && (
          <button onClick={onReview} className="btn-secondary px-5 py-2.5 text-base">
            See my answers
          </button>
        )}
        <button onClick={onContinue} className="btn-primary px-5 py-2.5 text-base">
          Back to my lesson plan
        </button>
      </div>
    </div>
  )
}

// ─── Main SheetView ───────────────────────────────────────────────────────

export default function SheetView() {
  const { lessonPlanItemId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [item, setItem]       = useState(null)
  const [sheet, setSheet]     = useState(null)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [result, setResult]         = useState(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [previousScore, setPreviousScore] = useState(null)
  const [error, setError]     = useState('')
  const startTime = useRef(Date.now())
  const draftKey = `sheet-draft-${lessonPlanItemId}`

  // Keep a draft so a refresh or accidental back doesn't lose answers
  useEffect(() => {
    if (reviewMode || submitted || Object.keys(answers).length === 0) return
    try { localStorage.setItem(draftKey, JSON.stringify(answers)) } catch { /* storage unavailable */ }
  }, [answers, reviewMode, submitted, draftKey])

  useEffect(() => {
    async function load() {
      try {
        // Get the student's lesson plan to find this item
        const plansRes = await api.get('/lesson-plans')
        let foundItem = null, foundPlan = null
        for (const plan of plansRes.data) {
          const it = plan.items?.find(i => i.id === parseInt(lessonPlanItemId))
          if (it) { foundItem = it; foundPlan = plan; break }
        }
        if (!foundItem) throw new Error('Sheet not found in your lesson plan')
        if (foundItem.status === 'locked') throw new Error('This sheet is not available yet')
        if (!foundItem.sheetId) throw new Error('This task is done outside the app — your tutor will mark it complete')

        setItem({ ...foundItem, planId: foundPlan.id })

        const sheetRes = await api.get(`/sheets/${foundItem.sheetId}`)
        setSheet(sheetRes.data)

        // Restore unsent work after a refresh
        if (foundItem.status !== 'completed') {
          try {
            const draft = JSON.parse(localStorage.getItem(draftKey) || 'null')
            if (draft && typeof draft === 'object') setAnswers(draft)
          } catch { /* no draft */ }
        }

        // If already completed, load previous response
        if (foundItem.status === 'completed') {
          const respRes = await api.get(`/student-responses?lessonPlanItemId=${lessonPlanItemId}`)
          if (respRes.data.length > 0) {
            const prev = respRes.data[0] // most recent
            setAnswers(prev.responsesJson || {})
            setPreviousScore(prev.score)
            setReviewMode(true)
          }
        }
      } catch (e) {
        setError(e.message || 'Failed to load sheet')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lessonPlanItemId])

  function setAnswer(qId, val) {
    setAnswers(prev => ({ ...prev, [qId]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const timeSpent = Math.round((Date.now() - startTime.current) / 1000)

      // Ordering questions left in their starting order still count as answered
      const toSend = { ...answers }
      for (const q of sheet?.contentJson?.questions || []) {
        if (q.type === 'ordering' && !Array.isArray(toSend[q.id])) toSend[q.id] = [...(q.options || [])]
      }

      // 1. Save response
      const respRes = await api.post('/student-responses', {
        lessonPlanItemId: parseInt(lessonPlanItemId),
        responsesJson: toSend,
        timeSpentSeconds: timeSpent
      })

      // 2. Process completion (follow-up rules + unlock next)
      const completionRes = await api.post(`/lesson-plans/${item.planId}/process-completion`, {
        lessonPlanItemId: parseInt(lessonPlanItemId),
        studentResponseId: respRes.data.id
      })

      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setAnswers(toSend)

      // Now submitted, the answer key is available — reload it for the review
      let fullSheet = sheet
      try { fullSheet = (await api.get(`/sheets/${sheet.id}`)).data; setSheet(fullSheet) } catch { /* keep stripped copy */ }
      const qs = fullSheet?.contentJson?.questions || []
      const gradable = qs.filter(q => isQuestionCorrect(q, toSend[q.id]) !== null)
      const right = gradable.filter(q => isQuestionCorrect(q, toSend[q.id]))
      const pts = q => Number(q.points) > 0 ? Number(q.points) : 1
      setResult({
        score: respRes.data.score,
        followUp: completionRes.data.followUpItem,
        tally: {
          correct: right.length,
          total: gradable.length,
          // With weighted questions, count marks so the tally agrees with the %
          weighted: gradable.some(q => pts(q) > 1),
          earned: right.reduce((n, q) => n + pts(q), 0),
          possible: gradable.reduce((n, q) => n + pts(q), 0),
        },
        hasWritten: qs.some(q => q.type === 'free_text' || q.type === 'image_based')
      })
      setSubmitted(true)
    } catch (e) {
      setError(e.response?.data?.error || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const questions = sheet?.contentJson?.questions || []
  const isAnswered = (q) => {
    if (q.type === 'ordering') return true // the starting order is a valid answer
    const v = answers[q.id]
    return v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  }
  const answered = questions.filter(isAnswered).length
  const allAnswered = answered >= questions.length
  const missing = questions.map((q, i) => isAnswered(q) ? null : i + 1).filter(Boolean)

  if (loading) return <><Navbar /><LoadingSpinner /></>

  if (error) return (
    <>
      <Navbar title="Sheet" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center">
          <p className="text-base text-gray-800 mb-4">{error}</p>
          <button onClick={() => navigate('/student')} className="btn-secondary">
            <ArrowLeft className="icon" aria-hidden /> Back to my lesson plan
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <Navbar title={sheet?.title} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Sheet header */}
        <div className="card mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="page-title">{sheet.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-gray-500">{sheet.subject}</span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{sheet.topic}</span>
                <span className="text-gray-300">·</span>
                <span className="badge capitalize">{sheet.sheetType}</span>
              </div>
            </div>
            <button onClick={() => navigate('/student')} className="btn-secondary flex-shrink-0">
              <ArrowLeft className="icon" aria-hidden /> Back
            </button>
          </div>
        </div>

        {submitted ? (
          <div className="card">
            <ScoreDisplay
              score={result.score}
              followUp={result.followUp}
              tally={result.tally}
              hasWritten={result.hasWritten}
              onContinue={() => navigate('/student')}
              onReview={() => { setPreviousScore(result.score); setReviewMode(true); setSubmitted(false); window.scrollTo(0, 0) }}
            />
          </div>
        ) : (
          <>
            {/* Review mode header */}
            {reviewMode && (previousScore == null ? (
              <div className="card mb-4 bg-amber-50 border-amber-200 flex items-center gap-3">
                <Hourglass className="icon-lg text-amber-800" aria-hidden />
                <p className="text-base font-medium text-amber-800">Sent. Your tutor will check your answers.</p>
              </div>
            ) : (
              <div className={`card mb-4 ${{ good: 'bg-forest-50 border-forest-100', mid: 'bg-amber-50 border-amber-100', low: 'bg-red-50 border-red-100' }[scoreTone(previousScore)]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-gray-700">Your score</span>
                  <span className={`text-2xl font-semibold ${{ good: 'text-forest-700', mid: 'text-amber-700', low: 'text-red-700' }[scoreTone(previousScore)]}`}>{Math.round(previousScore)}%</span>
                </div>
              </div>
            ))}

            <SheetIntro content={sheet.contentJson} />

            {/* Reading passage (for reading comprehension sheets) */}
            {sheet.contentJson?.passage && (
              <div className="card mb-4 bg-cream border-l-4 border-l-redwood-600">
                <p className="eyebrow text-redwood-700 mb-2 flex items-center gap-1.5">
                  <BookOpen className="icon-sm" aria-hidden /> Read the story
                </p>
                <div className="text-lg text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">
                  {sheet.contentJson.passage}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {questions.map((q, idx) => {
                const correct = reviewMode ? isQuestionCorrect(q, answers[q.id]) : null

                return (
                  <div key={q.id} className={`card ${reviewMode && correct !== null ? (correct ? 'border-forest-200' : 'border-red-200') : ''}`}>
                    <div className="flex items-start gap-3 mb-4">
                      <span className="flex-shrink-0 w-8 h-8 bg-redwood-50 text-redwood-700 rounded-full text-sm font-semibold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-base text-gray-900 font-medium leading-snug pt-1">{q.prompt}</p>
                        <ImageHint question={q} />
                        <span className="text-xs text-gray-500 mt-1 block">{q.points} point{q.points !== 1 ? 's' : ''}</span>
                      </div>
                      {reviewMode && correct !== null && <CorrectnessIcon correct={correct} />}
                    </div>

                    <div className="sm:ml-11">
                      {q.type === 'multiple_choice' && (
                        <MultipleChoice question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} showCorrect={reviewMode && correct === false} />
                      )}
                      {q.type === 'fill_in_blank' && (
                        <FillInBlank question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
                      )}
                      {q.type === 'free_text' && (
                        <FreeText question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
                      )}
                      {q.type === 'matching' && (
                        <Matching question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
                      )}
                      {q.type === 'ordering' && (
                        <Ordering question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
                      )}
                      {q.type === 'image_based' && (
                        <ImageBased question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
                      )}

                      {/* Show correct answer for incorrect fill_in_blank */}
                      {reviewMode && correct === null && (q.type === 'free_text' || q.type === 'image_based') && (
                        <p className="text-sm text-amber-800 mt-2 flex items-center gap-1.5">
                          <PenLine className="icon" aria-hidden /> Your tutor will check this answer.
                        </p>
                      )}
                      {reviewMode && correct === false && q.type === 'fill_in_blank' && (
                        <p className="text-sm text-forest-700 mt-2">Correct answer: {(Array.isArray(q.correct) ? q.correct : [q.correct]).join(' or ')}</p>
                      )}
                    </div>
                  </div>
                )
              })}

              {reviewMode ? (
                <button
                  type="button"
                  onClick={() => navigate('/student')}
                  className="btn-secondary w-full py-3 text-base"
                >
                  Back to my lesson plan
                </button>
              ) : (
                <>
                  <div className="card p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-800">{answered} of {questions.length} answered</span>
                      {!allAnswered && (
                        <span className="text-amber-800 text-right">
                          Answer every question to send. Still to do: question{missing.length > 1 ? 's' : ''} {missing.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-forest-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${questions.length ? Math.round((answered / questions.length) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !allAnswered}
                    className="btn-primary w-full py-3 text-base"
                  >
                    {submitting ? 'Sending…' : 'Send my answers'}
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </main>
    </>
  )
}
