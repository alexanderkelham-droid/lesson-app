import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'
import LoadingSpinner from '../shared/LoadingSpinner'
import RedwoodLogo from '../shared/RedwoodLogo'
import { PrintedSheet, AnswerKey } from './PrintedSheet'
import { PrintToolbar, ToggleChip, OriginalPdfButton, PrintMessage } from './PrintToolbar'
import './print.css'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const CUSTOM_LABELS = { ixl_maths: 'IXL Maths', ixl_english: 'IXL English', paper: 'Paper task' }

function itemTitle(item) {
  return item.sheet?.title || item.customTitle || 'Untitled'
}

function itemKind(item) {
  if (item.sheet) {
    const n = item.sheet.contentJson?.questions?.length || 0
    return [item.sheet.subject, item.sheet.topic, `${n} question${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  }
  return CUSTOM_LABELS[item.customType] || 'Task'
}

// /print/plan/:planId?session=<id|next|all|unscheduled>&answers=0|1&notes=0|1
// A "lesson pack": cover page + every sheet (each on a new page) + optional key.
export default function PrintPlan() {
  const { planId } = useParams()
  const [params, setParams] = useSearchParams()
  const session = params.get('session') || 'all'
  const answers = params.get('answers') === '1'
  const notes = params.get('notes') === '1'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    api.get(`/lesson-plans/${planId}/print`, { params: { session } })
      .then(res => setData(res.data))
      .catch(err => setError(
        err.response?.status === 403 ? "You don't have access to this lesson plan."
          : err.response?.data?.error || 'Could not load this lesson plan'
      ))
  }, [planId, session])

  const lessonDate = data?.session ? new Date(data.session.scheduledAt) : null
  const dateLabel = lessonDate?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) || ''

  useEffect(() => {
    if (!data) return
    document.title = ['Lesson pack', data.student?.name, dateLabel].filter(Boolean).join(' – ')
  }, [data, dateLabel])

  function setFlag(key, on) {
    const next = new URLSearchParams(params)
    if (on) next.set(key, '1'); else next.delete(key)
    setParams(next, { replace: true })
  }

  if (error) return <PrintMessage><p className="text-red-700">{error}</p></PrintMessage>
  if (!data) return <LoadingSpinner />

  const { plan, student, tutor, items } = data
  const sheetItems = items.filter(i => i.sheet)
  const scopeLabel = data.scope === 'session' ? null
    : data.scope === 'unscheduled' ? 'Unscheduled items' : 'All items in plan'
  const slot = plan.lessonDayOfWeek != null
    ? `${DAY_NAMES[plan.lessonDayOfWeek]}s${plan.lessonTime ? ` at ${plan.lessonTime}` : ''}` : null
  const noteItems = items.filter(i => i.tutorNotes)

  return (
    <div className="print-root">
      <PrintToolbar title={`Lesson pack · ${student?.name || ''}`}>
        <ToggleChip label="Answer key" checked={answers} onChange={on => setFlag('answers', on)} />
        <ToggleChip label="Tutor notes" checked={notes} onChange={on => setFlag('notes', on)} />
      </PrintToolbar>

      <div>
        {/* Cover page */}
        <section className="paper cover">
          {/* One brand mark only: the logo carries the name */}
          <div className="cover-brand">
            <RedwoodLogo variant="wordmark" size="sm" className="text-gray-900" trunkColor="#000" />
            <span>Lesson pack</span>
          </div>
          <h1>{student?.name}</h1>
          <p style={{ fontSize: '13pt' }}>{plan.title}</p>
          <dl>
            <dt>Lesson</dt>
            <dd>
              {lessonDate
                ? `${lessonDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${lessonDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${data.session.durationMins ? ` (${data.session.durationMins} min)` : ''}`
                : scopeLabel}
            </dd>
            <dt>Tutor</dt>
            <dd>{tutor?.name || '—'}</dd>
            {slot && <><dt>Usual slot</dt><dd>{slot}</dd></>}
          </dl>

          <h2 style={{ fontWeight: 700, fontSize: '13pt', margin: '8px 0 4px' }}>In this lesson</h2>
          {items.length === 0 ? (
            <p className="muted">No items in this {data.scope === 'session' ? 'session' : 'selection'} yet.</p>
          ) : (
            <ul className="checklist">
              {items.map((item, i) => (
                <li key={item.id} className="avoid-break">
                  <span className="tick-box" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      {i + 1}. {itemTitle(item)}
                      {item.status === 'completed' && <span className="muted"> (already completed)</span>}
                    </div>
                    <div className="muted">
                      {itemKind(item)}
                      {!item.sheet && ' · not printed'}
                    </div>
                    {notes && item.tutorNotes && <div className="muted"><strong>Note:</strong> {item.tutorNotes}</div>}
                  </div>
                  {item.sheet && (
                    <div className="no-print"><OriginalPdfButton sheet={item.sheet} /></div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {notes && (data.session?.notes || plan.studentNotes || noteItems.length > 0) && (
            <div className="notes-box">
              <strong>Tutor notes</strong>
              {plan.studentNotes && <p style={{ margin: '4px 0' }}>About {student?.name}: {plan.studentNotes}</p>}
              {data.session?.notes && <p style={{ margin: '4px 0' }}>This session: {data.session.notes}</p>}
            </div>
          )}
          {notes && !(data.session?.notes || plan.studentNotes || noteItems.length > 0) && (
            <p className="muted no-print" style={{ marginTop: 12 }}>No tutor notes for this lesson.</p>
          )}
        </section>

        {/* Worksheets, each on its own page(s) */}
        {sheetItems.map(item => (
          <PrintedSheet
            key={item.id}
            sheet={item.sheet}
            studentName={student?.name}
            dateLabel={dateLabel}
            toolbarExtra={<OriginalPdfButton sheet={item.sheet} />}
          />
        ))}

        {answers && <AnswerKey sheets={sheetItems.map(i => i.sheet)} />}
      </div>
    </div>
  )
}
