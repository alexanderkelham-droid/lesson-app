import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
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
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
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
        setQuestions(res.data.contentJson?.questions || [])
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
        contentJson: { questions: renumbered }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function improveWithAI() {
    setImproving(true)
    setError('')
    try {
      const res = await api.post(`/sheets/${sheetId}/ai-improve`, {
        // Send the current state (in case unsaved edits) so AI improves what's on screen
        contentJson: { questions }
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
          <p className="text-red-600 font-medium mb-3">{error}</p>
          <button onClick={() => navigate('/manager/sheets')} className="btn-secondary">Back to sheets</button>
        </div>
      </main>
    </>
  )

  return (
    <>
      <Navbar title={`Edit Sheet`} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/manager/sheets')} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">
          ← Back to sheets
        </button>

        {/* Sheet metadata */}
        <div className="card mb-4">
          <h1 className="font-serif text-lg font-bold text-gray-900 mb-3">Sheet details</h1>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Topic</label>
              <input value={topic} onChange={e => setTopic(e.target.value)} className="input" />
            </div>
          </div>
        </div>

        {/* AI improve banner */}
        <div className="card mb-4 border-l-4 border-l-redwood-500 bg-gradient-to-r from-redwood-50 to-cream">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-serif font-bold text-gray-900 text-base mb-0.5">✨ Improve with AI</h2>
              <p className="text-xs text-forest-700">Claude will clean up garbled prompts, pick correct question types, and add answers where determinable.</p>
            </div>
            <button
              onClick={improveWithAI}
              disabled={improving || questions.length === 0}
              className="bg-redwood-600 hover:bg-redwood-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {improving ? 'Asking Claude...' : 'Improve with AI'}
            </button>
          </div>
        </div>

        {/* AI improvement preview */}
        {showDiff && improvement && (
          <div className="card mb-4 bg-purple-50 border-2 border-purple-300">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div>
                <h2 className="font-serif font-bold text-gray-900 text-base">AI suggestion</h2>
                <p className="text-xs text-gray-600">
                  {improvement.questions?.length || 0} questions ·{' '}
                  Compare below and Accept or Reject.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={rejectImprovement} className="btn-secondary text-sm">Reject</button>
                <button onClick={acceptImprovement} className="btn-primary text-sm">Accept all</button>
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(improvement.questions || []).map((q, i) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-purple-200">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-purple-700 flex-shrink-0">Q{i + 1}</span>
                    <div className="flex-1 text-sm">
                      <span className="inline-block text-[10px] uppercase tracking-wide bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold mr-1">{q.type}</span>
                      <span className="text-gray-800">{q.prompt}</span>
                      {q.correct?.length > 0 && (
                        <p className="text-xs text-green-700 mt-1">
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
            <div className="card text-center py-8 text-gray-400">
              <p className="text-sm">No questions yet. Click below to add one.</p>
            </div>
          )}

          <button onClick={addQuestion} className="w-full text-sm text-brand-700 hover:bg-brand-50 border-2 border-dashed border-brand-200 rounded-lg py-3">
            + Add question
          </button>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 mt-6 bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {questions.length} question{questions.length === 1 ? '' : 's'}
            {saved && <span className="ml-3 text-green-600 font-semibold">✓ Saved</span>}
            {error && <span className="ml-3 text-red-600">{error}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/manager/sheets')} className="btn-secondary text-sm">Done</button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save changes'}
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
        const parts = line.split(/\s*[→=>|]\s*/)
        return parts.length === 2 ? { left: parts[0].trim(), right: parts[1].trim() } : null
      })
      .filter(Boolean)
    onUpdate({ pairs })
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
            {idx + 1}
          </span>
          <select
            value={q.type}
            onChange={e => onUpdate({ type: e.target.value })}
            className="input text-xs py-1 px-2 w-auto"
          >
            {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded"
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Prompt</label>
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
            <label className="text-xs font-medium text-gray-600">
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
            <label className="text-xs font-medium text-gray-600">
              Pairs (left → right, one per line)
            </label>
            <textarea
              value={(q.pairs || []).map(p => `${p.left} → ${p.right}`).join('\n')}
              onChange={e => updatePairs(e.target.value)}
              rows={4}
              className="input text-xs mt-0.5 resize-none font-mono"
              placeholder="Dog → Bark&#10;Cat → Meow"
            />
          </div>
        )}

        {isOrdering ? (
          <div>
            <label className="text-xs font-medium text-gray-600">Correct order (one per line)</label>
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
            <label className="text-xs font-medium text-gray-600">
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
            <label className="text-xs font-medium text-gray-600">Points</label>
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
