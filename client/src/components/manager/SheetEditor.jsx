import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, CheckCircle2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import api from '../../lib/api'

const QUESTION_TYPES = [
  { value: 'fill_in_blank',   label: 'Fill in the blank' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'free_text',       label: 'Free text / written' },
  { value: 'matching',        label: 'Matching pairs' },
  { value: 'ordering',        label: 'Put in order' },
]

export default function SheetEditor() {
  const { sheetId } = useParams()
  const navigate = useNavigate()

  const [sheet, setSheet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [passage, setPassage] = useState('')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [difficultyLevel, setDifficultyLevel] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewedNotice, setReviewedNotice] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [improving, setImproving] = useState(false)
  const [improvement, setImprovement] = useState(null) // suggested rewrite
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    api.get(`/sheets/${sheetId}`)
      .then(res => {
        setSheet(res.data)
        setTitle(res.data.title || '')
        setSubject(res.data.subject || '')
        setTopic(res.data.topic || '')
        setDifficultyLevel(res.data.difficultyLevel ? String(res.data.difficultyLevel) : '')
        setQuestions(res.data.contentJson?.questions || [])
        setPassage(res.data.contentJson?.passage || '')
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load sheet'))
      .finally(() => setLoading(false))
  }, [sheetId])

  function updateQuestion(idx, fields) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...fields } : q))
  }

  function removeQuestion(idx) {
    setQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  function moveQuestion(idx, dir) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= questions.length) return
    setQuestions(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return arr
    })
  }

  function addQuestion() {
    setQuestions(prev => [...prev, {
      id: `q${prev.length + 1}`,
      type: 'fill_in_blank',
      prompt: '',
      correct: [],
      points: 1
    }])
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      // Re-number IDs so they're always q1..qN
      const renumbered = questions.map((q, i) => ({ ...q, id: q.id || `q${i + 1}` }))
      await api.put(`/sheets/${sheetId}`, {
        title, subject, topic,
        ...(difficultyLevel && { difficultyLevel: Number(difficultyLevel) }),
        contentJson: {
          ...(passage && passage.trim() && { passage }),
          questions: renumbered
        }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // The digital version has been checked against the original PDF
  async function markReviewed() {
    setReviewing(true)
    setError('')
    try {
      await api.put(`/sheets/${sheetId}`, { reviewed: true })
      setSheet(s => ({ ...s, needsReview: false }))
      setReviewedNotice(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not mark as reviewed')
    } finally {
      setReviewing(false)
    }
  }

  async function improveWithAI() {
    setImproving(true)
    setError('')
    try {
      const res = await api.post(`/sheets/${sheetId}/ai-improve`, {
        // Send the current state (in case unsaved edits) so AI improves what's on screen
        contentJson: { ...(passage && passage.trim() && { passage }), questions }
      })
      setImprovement(res.data.improved)
      setShowDiff(true)
    } catch (err) {
      setError(err.response?.data?.error || 'AI improvement failed. Make sure ANTHROPIC_API_KEY is set on the server.')
    } finally {
      setImproving(false)
    }
  }

  function acceptImprovement() {
    if (!improvement?.questions) return
    setQuestions(improvement.questions)
    setImprovement(null)
    setShowDiff(false)
  }

  function rejectImprovement() {
    setImprovement(null)
    setShowDiff(false)
  }

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (error && !sheet) return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="card text-center">
          <p className="text-red-700 font-medium mb-3">{error}</p>
          <button onClick={() => navigate('/manager/sheets')} className="btn-secondary">Back to sheets</button>
        </div>
      </main>
    </>
  )

  return (
    <>
      <Navbar title="Edit sheet" />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/manager/sheets')} className="btn-ghost btn-sm -ml-2.5 mb-3">
          <ArrowLeft className="icon-sm" aria-hidden /> Back to sheets
        </button>

        <div className="mb-6">
          <h1 className="page-title">Edit sheet</h1>
          <p className="text-sm text-gray-500 mt-1">{title || 'Untitled sheet'}</p>
        </div>

        {/* Review status */}
        {sheet?.needsReview && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="icon text-amber-800 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800">Needs review</p>
                <p className="text-xs text-amber-800 mt-0.5">This digital version was made automatically and may have mistakes. Check it against the original PDF, fix anything wrong and save, then mark it as reviewed.</p>
              </div>
            </div>
            <button onClick={markReviewed} disabled={reviewing} className="btn-secondary btn-sm">
              <CheckCircle2 className="icon-sm" aria-hidden /> {reviewing ? 'Saving…' : 'Mark as reviewed'}
            </button>
          </div>
        )}
        {reviewedNotice && !sheet?.needsReview && (
          <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
            <Check className="icon" aria-hidden /> Marked as reviewed. It no longer shows the Review badge.
          </p>
        )}

        {/* Sheet metadata */}
        <div className="card mb-4">
          <h2 className="section-title mb-4">Sheet details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label" htmlFor="sheet-title">Title</label>
              <input id="sheet-title" value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="sheet-subject">Subject</label>
              <input id="sheet-subject" value={subject} onChange={e => setSubject(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="sheet-topic">Topic</label>
              <input id="sheet-topic" value={topic} onChange={e => setTopic(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="sheet-level">Level</label>
              <select id="sheet-level" value={difficultyLevel} onChange={e => setDifficultyLevel(e.target.value)} className="input">
                {!difficultyLevel && <option value="">Select…</option>}
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Level {n}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Reading passage (optional) */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <BookOpen className="icon-lg text-gray-400" aria-hidden /> Reading passage
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Optional — shown to the student before the questions.</p>
            </div>
            {passage && (
              <button
                type="button"
                onClick={() => setPassage('')}
                className="btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-700"
              >
                <X className="icon-sm" aria-hidden /> Clear
              </button>
            )}
          </div>
          <textarea
            value={passage}
            onChange={e => setPassage(e.target.value)}
            rows={passage ? Math.min(20, Math.max(6, passage.split('\n').length + 2)) : 6}
            className="input text-sm leading-relaxed font-serif resize-y"
            placeholder="Leave blank for a regular question sheet. For reading-comprehension sheets, paste the story / passage here — students will see it above the questions."
          />
          {passage && (
            <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
              {passage.trim().split(/\s+/).filter(Boolean).length} words · {passage.length} characters
            </p>
          )}
        </div>

        {/* AI improve banner */}
        <div className="card-muted mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white border border-gray-200 text-redwood-700 flex items-center justify-center flex-shrink-0">
                <Sparkles className="icon" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="section-title text-base">Improve with AI</h2>
                <p className="text-xs text-gray-600 mt-0.5">Claude will clean up garbled prompts, pick correct question types, and add answers where determinable.</p>
              </div>
            </div>
            <button
              onClick={improveWithAI}
              disabled={improving || questions.length === 0}
              className="btn-primary"
            >
              <Sparkles className="icon" aria-hidden />
              {improving ? 'Asking Claude…' : 'Improve with AI'}
            </button>
          </div>
        </div>

        {/* AI improvement preview */}
        {showDiff && improvement && (
          <div className="card mb-4 border-redwood-200 ring-1 ring-redwood-100">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <p className="eyebrow text-redwood-700">Review changes</p>
                <h2 className="section-title">AI suggestion</h2>
                <p className="text-xs text-gray-600">
                  {improvement.questions?.length || 0} questions ·{' '}
                  Compare below and Accept or Reject.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={rejectImprovement} className="btn-secondary"><X className="icon" aria-hidden /> Reject</button>
                <button onClick={acceptImprovement} className="btn-primary"><Check className="icon" aria-hidden /> Accept all</button>
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(improvement.questions || []).map((q, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-gray-500 flex-shrink-0 tabular-nums">Q{i + 1}</span>
                    <div className="flex-1 text-sm">
                      <span className="badge mr-1.5">{q.type}</span>
                      <span className="text-gray-800">{q.prompt}</span>
                      {q.correct?.length > 0 && (
                        <p className="text-xs text-forest-700 mt-1">
                          <span className="font-medium">Answer:</span> {q.correct.join(' / ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions */}
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <QuestionEditor
              key={idx}
              q={q}
              idx={idx}
              total={questions.length}
              onUpdate={fields => updateQuestion(idx, fields)}
              onRemove={() => removeQuestion(idx)}
              onMove={dir => moveQuestion(idx, dir)}
            />
          ))}

          {questions.length === 0 && (
            <div className="card text-center py-10">
              <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                <Plus className="icon-lg" aria-hidden />
              </div>
              <p className="font-medium text-gray-900">No questions yet</p>
              <p className="text-sm text-gray-500 mt-1">Use the button below to add the first one.</p>
            </div>
          )}

          <button onClick={addQuestion} className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-redwood-700 hover:bg-white hover:border-redwood-300 border border-dashed border-gray-300 rounded-xl py-3 transition-colors">
            <Plus className="icon" aria-hidden /> Add question
          </button>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 mt-6 modal-panel rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500 flex items-center flex-wrap gap-x-3 gap-y-1">
            {questions.length} question{questions.length === 1 ? '' : 's'}
            {saved && <span className="badge-success"><Check className="icon-sm" aria-hidden /> Saved</span>}
            {error && <span className="text-red-700">{error}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/manager/sheets')} className="btn-secondary">Done</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </>
  )
}

function QuestionEditor({ q, idx, total, onUpdate, onRemove, onMove }) {
  const isMC = q.type === 'multiple_choice'
  const isOrdering = q.type === 'ordering'
  const isMatching = q.type === 'matching'

  function updateOptions(text) {
    const opts = text.split('\n').map(s => s.trim()).filter(Boolean)
    onUpdate({ options: opts })
  }
  function updateCorrect(text) {
    const arr = text.split('\n').map(s => s.trim()).filter(Boolean)
    onUpdate({ correct: arr })
  }
  function updateCorrectOrder(text) {
    const arr = text.split('\n').map(s => s.trim()).filter(Boolean)
    onUpdate({ correct_order: arr })
  }
  function updatePairs(text) {
    const pairs = text.split('\n')
      .map(line => {
        const parts = line.split(/\s*[\u2192=>|]\s*/) // accepts "=", ">", "|" or an arrow character
        return parts.length === 2 ? { left: parts[0].trim(), right: parts[1].trim() } : null
      })
      .filter(Boolean)
    onUpdate({ pairs })
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-redwood-50 text-redwood-700 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 tabular-nums">
            {idx + 1}
          </span>
          <select
            value={q.type}
            onChange={e => onUpdate({ type: e.target.value })}
            className="input text-xs py-1.5 px-2 w-auto"
            aria-label="Question type"
          >
            {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-md"
            title="Move up"
            aria-label="Move up"
          >
            <ArrowUp className="icon" aria-hidden />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-md"
            title="Move down"
            aria-label="Move down"
          >
            <ArrowDown className="icon" aria-hidden />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-md"
            title="Remove"
            aria-label="Remove question"
          >
            <Trash2 className="icon" aria-hidden />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label text-xs">Prompt</label>
          <textarea
            value={q.prompt || ''}
            onChange={e => onUpdate({ prompt: e.target.value })}
            rows={2}
            className="input text-sm mt-0.5 resize-none"
            placeholder="What's the question?"
          />
        </div>

        {(isMC || isOrdering) && (
          <div>
            <label className="label text-xs">
              {isOrdering ? 'Items (in any order, one per line)' : 'Options (one per line)'}
            </label>
            <textarea
              value={(q.options || []).join('\n')}
              onChange={e => updateOptions(e.target.value)}
              rows={4}
              className="input text-xs mt-0.5 resize-none font-mono"
              placeholder="Option A&#10;Option B&#10;Option C"
            />
          </div>
        )}

        {isMatching && (
          <div>
            <label className="label text-xs">
              Pairs (left = right, one per line)
            </label>
            <textarea
              value={(q.pairs || []).map(p => `${p.left} = ${p.right}`).join('\n')}
              onChange={e => updatePairs(e.target.value)}
              rows={4}
              className="input text-xs mt-0.5 resize-none font-mono"
              placeholder="Dog = Bark&#10;Cat = Meow"
            />
          </div>
        )}

        {isOrdering ? (
          <div>
            <label className="label text-xs">Correct order (one per line)</label>
            <textarea
              value={(q.correct_order || []).join('\n')}
              onChange={e => updateCorrectOrder(e.target.value)}
              rows={3}
              className="input text-xs mt-0.5 resize-none font-mono"
              placeholder="First&#10;Second&#10;Third"
            />
          </div>
        ) : !isMatching && (
          <div>
            <label className="label text-xs">
              {q.type === 'free_text'
                ? 'Acceptable answers (optional — one per line, leave blank to skip auto-grading)'
                : 'Correct answers (one per line — multiple lines if there are multiple acceptable answers)'}
            </label>
            <textarea
              value={(q.correct || []).join('\n')}
              onChange={e => updateCorrect(e.target.value)}
              rows={2}
              className="input text-xs mt-0.5 resize-none font-mono"
              placeholder={q.type === 'fill_in_blank' ? '11\n11.0' : 'The expected answer'}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Points</label>
            <input
              type="number"
              min="0" max="10" step="1"
              value={q.points || 1}
              onChange={e => onUpdate({ points: parseInt(e.target.value) || 1 })}
              className="input text-xs mt-0.5"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
