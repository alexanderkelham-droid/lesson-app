import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'
import LoadingSpinner from '../shared/LoadingSpinner'
import RedwoodLogo from '../shared/RedwoodLogo'
import { PrintedSheet, AnswerKey } from './PrintedSheet'
import { PrintToolbar, ToggleChip, OriginalPdfButton, PrintMessage } from './PrintToolbar'
import './print.css'


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
const SUBJECTS = { maths: 'Maths', english: 'English', both: 'English & Maths' }

function ordinalDate(d) {
  const day = d.getDate()
  const suffix = ['th', 'st', 'nd', 'rd'][((day % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][day % 100] || 'th'
  return `${day}${suffix} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
}

// Score column: score if marked, TBC if awaiting marking, "done" for tasks without a score
function scoreText(item) {
  if (item.status !== 'completed') return ''
  const r = item.studentResponses?.[0]
  if (!r) return 'done'
  return r.score != null ? String(Math.round(r.score)) : 'TBC'
}

function sheetLabel(item) {
  if (!item.sheet) return itemTitle(item)
  const { topic, title } = item.sheet
  return topic && !title.toLowerCase().includes(topic.toLowerCase()) ? `${topic}, ${title}` : title
}

// Bordered lesson sheet matching the centre's paper template
function LessonSheet({ student, tutor, date, items, showNotes, emptyLabel }) {
  const rows = [...items]
  while (rows.length < 9) rows.push(null)
  return (
    <table className="lesson-sheet">
      <colgroup><col style={{ width: '7%' }} /><col style={{ width: '36%' }} /><col style={{ width: '38%' }} /><col style={{ width: '19%' }} /></colgroup>
      <tbody>
        <tr className="ls-welcome"><td colSpan={3}>Welcome to Redwood Scholars Tuition!</td><td /></tr>
        <tr className="ls-student">
          <td colSpan={2} className="ls-name">{student?.name}</td>
          <td className="ls-date">{date ? ordinalDate(date) : emptyLabel}</td>
          <td />
        </tr>
        <tr className="ls-meta">
          <td colSpan={2}>{SUBJECTS[student?.subjectFocus] || ''}</td>
          <td>Tutor: {tutor?.name || ''}</td>
          <td className="ls-score-head">Score%</td>
        </tr>
        {rows.map((item, i) => (
          <tr key={item?.id || `blank-${i}`} className="ls-row avoid-break">
            <td className="ls-num">{i + 1}</td>
            <td colSpan={2} className={item && !item.sheet ? 'ls-online' : ''}>
              {item && sheetLabel(item)}
              {item?.sheet && <span className="no-print" style={{ marginLeft: 8 }}><OriginalPdfButton sheet={item.sheet} /></span>}
              {showNotes && item?.tutorNotes && <div className="ls-note">Note: {item.tutorNotes}</div>}
            </td>
            <td>{item && scoreText(item)}</td>
          </tr>
        ))}
        <tr className="ls-homework"><td /><td colSpan={2}><strong>Homework:</strong></td><td /></tr>
      </tbody>
    </table>
  )
}

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
          {/* The centre's lesson sheet layout (same as the original-PDF packs) */}
          <LessonSheet
            student={student}
            tutor={tutor}
            date={lessonDate}
            items={items}
            showNotes={notes}
            emptyLabel={scopeLabel}
          />

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
