import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import api from '../../lib/api'

// ─── Correctness checker (mirrors backend calculateScore per question) ─────

function isQuestionCorrect(question, answer) {
  if (answer === undefined || answer === null) return false
  switch (question.type) {
    case 'multiple_choice': {
      const correct = Array.isArray(question.correct) ? question.correct : [question.correct]
      const given = Array.isArray(answer) ? answer : [answer]
      return correct.length === given.length && correct.every(c => given.includes(c))
    }
    case 'fill_in_blank': {
      const correct = Array.isArray(question.correct) ? question.correct : [question.correct]
      const normalise = s => String(s).trim().toLowerCase()
      return correct.some(c => normalise(c) === normalise(answer))
    }
    case 'matching': {
      const pairs = question.pairs || []
      return pairs.every(p => answer[p.left] === p.right)
    }
    case 'ordering': {
      const correct = question.correct_order || []
      return Array.isArray(answer) && answer.length === correct.length && answer.every((v, i) => v === correct[i])
    }
    case 'free_text':
    case 'image_based':
      return answer && String(answer).trim().length > 0
    default:
      return false
  }
}

function CorrectnessIcon({ correct }) {
  return correct
    ? <span className="text-green-600 font-bold text-lg flex-shrink-0">✓</span>
    : <span className="text-red-500 font-bold text-lg flex-shrink-0">✗</span>
}

// ─── Question renderers ────────────────────────────────────────────────────

function MultipleChoice({ question, value, onChange, readOnly }) {
  const isMulti = (question.correct || []).length > 1
  const selected = Array.isArray(value) ? value : (value ? [value] : [])

  function toggle(opt) {
    if (readOnly) return
    if (isMulti) {
      onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
    } else {
      onChange([opt])
    }
  }

  return (
    <div className="space-y-2">
      {(question.options || []).map(opt => (
        <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          readOnly ? 'cursor-default' : 'cursor-pointer'
        } ${
          selected.includes(opt) ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
        } ${!readOnly && !selected.includes(opt) ? 'hover:bg-gray-50' : ''}`}>
          <input
            type={isMulti ? 'checkbox' : 'radio'}
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            disabled={readOnly}
            className="accent-brand-600"
          />
          <span className="text-sm text-gray-800">{opt}</span>
        </label>
      ))}
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
      className={`input max-w-xs ${readOnly ? 'bg-gray-50' : ''}`}
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
      className={`input resize-none h-28 ${readOnly ? 'bg-gray-50' : ''}`}
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
          <span className="text-sm font-medium text-gray-700 w-32 flex-shrink-0 bg-gray-100 px-3 py-2 rounded-lg">{pair.left}</span>
          <span className="text-gray-400">→</span>
          <select
            value={current[pair.left] || ''}
            onChange={e => !readOnly && onChange({ ...current, [pair.left]: e.target.value })}
            disabled={readOnly}
            className={`input flex-1 ${readOnly ? 'bg-gray-50' : ''}`}
          >
            <option value="">Select match…</option>
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
        <div key={item} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="w-6 h-6 bg-brand-100 text-brand-700 rounded text-xs font-bold flex items-center justify-center flex-shrink-0">
            {idx + 1}
          </span>
          <span className="flex-1 text-sm text-gray-800">{item}</span>
          {!readOnly && (
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none">▲</button>
              <button onClick={() => move(idx, 1)} disabled={idx === current.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none">▼</button>
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
        <img src={question.imageUrl} alt="Question image" className="rounded-lg max-h-64 object-contain border" />
      )}
      <FreeText question={question} value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  )
}

// ─── Score display ────────────────────────────────────────────────────────

function ScoreDisplay({ score, followUp, onContinue }) {
  const needsReview = score == null
  const good = !needsReview && score >= 70
  return (
    <div className="text-center py-8 space-y-4">
      <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-bold mb-2 ${
        needsReview ? 'bg-gray-100 text-gray-600'
        : good ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-600'
      }`}>
        {needsReview ? '✎' : `${score}%`}
      </div>
      <h3 className="text-xl font-bold text-gray-900">
        {needsReview ? 'Submitted — awaiting tutor review' : good ? '🎉 Great work!' : '📚 Keep practising!'}
      </h3>
      {needsReview && (
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Your tutor will grade your answers and give you a score next session.
        </p>
      )}
      {!needsReview && (followUp ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 max-w-sm mx-auto">
          <p className="font-semibold mb-1">A follow-up sheet has been added</p>
          <p>"{followUp.sheet?.title}" has been added to your lesson plan to help you strengthen this topic.</p>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Your next sheet is now unlocked.</p>
      ))}
      <button onClick={onContinue} className="btn-primary mt-4">
        Back to Lesson Plan
      </button>
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

        setItem({ ...foundItem, planId: foundPlan.id })

        const sheetRes = await api.get(`/sheets/${foundItem.sheetId}`)
        setSheet(sheetRes.data)

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

      // 1. Save response
      const respRes = await api.post('/student-responses', {
        sheetId: sheet.id,
        lessonPlanItemId: parseInt(lessonPlanItemId),
        responsesJson: answers,
        timeSpentSeconds: timeSpent
      })

      // 2. Process completion (follow-up rules + unlock next)
      const completionRes = await api.post(`/lesson-plans/${item.planId}/process-completion`, {
        lessonPlanItemId: parseInt(lessonPlanItemId),
        studentResponseId: respRes.data.id
      })

      setResult({
        score: respRes.data.score,
        followUp: completionRes.data.followUpItem
      })
      setSubmitted(true)
    } catch (e) {
      setError(e.response?.data?.error || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const questions = sheet?.contentJson?.questions || []
  const answered  = Object.values(answers).filter(v => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)).length
  const allAnswered = answered >= questions.length

  if (loading) return <><Navbar /><LoadingSpinner /></>

  if (error) return (
    <>
      <Navbar title="Sheet" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => navigate('/student')} className="btn-secondary">Back to Dashboard</button>
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
              <h1 className="text-xl font-bold text-gray-900">{sheet.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-gray-500">{sheet.subject}</span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{sheet.topic}</span>
                <span className="text-gray-300">·</span>
                <span className="badge bg-gray-100 text-gray-600 capitalize">{sheet.sheetType}</span>
              </div>
            </div>
            <button onClick={() => navigate('/student')} className="btn-secondary text-xs py-1 px-3 flex-shrink-0">
              ← Back
            </button>
          </div>
        </div>

        {submitted ? (
          <div className="card">
            <ScoreDisplay
              score={result.score}
              followUp={result.followUp}
              onContinue={() => navigate('/student')}
            />
          </div>
        ) : (
          <>
            {/* Review mode header */}
            {reviewMode && (
              <div className={`card mb-4 ${previousScore >= 70 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Your previous score:</span>
                  <span className={`text-xl font-bold ${previousScore >= 70 ? 'text-green-600' : 'text-red-500'}`}>{previousScore}%</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {questions.map((q, idx) => {
                const correct = reviewMode ? isQuestionCorrect(q, answers[q.id]) : null

                return (
                  <div key={q.id} className={`card ${reviewMode ? (correct ? 'border-green-200' : 'border-red-200') : ''}`}>
                    <div className="flex items-start gap-3 mb-4">
                      <span className="flex-shrink-0 w-7 h-7 bg-brand-100 text-brand-700 rounded-full text-sm font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-gray-800 font-medium leading-snug">{q.prompt}</p>
                        <span className="text-xs text-gray-400 mt-0.5 block">{q.points} point{q.points !== 1 ? 's' : ''}</span>
                      </div>
                      {reviewMode && <CorrectnessIcon correct={correct} />}
                    </div>

                    <div className="ml-10">
                      {q.type === 'multiple_choice' && (
                        <MultipleChoice question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} readOnly={reviewMode} />
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
                      {reviewMode && !correct && q.type === 'fill_in_blank' && (
                        <p className="text-xs text-green-600 mt-2">Correct answer: {(Array.isArray(q.correct) ? q.correct : [q.correct]).join(' or ')}</p>
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
                  Back to Lesson Plan
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                    <span>{answered} / {questions.length} answered</span>
                    {!allAnswered && <span className="text-yellow-600 text-xs">Please answer all questions before submitting</span>}
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !allAnswered}
                    className="btn-primary w-full py-3 text-base"
                  >
                    {submitting ? 'Submitting…' : 'Submit Answers'}
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
