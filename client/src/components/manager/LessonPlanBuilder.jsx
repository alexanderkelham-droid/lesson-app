import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import ConfirmModal, { useConfirm } from '../shared/ConfirmModal'
import SheetHistoryBadge from '../shared/SheetHistoryBadge'
import useSheetHistory, { repeatConfirmOptions } from '../../hooks/useSheetHistory'
import SheetPreviewModal from '../shared/SheetPreviewModal'
import api from '../../lib/api'
import { localDateKey } from '../../lib/dates'
import PrintPackMenu from '../print/PrintPackMenu'
import AiPlanModal from '../shared/AiPlanModal'
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList, Clock,
  Eye, FileText, GripVertical, Pin, Plus, RotateCcw, Search, Sparkles, StickyNote, X
} from 'lucide-react'

const levelLabel = n => (n ? `Level ${n}` : '')
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const CUSTOM_TYPES = [
  { value: 'ixl_maths',   label: 'IXL Maths' },
  { value: 'ixl_english', label: 'IXL English' },
  { value: 'paper',       label: 'Paper activity' },
  { value: 'other',       label: 'Custom task' },
]

function customTypeLabel(type) {
  return CUSTOM_TYPES.find(t => t.value === type)?.label || 'Custom task'
}

// Map DB day (0=Mon..6=Sun) to JS day (0=Sun..6=Sat)
function dbDayToJsDay(dbDay) {
  return dbDay === 6 ? 0 : dbDay + 1
}

// Get the next occurrence of a given DB day-of-week from today
function getNextDate(dbDay) {
  const jsDay = dbDayToJsDay(dbDay)
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  const diff = (jsDay - d.getDay() + 7) % 7
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff))
  return localDateKey(d)
}

function SessionsSchedule({ sessions, planItems, newSessionDate, setNewSessionDate, onCreate, onDelete, onCarryOver, saving }) {
  const sorted = sessions.slice().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))

  function countItemsForSession(sessionId) {
    return planItems.filter(i => i.sessionId === sessionId).length
  }
  function countIncompleteForSession(sessionId) {
    return planItems.filter(i => i.sessionId === sessionId && i.status !== 'completed').length
  }

  const unscheduledCount = planItems.filter(i => !i.sessionId).length

  return (
    <div className="card">
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="section-title">Schedule</h2>
          <p className="text-xs text-gray-500 mt-0.5">{sorted.length} session{sorted.length === 1 ? '' : 's'} · plan items into specific sessions</p>
        </div>
      </div>

      {/* New session form */}
      <div className="card-muted p-3 flex flex-wrap items-end gap-2 mb-4">
        <div className="flex-1 min-w-[140px]">
          <label className="label text-xs">Schedule a new session</label>
          <input
            type="date"
            value={newSessionDate}
            onChange={e => setNewSessionDate(e.target.value)}
            min={localDateKey()}
            className="input"
          />
        </div>
        <button
          onClick={onCreate}
          disabled={!newSessionDate || saving}
          className="btn-primary"
        >
          {saving ? 'Adding…' : <><Plus className="icon" aria-hidden /> Add session</>}
        </button>
      </div>

      {/* Sessions list */}
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No sessions scheduled yet. Add one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sorted.map(s => {
            const total = countItemsForSession(s.id)
            const incomplete = countIncompleteForSession(s.id)
            const past = new Date(s.scheduledAt) < new Date()
            const attended = !!s.attendedAt
            const date = new Date(s.scheduledAt)
            return (
              <div
                key={s.id}
                className={`border rounded-lg p-3 ${
                  attended ? 'bg-white border-forest-100'
                  : past ? 'bg-amber-50/50 border-amber-200'
                  : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3" aria-hidden />
                      {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {attended && <span className="badge-success ml-1">Attended</span>}
                      {!attended && past && <span className="badge-warning ml-1">Past</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 -m-1 rounded-md text-gray-400 hover:text-red-700 hover:bg-red-50"
                    title="Delete session"
                    aria-label="Delete session"
                  >
                    <X className="icon" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {total === 0 ? (
                    <span className="italic text-gray-400">No items assigned</span>
                  ) : (
                    <>
                      <span className="font-medium tabular-nums">{total - incomplete}/{total}</span> done
                      {incomplete > 0 && (
                        <span className="text-amber-800 ml-2">{incomplete} incomplete</span>
                      )}
                    </>
                  )}
                </div>
                {past && incomplete > 0 && (
                  <button
                    onClick={() => onCarryOver(s.id)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-medium py-1.5 rounded-md transition-colors"
                  >
                    <RotateCcw className="icon-sm" aria-hidden />
                    Carry {incomplete} item{incomplete === 1 ? '' : 's'} to next session
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Unscheduled badge */}
      {unscheduledCount > 0 && (
        <p className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full" aria-hidden></span>
          {unscheduledCount} item{unscheduledCount === 1 ? '' : 's'} not yet assigned to a session
        </p>
      )}
    </div>
  )
}

function CustomItemModal({ open, onClose, onAdd }) {
  const [customType, setCustomType] = useState('ixl_maths')
  const [customTitle, setCustomTitle] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Suggest a default title based on type
  const defaultTitle = customTypeLabel(customType)

  function submit(e) {
    e.preventDefault()
    onAdd({
      customType,
      customTitle: customTitle.trim() || defaultTitle
    })
    setCustomTitle('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-task-title"
        className="modal-panel w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="custom-task-title" className="section-title mb-1">Add a custom task</h2>
        <p className="text-sm text-gray-500 mb-4">Use this for IXL practice, a paper activity, or any task not in the sheet library.</p>

        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="custom-task-type">Type</label>
            <select
              id="custom-task-type"
              value={customType}
              onChange={e => setCustomType(e.target.value)}
              className="input"
            >
              {CUSTOM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="custom-task-name">Title <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              id="custom-task-name"
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder={defaultTitle}
              className="input"
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1">Add to plan</button>
        </div>
      </form>
    </div>
  )
}

function SortablePlanItem({ item, sessions = [], onRemove, onUpdate, onPreview }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [showDetails, setShowDetails] = useState(!!item.scheduledDate || !!item.tutorNotes)

  const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors flex-shrink-0'

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-card">
      <div className="flex items-center gap-2 p-3">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="icon-lg" aria-hidden />
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">
            {item.customTitle ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="badge">
                  <ClipboardList className="icon-sm text-gray-500" aria-hidden />
                  {customTypeLabel(item.customType)}
                </span>
                {item.customTitle}
              </span>
            ) : (
              item.sheet?.title || item.sheetTitle
            )}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {!item.customTitle && (
              <>
                <span className="text-xs text-gray-500">{item.sheet?.subject || item.subject}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">
                  {levelLabel(item.sheet?.difficultyLevel || item.difficultyLevel)}
                </span>
              </>
            )}
            {item.status === 'completed' && (
              <span className="badge-success"><Check className="icon-sm" aria-hidden /> Completed</span>
            )}
            {item.sessionId && (() => {
              const s = sessions.find(x => x.id === item.sessionId)
              if (!s) return null
              return (
                <span className="badge-accent">
                  <CalendarDays className="icon-sm" aria-hidden />
                  {new Date(s.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )
            })()}
            {!item.sessionId && (
              <span className="text-xs text-gray-400 italic">Unscheduled</span>
            )}
            {item.tutorNotes && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500" title={item.tutorNotes}>
                <StickyNote className="w-3 h-3" aria-hidden /> Has note
              </span>
            )}
          </div>
        </div>

        {!item.customTitle && (
          <button
            onClick={() => onPreview(item.sheetId)}
            className={iconBtn}
            title="Preview sheet"
            aria-label="Preview sheet"
          >
            <Eye className="icon" aria-hidden />
          </button>
        )}

        <button
          onClick={() => setShowDetails(s => !s)}
          className={`${iconBtn} ${showDetails ? 'text-redwood-700 bg-redwood-50 hover:bg-redwood-50 hover:text-redwood-700' : ''}`}
          title="Schedule and notes"
          aria-label="Schedule and notes"
          aria-expanded={showDetails}
        >
          <CalendarDays className="icon" aria-hidden />
        </button>

        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-700 hover:bg-red-50 transition-colors flex-shrink-0"
          title="Remove from plan"
          aria-label="Remove from plan"
        >
          <X className="icon" aria-hidden />
        </button>
      </div>

      {showDetails && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 rounded-b-xl space-y-3">
          <div>
            <label className="label text-xs">Assign to session</label>
            <select
              value={item.sessionId || ''}
              onChange={e => onUpdate(item.id, { sessionId: e.target.value ? parseInt(e.target.value) : null })}
              className="input text-xs py-1.5"
            >
              <option value="">Unscheduled (no session yet)</option>
              {sessions
                .slice()
                .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
                .map(s => {
                  const d = new Date(s.scheduledAt)
                  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  const status = s.attendedAt ? ' (attended)' : (new Date(s.scheduledAt) < new Date() ? ' (past)' : '')
                  return <option key={s.id} value={s.id}>{label}{status}</option>
                })}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Due date</label>
              <input
                type="date"
                value={item.dueDate ? item.dueDate.split('T')[0] : ''}
                onChange={e => onUpdate(item.id, { dueDate: e.target.value || null })}
                className="input text-xs py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="label text-xs">Tutor notes</label>
            <textarea
              value={item.tutorNotes || ''}
              onChange={e => onUpdate(item.id, { tutorNotes: e.target.value })}
              className="input text-xs py-1.5 resize-none"
              rows={2}
              placeholder="e.g. Revisit denominators next session"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SheetLibrary({ sheets, planItems, history = {}, onAdd, onPreview, search, onSearchChange }) {
  const [expanded, setExpanded] = useState({})

  // Filter sheets by search
  const filtered = sheets.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.title.toLowerCase().includes(q) ||
           s.topic.toLowerCase().includes(q) ||
           s.subject.toLowerCase().includes(q)
  })

  // Build tree: subject > topic > sheets
  const tree = useMemo(() => {
    const map = {}
    filtered.forEach(sheet => {
      if (!map[sheet.subject]) map[sheet.subject] = {}
      if (!map[sheet.subject][sheet.topic]) map[sheet.subject][sheet.topic] = []
      map[sheet.subject][sheet.topic].push(sheet)
    })
    // Sort subjects, topics, and sheets within each topic
    const sorted = Object.keys(map).sort().map(subject => ({
      subject,
      topics: Object.keys(map[subject]).sort().map(topic => ({
        topic,
        sheets: map[subject][topic].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        )
      }))
    }))
    return sorted
  }, [filtered])

  // Auto-expand all when searching. Only depends on `search` — `tree` would
  // be a fresh reference every render and cause an infinite loop. We re-read
  // `tree` inside the effect; it's already up-to-date by the time this runs.
  useEffect(() => {
    if (!search) return
    const all = {}
    tree.forEach(s => {
      all[s.subject] = true
      s.topics.forEach(t => { all[`${s.subject}/${t.topic}`] = true })
    })
    setExpanded(all)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function toggleExpand(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const totalFiltered = filtered.length

  return (
    <div className="card sticky top-20 p-4">
      <h2 className="section-title mb-3">Sheet library</h2>

      <div className="relative mb-3">
        <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="input pl-9"
          placeholder="Search sheets"
          aria-label="Search sheets"
        />
      </div>

      <div className="max-h-[calc(100vh-240px)] overflow-y-auto pr-1 -mr-1">
        {tree.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-6">No sheets match your search.</p>
        ) : (
          <div className="space-y-1">
            {tree.map(subjectNode => {
              const subjectKey = subjectNode.subject
              const isSubjectOpen = expanded[subjectKey]
              const subjectSheetCount = subjectNode.topics.reduce((sum, t) => sum + t.sheets.length, 0)
              const subjectAddedCount = subjectNode.topics.reduce(
                (sum, t) => sum + t.sheets.filter(s => planItems.some(i => i.sheetId === s.id)).length, 0
              )

              return (
                <div key={subjectKey}>
                  {/* Subject folder */}
                  <button
                    onClick={() => toggleExpand(subjectKey)}
                    aria-expanded={!!isSubjectOpen}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <ChevronRight className={`icon text-gray-400 transition-transform ${isSubjectOpen ? 'rotate-90' : ''}`} aria-hidden />
                    <BookOpen className="icon text-gray-400" aria-hidden />
                    <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{subjectNode.subject}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {subjectAddedCount > 0 && <span className="text-forest-700 mr-1">{subjectAddedCount} added</span>}
                      {subjectSheetCount}
                    </span>
                  </button>

                  {/* Topics within subject */}
                  {isSubjectOpen && (
                    <div className="ml-4 border-l border-gray-100 pl-1 space-y-0.5">
                      {subjectNode.topics.map(topicNode => {
                        const topicKey = `${subjectKey}/${topicNode.topic}`
                        const isTopicOpen = expanded[topicKey]
                        const topicAddedCount = topicNode.sheets.filter(s => planItems.some(i => i.sheetId === s.id)).length

                        return (
                          <div key={topicKey}>
                            {/* Topic folder */}
                            <button
                              onClick={() => toggleExpand(topicKey)}
                              aria-expanded={!!isTopicOpen}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left"
                            >
                              <ChevronRight className={`icon-sm text-gray-400 transition-transform ${isTopicOpen ? 'rotate-90' : ''}`} aria-hidden />
                              <span className="text-xs font-medium text-gray-600 flex-1 truncate">{topicNode.topic}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                                {topicAddedCount > 0 && <span className="text-forest-700 mr-1">{topicAddedCount}</span>}
                                {topicNode.sheets.length}
                              </span>
                            </button>

                            {/* Sheets within topic */}
                            {isTopicOpen && (
                              <div className="ml-4 space-y-0.5 py-1">
                                {topicNode.sheets.map(sheet => {
                                  const inPlan = planItems.some(i => i.sheetId === sheet.id)
                                  const h = history[sheet.id]
                                  const showHistory = h && (h.completed > 0 || (h.planned && !inPlan))
                                  return (
                                    <div
                                      key={sheet.id}
                                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                                        inPlan
                                          ? 'bg-forest-50 text-forest-700'
                                          : 'hover:bg-redwood-50 text-gray-700 hover:text-redwood-700'
                                      }`}
                                    >
                                      <button
                                        onClick={() => !inPlan && onAdd(sheet)}
                                        disabled={inPlan}
                                        className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default cursor-pointer"
                                        title={inPlan ? 'Already in plan' : 'Add to plan'}
                                      >
                                        <span className="flex-shrink-0">
                                          {inPlan ? (
                                            <Check className="icon-sm text-forest-600" aria-label="In plan" />
                                          ) : (
                                            <Plus className="icon-sm text-gray-400" aria-hidden />
                                          )}
                                        </span>
                                        <span className="flex-1 truncate">{sheet.title}</span>
                                        {showHistory && <SheetHistoryBadge history={h} />}
                                        {sheet.needsReview && (
                                          <span className="badge-warning text-[10px] px-1.5 py-0 flex-shrink-0" title="Digital version may have errors. Check it, or print the original">Review</span>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => onPreview(sheet.id)}
                                        className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors p-0.5 rounded"
                                        title="Preview sheet"
                                        aria-label={`Preview ${sheet.title}`}
                                      >
                                        <Eye className="icon-sm" aria-hidden />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {search && totalFiltered > 0 && (
          <p className="text-xs text-gray-500 text-center mt-3 pt-2 border-t border-gray-100">
            {totalFiltered} sheet{totalFiltered !== 1 ? 's' : ''} found
          </p>
        )}
      </div>
    </div>
  )
}

export default function LessonPlanBuilder() {
  const { planId } = useParams()
  const navigate   = useNavigate()
  const [searchParams] = useSearchParams()
  const { user }   = useAuth()
  const basePath   = user?.role === 'tutor' ? '/tutor' : '/manager'
  const isNew      = !planId

  // Plan meta
  const [title, setTitle]       = useState('')
  const [studentId, setStudentId] = useState(searchParams.get('studentId') || '')
  const [tutorId, setTutorId]   = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [status, setStatus]     = useState('draft')
  const [lessonDayOfWeek, setLessonDayOfWeek] = useState(searchParams.get('day') ?? '')
  const [lessonTime, setLessonTime] = useState('15:00')
  const [studentNotes, setStudentNotes] = useState('')

  // Reference: previous plan(s) for this student
  const [previousPlans, setPreviousPlans] = useState([])
  const [previousExpanded, setPreviousExpanded] = useState(true)

  // Sessions belonging to this plan
  const [sessions, setSessions] = useState([])
  const [newSessionDate, setNewSessionDate] = useState('')
  const [savingSession, setSavingSession] = useState(false)

  // Plan items
  const [planItems, setPlanItems] = useState([])
  const originalSheetIds = useRef(new Set()) // sheets this saved plan already had when loaded

  // Styled confirms and a small notice line
  const [confirm, confirmModal] = useConfirm()
  const [notice, setNotice] = useState('')

  // Library
  const [sheets, setSheets]     = useState([])
  const [search, setSearch]     = useState('')

  // People
  const [students, setStudents] = useState([])
  const [tutors, setTutors]     = useState([])

  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // ── Unsaved-changes tracking ──
  // Snapshot of the editable state once loading finishes; anything different
  // afterwards counts as unsaved.
  const baseline = useRef(null)
  const editableState = JSON.stringify({ title, studentId, tutorId, status, lessonDayOfWeek, lessonTime, studentNotes, selectedDate,
    items: planItems.map(i => [i.id, i.sessionId ?? null, i.tutorNotes ?? '', i.scheduledDate ?? null, i.dueDate ?? null]) })
  const isDirty = baseline.current !== null && baseline.current !== editableState && !success
  const [baselinePending, setBaselinePending] = useState(false)
  useEffect(() => {
    // Take the snapshot one render after loading, once derived defaults settle
    if (!baselinePending) return
    baseline.current = editableState
    setBaselinePending(false)
  }, [baselinePending, editableState])
  useEffect(() => {
    if (!isDirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [notFound, setNotFound] = useState(false)

  // Selected student's lesson days
  const selectedStudent = useMemo(
    () => students.find(s => s.id === parseInt(studentId)),
    [students, studentId]
  )
  const studentDays = useMemo(
    () => (selectedStudent?.lessonDays?.map(d => typeof d === 'object' ? d.dayOfWeek : d) || []),
    [selectedStudent]
  )

  // When student changes (for new plans), auto-select first lesson day + date
  useEffect(() => {
    if (!isNew || !studentId || students.length === 0) return
    const stu = students.find(s => s.id === parseInt(studentId))
    if (!stu) return
    const days = stu.lessonDays?.map(d => typeof d === 'object' ? d.dayOfWeek : d) || []
    if (days.length > 0) {
      // If we have a day from URL param, use it; otherwise pick first day
      const dayToUse = searchParams.get('day') !== null ? parseInt(searchParams.get('day')) : days[0]
      setLessonDayOfWeek(String(dayToUse))
      setSelectedDate(getNextDate(dayToUse))
    }
    // Auto-populate a sensible title if the field is still blank
    if (!title) {
      const first = stu.name.split(' ')[0]
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      setTitle(`${first} — ${today}`)
    }
  }, [studentId, students, isNew])

  // Load previous plans (reference) when student changes
  useEffect(() => {
    if (!studentId) {
      setPreviousPlans([])
      return
    }
    api.get('/lesson-plans')
      .then(res => {
        const others = res.data
          .filter(p => p.studentId === parseInt(studentId) && (!planId || p.id !== parseInt(planId)))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 3)
        setPreviousPlans(others)
      })
      .catch(() => setPreviousPlans([]))
  }, [studentId, planId])

  // The student's sheet memory across all their plans. Saved plans use their
  // own id; a new plan borrows one of the student's other plans (any works).
  const [sheetHistory] = useSheetHistory(planId || previousPlans[0]?.id || null)

  async function reloadSessions() {
    if (!planId) return
    try {
      const res = await api.get(`/lesson-plans/${planId}`)
      setSessions(res.data.sessions || [])
      // Also refresh items so sessionIds are up to date after a server-side change
      setPlanItems(prev => {
        const fresh = res.data.items.sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        return fresh.map(i => ({
          id: i.id,
          sheetId: i.sheetId,
          sheet: i.sheet,
          customTitle: i.customTitle,
          customType: i.customType,
          scheduledDate: i.scheduledDate,
          dueDate: i.dueDate,
          tutorNotes: i.tutorNotes || '',
          sessionId: i.sessionId || null,
          status: i.status
        }))
      })
    } catch (e) { /* ignore */ }
  }

  async function createSession() {
    if (!planId) {
      setError('Save the plan first, then add sessions.')
      return
    }
    if (!newSessionDate) return
    setSavingSession(true)
    try {
      // Default time: take the lesson day's typical hour or just 15:00
      // Use the plan's lesson time (UK local, from this browser) or 15:00
      const dt = new Date(`${newSessionDate}T${lessonTime || '15:00'}:00`)
      await api.post('/sessions', { lessonPlanId: parseInt(planId), scheduledAt: dt.toISOString() })
      setNewSessionDate('')
      await reloadSessions()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create session')
    } finally {
      setSavingSession(false)
    }
  }

  async function deleteSession(sessionIdToDelete) {
    const ok = await confirm({
      title: 'Delete this session?',
      message: 'Items assigned to it will move back to unscheduled.',
      confirmLabel: 'Delete session',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/sessions/${sessionIdToDelete}`)
      await reloadSessions()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete')
    }
  }

  async function triggerCarryover(sessionIdToCarry) {
    const ok = await confirm({
      title: 'Move work to the next lesson?',
      message: 'All unfinished items from this session will be copied into the next upcoming session.',
      confirmLabel: 'Move work',
    })
    if (!ok) return
    try {
      const res = await api.post(`/sessions/${sessionIdToCarry}/carryover`)
      await reloadSessions()
      setNotice(`${res.data.carriedOver} item${res.data.carriedOver === 1 ? '' : 's'} carried over to the next session.`)
    } catch (e) {
      setError(e.response?.data?.error || 'Carryover failed')
    }
  }

  function copyItemFromPrevious(prevItem) {
    // Skip if already in plan
    if (prevItem.sheetId && planItems.some(i => i.sheetId === prevItem.sheetId)) return
    setPlanItems(prev => [...prev, {
      id: `temp-copy-${Date.now()}-${prevItem.id}`,
      sheetId: prevItem.sheetId,
      sheet: prevItem.sheet,
      customTitle: prevItem.customTitle,
      customType: prevItem.customType,
      scheduledDate: null,
      tutorNotes: '',
      status: 'available'
    }])
  }

  useEffect(() => {
    async function load() {
      try {
        const [sheetsRes, usersRes] = await Promise.all([
          api.get('/sheets'),
          api.get('/users')
        ])
        setSheets(sheetsRes.data)
        setStudents(usersRes.data.filter(u => u.role === 'student'))
        setTutors(usersRes.data.filter(u => u.role === 'tutor'))
        // Tutors always own the plans they create
        if (isNew && user?.role === 'tutor') setTutorId(String(user.id))

        if (!isNew) {
          const planRes = await api.get(`/lesson-plans/${planId}`)
          const plan = planRes.data
          setTitle(plan.title)
          setStudentId(String(plan.studentId))
          setTutorId(String(plan.tutorId))
          setSelectedDate(plan.startDate?.split('T')[0] || '')
          setStatus(plan.status)
          setLessonDayOfWeek(plan.lessonDayOfWeek !== null && plan.lessonDayOfWeek !== undefined ? String(plan.lessonDayOfWeek) : '')
          setLessonTime(plan.lessonTime || '15:00')
          originalSheetIds.current = new Set(plan.items.map(i => i.sheetId).filter(Boolean))
          setPlanItems(plan.items.sort((a, b) => a.sequenceOrder - b.sequenceOrder).map(i => ({
            id: i.id,
            sheetId: i.sheetId,
            sheet: i.sheet,
            customTitle: i.customTitle,
            customType: i.customType,
            scheduledDate: i.scheduledDate,
            dueDate: i.dueDate,
            tutorNotes: i.tutorNotes || '',
            sessionId: i.sessionId || null,
            status: i.status
          })))
          setStudentNotes(plan.studentNotes || '')
          setSessions(plan.sessions || [])
        }
      } catch (e) {
        if (e.response?.status === 404 || e.response?.status === 403) setNotFound(true)
        else setError('Failed to load data')
      } finally {
        setLoading(false)
        setBaselinePending(true)
      }
    }
    load()
  }, [planId, isNew])

  function handleDaySelect(dbDay) {
    setLessonDayOfWeek(String(dbDay))
    setSelectedDate(getNextDate(dbDay))
  }

  function handleCalendarDateClick(info) {
    setSelectedDate(info.dateStr)
    // If this date falls on one of the student's lesson days, select it
    const clickedJsDay = new Date(info.dateStr + 'T12:00:00').getDay()
    const matchingDbDay = studentDays.find(d => dbDayToJsDay(d) === clickedJsDay)
    if (matchingDbDay !== undefined) {
      setLessonDayOfWeek(String(matchingDbDay))
    }
  }

  // Build calendar events to highlight student's lesson days
  const calendarEvents = useMemo(() => {
    if (studentDays.length === 0) return []
    const evts = []
    const today = new Date()
    const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)

    studentDays.forEach(dbDay => {
      const jsDay = dbDayToJsDay(dbDay)
      const d = new Date(rangeStart)
      while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1)
      while (d <= rangeEnd) {
        evts.push({
          id: `day-${dbDay}-${d.toISOString()}`,
          start: localDateKey(d),
          display: 'background',
          backgroundColor: '#fdf2f0' // redwood-50
        })
        d.setDate(d.getDate() + 7)
      }
    })

    // Selected date marker
    if (selectedDate) {
      evts.push({
        id: 'selected',
        start: selectedDate,
        title: 'Lesson',
        backgroundColor: '#a8341a', // redwood-600
        borderColor: '#a8341a',
        textColor: '#fff'
      })
    }

    return evts
  }, [studentDays, selectedDate])

  // Next upcoming non-attended session. Used as the default assignment for
  // any new item added in the builder — Magda's "the assumption should
  // always be the lesson is for the next session" requirement.
  const nextSessionId = useMemo(() => {
    const now = Date.now()
    const upcoming = sessions
      .filter(s => !s.attendedAt && new Date(s.scheduledAt).getTime() >= now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    return upcoming[0]?.id || null
  }, [sessions])

  function addSheet(sheet) {
    if (planItems.find(i => i.sheetId === sheet.id)) return
    setPlanItems(prev => [...prev, {
      id: `temp-${Date.now()}-${sheet.id}`,
      sheetId: sheet.id,
      sheet,
      scheduledDate: null,
      sessionId: nextSessionId,
      status: 'available'
    }])
  }

  // Ask before re-setting a sheet the student has done or already has planned
  async function requestAddSheet(sheet) {
    if (planItems.find(i => i.sheetId === sheet.id)) return
    const h = sheetHistory[sheet.id]
    // "Planned" only because this saved plan had it (and it was removed here) isn't a repeat
    const onlyThisPlan = h && !h.completed && originalSheetIds.current.has(sheet.id) && (h.timesSet || 0) <= 1
    const opts = onlyThisPlan ? null : repeatConfirmOptions(h, selectedStudent?.name)
    if (opts && !(await confirm(opts))) return
    addSheet(sheet)
  }

  function addCustomItem({ customType, customTitle }) {
    setPlanItems(prev => [...prev, {
      id: `temp-custom-${Date.now()}`,
      sheetId: null,
      customType,
      customTitle,
      scheduledDate: null,
      tutorNotes: '',
      sessionId: nextSessionId,
      status: 'available'
    }])
    setShowCustomItem(false)
  }

  const [showCustomItem, setShowCustomItem] = useState(false)
  const [showAiPlan, setShowAiPlan] = useState(false)

  // AI suggestions go into the local plan; the tutor saves as usual
  function applyAiPlan(assignments) {
    const stamp = Date.now()
    const added = assignments.flatMap((a, ai) => a.items.map((it, ii) => ({
      id: `temp-ai-${stamp}-${ai}-${ii}`,
      sheetId: it.sheetId || null,
      sheet: it.sheet || undefined,
      customTitle: it.sheetId ? undefined : it.customTitle,
      customType: it.sheetId ? undefined : it.customType,
      scheduledDate: null,
      tutorNotes: it.tutorNotes || '',
      sessionId: a.sessionId || null,
      status: 'available',
    })))
    setPlanItems(prev => [...prev, ...added])
    setSuccess('')
  }

  const [confirmRemove, setConfirmRemove] = useState(null) // { id, title, completed }
  const [previewSheetId, setPreviewSheetId] = useState(null)

  function requestRemoveItem(id) {
    const item = planItems.find(i => i.id === id)
    if (!item) return
    // Skip confirmation for newly-added items (have temp IDs)
    if (typeof item.id === 'string' && item.id.startsWith('temp-')) {
      setPlanItems(prev => prev.filter(i => i.id !== id))
      return
    }
    setConfirmRemove({
      id,
      title: item.sheet?.title || 'this item',
      completed: item.status === 'completed'
    })
  }

  function confirmRemoveItem() {
    setPlanItems(prev => prev.filter(i => i.id !== confirmRemove.id))
    setConfirmRemove(null)
  }

  function updateItem(id, fields) {
    setPlanItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPlanItems(prev => {
      const oldIdx = prev.findIndex(i => i.id === active.id)
      const newIdx = prev.findIndex(i => i.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  async function handleSave() {
    if (!title || !studentId || !tutorId) {
      setError('Please fill in title, student and tutor.')
      return
    }
    setSaving(true)
    setError('')
    try {
      let plan
      let existingItems = []
      if (isNew) {
        const res = await api.post('/lesson-plans', {
          title, studentId, tutorId, status,
          startDate: selectedDate || null,
          lessonDayOfWeek: lessonDayOfWeek !== '' ? lessonDayOfWeek : null,
          lessonTime: lessonTime || null,
          studentNotes: studentNotes || null
        })
        plan = res.data
      } else {
        const res = await api.put(`/lesson-plans/${planId}`, {
          title, tutorId, status,
          startDate: selectedDate || null,
          lessonDayOfWeek: lessonDayOfWeek !== '' ? lessonDayOfWeek : null,
          lessonTime: lessonTime || null,
          studentNotes: studentNotes || null
        })
        plan = res.data
        const existingRes = await api.get(`/lesson-plans/${planId}`)
        existingItems = existingRes.data.items || []
      }

      const pid = plan.id || parseInt(planId)

      // A brand-new plan had no sessions while items were being added, so
      // put its unassigned items into the first upcoming session.
      let defaultSessionId = null
      if (isNew) {
        try {
          const fresh = await api.get(`/lesson-plans/${pid}`)
          const upcoming = (fresh.data.sessions || [])
            .filter(s => !s.attendedAt && new Date(s.scheduledAt).getTime() >= Date.now())
            .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
          defaultSessionId = upcoming[0]?.id || null
        } catch { /* leave unscheduled */ }
      }

      // Diff existing vs current planItems by ID.
      // - Items with a numeric ID that still exist locally: PUT to update
      // - Items with a temp string ID: POST to create
      // - Items in DB but not in local state: DELETE (skip silently if FK fails — they have student responses we don't want to nuke)
      const localById = new Map()
      const tempItems = []
      for (const it of planItems) {
        if (typeof it.id === 'number') localById.set(it.id, it)
        else tempItems.push(it)
      }

      // 1. Delete items no longer in local state (best-effort)
      const removedIds = existingItems
        .filter(e => !localById.has(e.id))
        .map(e => e.id)
      const skippedDeletes = []
      for (const id of removedIds) {
        try {
          await api.delete(`/lesson-plans/${pid}/items/${id}`)
        } catch (delErr) {
          // Likely FK violation because the item has student responses — keep it
          skippedDeletes.push(id)
        }
      }

      // 2. Update existing items (in their current order)
      for (let i = 0; i < planItems.length; i++) {
        const item = planItems[i]
        if (typeof item.id !== 'number') continue
        await api.put(`/lesson-plans/${pid}/items/${item.id}`, {
          scheduledDate: item.scheduledDate || null,
          dueDate: item.dueDate || null,
          tutorNotes: item.tutorNotes ?? null,
          sessionId: item.sessionId ?? null,
          sequenceOrder: i + 1,
          // Preserve progress (in_progress / completed); only unlock locked items
          status: item.status && item.status !== 'locked' ? item.status : 'available'
        })
      }

      // 3. Create new items (those with temp IDs)
      for (let i = 0; i < planItems.length; i++) {
        const item = planItems[i]
        if (typeof item.id === 'number') continue
        await api.post(`/lesson-plans/${pid}/items`, {
          sheetId: item.sheetId || undefined,
          customTitle: item.customTitle || undefined,
          customType: item.customType || undefined,
          scheduledDate: item.scheduledDate || undefined,
          dueDate: item.dueDate || undefined,
          tutorNotes: item.tutorNotes || undefined,
          sessionId: item.sessionId || defaultSessionId || undefined,
          sequenceOrder: i + 1,
          status: 'available'
        })
      }

      if (skippedDeletes.length > 0) {
        setSuccess(`Saved — ${skippedDeletes.length} item${skippedDeletes.length === 1 ? '' : 's'} kept because the student has already worked on ${skippedDeletes.length === 1 ? 'it' : 'them'}.`)
        setTimeout(() => navigate(`${basePath}/students/${studentId}`), 2500)
      } else {
        setSuccess('Lesson plan saved.')
        setTimeout(() => navigate(`${basePath}/students/${studentId}`), 1000)
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function leave(to) {
    if (isDirty) {
      const ok = await confirm({
        title: 'Leave without saving?',
        message: 'You have unsaved changes to this lesson plan.',
        confirmLabel: 'Leave without saving',
        cancelLabel: 'Keep editing',
        destructive: true,
      })
      if (!ok) return
    }
    baseline.current = editableState // don't prompt again from beforeunload
    navigate(to)
  }

  const aiModal = showAiPlan && (
    <AiPlanModal planId={planId} onClose={() => setShowAiPlan(false)} onApply={applyAiPlan} applyLabel="Add to plan" />
  )

  if (loading) return <><Navbar /><LoadingSpinner /></>
  if (notFound) return (
    <>
      <Navbar title="Lesson Plan" />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="card text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <FileText className="icon-lg" aria-hidden />
          </div>
          <p className="text-gray-900 font-medium mb-1">Lesson plan not found</p>
          <p className="text-sm text-gray-500 mb-4">It may have been deleted, or it belongs to another tutor.</p>
          <button onClick={() => navigate(basePath)} className="btn-secondary">
            <ArrowLeft className="icon" aria-hidden /> Back to dashboard
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <Navbar title={isNew ? 'New Lesson Plan' : 'Edit Lesson Plan'} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <button onClick={() => leave(-1)} className="btn-ghost btn-sm -ml-2.5 mb-3">
          <ArrowLeft className="icon-sm" aria-hidden /> Back
        </button>

        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="page-title">{isNew ? 'New lesson plan' : 'Edit lesson plan'}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedStudent ? `For ${selectedStudent.name}` : 'Choose a student, then add sheets from the library.'}
            </p>
          </div>
          {isDirty && <span className="badge-warning">Unsaved changes</span>}
        </div>

        <div className={`flex flex-col lg:flex-row gap-6 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
          {/* Left: Plan config + items */}
          <div className="flex-1 min-w-0 space-y-5">
            <div className="card">
              <h2 className="section-title mb-4">Plan details</h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Plan title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} onFocus={e => isNew && e.target.select()} maxLength={200} className="input" placeholder="e.g. Alice's Maths Programme" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Student *</label>
                    <select value={studentId} onChange={e => setStudentId(e.target.value)} className="input">
                      <option value="">Select student…</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Tutor *</label>
                    <select value={tutorId} onChange={e => setTutorId(e.target.value)} className="input" disabled={user?.role === 'tutor'}>
                      <option value="">Select tutor…</option>
                      {tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className="input">
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Welcome note shown to student at top of dashboard */}
                <div>
                  <label className="label">Note for the student <span className="text-gray-400 font-normal">(optional, shown at top of their portal)</span></label>
                  <textarea
                    value={studentNotes}
                    onChange={e => setStudentNotes(e.target.value)}
                    className="input resize-none"
                    rows={2}
                    placeholder="e.g. Hi Alice! This week we're focusing on fractions. Try the first three sheets before our session."
                  />
                </div>

                {/* Lesson day + calendar scheduling */}
                {studentId && (
                  <div className="border-t border-gray-100 pt-4">
                    <label className="label mb-2">Schedule lesson</label>

                    {studentDays.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500 mb-2">
                          {selectedStudent?.name}'s lesson days — click to pick the next date:
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {studentDays.map(d => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleDaySelect(d)}
                              aria-pressed={String(d) === lessonDayOfWeek}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                String(d) === lessonDayOfWeek
                                  ? 'bg-redwood-600 border-redwood-600 text-white'
                                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                              }`}
                            >
                              {DAY_NAMES[d]}
                            </button>
                          ))}
                          <span className="text-xs text-gray-500 ml-1">at</span>
                          <input
                            type="time"
                            value={lessonTime}
                            onChange={e => setLessonTime(e.target.value)}
                            className="input text-sm py-1.5 w-28"
                            title="What time does this lesson start each week?"
                            aria-label="Lesson start time"
                          />
                          <span className="text-xs text-gray-500">every week</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                        <AlertTriangle className="icon-sm mt-0.5" aria-hidden />
                        <span>
                          No lesson days set for this student. Pick a date from the calendar, or
                          <button
                            type="button"
                            onClick={() => navigate(`${basePath}/students/${studentId}`)}
                            className="link font-medium ml-1"
                          >
                            edit their profile
                          </button>.
                        </span>
                      </p>
                    )}

                    {selectedDate && (
                      <div className="mb-3 flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-600">Selected:</span>
                        <span className="badge-accent text-sm">
                          <CalendarDays className="icon-sm" aria-hidden />
                          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedDate(''); setLessonDayOfWeek('') }}
                          className="btn-ghost btn-sm"
                        >
                          <X className="icon-sm" aria-hidden /> Clear
                        </button>
                      </div>
                    )}

                    <div className="border border-gray-200 rounded-xl overflow-hidden p-2">
                      <FullCalendar
                        plugins={[dayGridPlugin, interactionPlugin]}
                        initialView="dayGridMonth"
                        events={calendarEvents}
                        dateClick={handleCalendarDateClick}
                        headerToolbar={{
                          left: 'prev',
                          center: 'title',
                          right: 'next'
                        }}
                        firstDay={1}
                        height="auto"
                        contentHeight="auto"
                        fixedWeekCount={false}
                        displayEventTime={false}
                      />
                    </div>
                    {studentDays.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Highlighted dates are {selectedStudent?.name}'s scheduled lesson days
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Previous plans for this student (reference) */}
            {previousPlans.length > 0 && (
              <div className="card-muted">
                <button
                  onClick={() => setPreviousExpanded(s => !s)}
                  aria-expanded={previousExpanded}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <ChevronRight className={`icon text-gray-400 transition-transform ${previousExpanded ? 'rotate-90' : ''}`} aria-hidden />
                    Previous lesson plans ({previousPlans.length})
                  </h2>
                  <span className="text-xs text-gray-500">Click items to copy across</span>
                </button>

                {previousExpanded && (
                  <div className="mt-3 space-y-3">
                    {previousPlans.map(prev => {
                      const prevItems = (prev.items || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                      return (
                        <div key={prev.id} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                            <p className="text-sm font-medium text-gray-900">{prev.title}</p>
                            <span className="text-xs text-gray-500">
                              {new Date(prev.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ·
                              <span className="capitalize ml-1">{prev.status}</span>
                            </span>
                          </div>
                          {prevItems.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No items</p>
                          ) : (
                            <div className="space-y-0.5">
                              {prevItems.map(it => {
                                const alreadyAdded = it.sheetId && planItems.some(i => i.sheetId === it.sheetId)
                                const title = it.customTitle || it.sheet?.title || 'Untitled'
                                const isCompleted = it.status === 'completed'
                                const resp = it.studentResponses?.[0]
                                return (
                                  <button
                                    key={it.id}
                                    onClick={() => !alreadyAdded && copyItemFromPrevious(it)}
                                    disabled={alreadyAdded}
                                    className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                                      alreadyAdded ? 'bg-forest-50 text-forest-700 cursor-default'
                                      : 'hover:bg-redwood-50 hover:text-redwood-700 text-gray-700'
                                    }`}
                                  >
                                    <span className="flex-shrink-0">
                                      {alreadyAdded
                                        ? <Check className="icon-sm" aria-label="Already added" />
                                        : <Plus className="icon-sm text-gray-400" aria-hidden />}
                                    </span>
                                    <span className="flex-1 truncate">{title}</span>
                                    {isCompleted && resp?.score != null && (
                                      <span className={`flex-shrink-0 font-medium tabular-nums ${Math.round(resp.score) >= 70 ? 'text-forest-700' : Math.round(resp.score) >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
                                        {Math.round(resp.score)}%
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {prev.studentNotes && (
                            <p className="text-xs text-gray-500 italic mt-2 line-clamp-2">
                              Note: {prev.studentNotes}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sessions schedule */}
            {!isNew && (
              <SessionsSchedule
                sessions={sessions}
                planItems={planItems}
                newSessionDate={newSessionDate}
                setNewSessionDate={setNewSessionDate}
                onCreate={createSession}
                onDelete={deleteSession}
                onCarryOver={triggerCarryover}
                saving={savingSession}
              />
            )}

            <div className="card">
              <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h2 className="section-title">Plan items</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {planItems.length} item{planItems.length === 1 ? '' : 's'}<span className="hidden sm:inline"> · drag to reorder</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isNew && (
                    <button
                      onClick={() => setShowAiPlan(true)}
                      className="btn-secondary btn-sm"
                      title="Suggest the next lessons from this student's history"
                    >
                      <Sparkles className="icon-sm" aria-hidden /> Plan with AI
                    </button>
                  )}
                  <button
                    onClick={() => setShowCustomItem(true)}
                    className="btn-secondary btn-sm"
                  >
                    <Plus className="icon-sm" aria-hidden /> Custom task
                  </button>
                </div>
              </div>
              {/* Next-session hint */}
              {nextSessionId && (() => {
                const ns = sessions.find(s => s.id === nextSessionId)
                if (!ns) return null
                const d = new Date(ns.scheduledAt)
                const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                const timeLabel = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                return (
                  <p className="text-xs text-gray-700 bg-cream/60 border border-gray-200 px-3 py-2 rounded-lg mb-3 flex items-start gap-2">
                    <Pin className="icon-sm mt-0.5 text-redwood-700" aria-hidden />
                    <span>New items will be added to the next session: <strong className="text-gray-900">{dateLabel} at {timeLabel}</strong>. You can move them with the calendar icon on each item.</span>
                  </p>
                )
              })()}
              {!nextSessionId && (lessonDayOfWeek === '' || !lessonTime) && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-3 flex items-start gap-2">
                  <Pin className="icon-sm mt-0.5" aria-hidden />
                  <span>Set a lesson day and time above so new items auto-land in the next session.</span>
                </p>
              )}

              {planItems.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <ClipboardList className="icon-lg" aria-hidden />
                  </div>
                  <p className="font-medium text-gray-900">No items yet</p>
                  <p className="text-sm text-gray-500 mt-1 mb-4">Add sheets from the library, or add a custom task.</p>
                  <button onClick={() => setShowCustomItem(true)} className="btn-secondary btn-sm">
                    <Plus className="icon-sm" aria-hidden /> Custom task
                  </button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={planItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {planItems.map(item => (
                        <SortablePlanItem
                          key={item.id}
                          item={item}
                          sessions={sessions}
                          onRemove={requestRemoveItem}
                          onUpdate={updateItem}
                          onPreview={setPreviewSheetId}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertTriangle className="icon mt-0.5" aria-hidden /> <span>{error}</span>
              </div>
            )}
            {notice && !error && !success && (
              <div role="status" className="bg-forest-50 text-forest-700 text-sm px-4 py-3 rounded-lg border border-forest-100 flex items-start gap-2">
                <Check className="icon mt-0.5" aria-hidden /> <span>{notice}</span>
              </div>
            )}
            {success && (
              <div className="bg-forest-50 text-forest-700 text-sm px-4 py-3 rounded-lg border border-forest-100 flex items-start gap-2">
                <Check className="icon mt-0.5" aria-hidden /> <span>{success}</span>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3 text-base">
              {saving ? 'Saving…' : isNew ? 'Create lesson plan' : 'Save changes'}
            </button>
            {!isNew && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                {isDirty ? <span>Save your changes, then print the lesson pack.</span> : <PrintPackMenu planId={planId} />}
              </div>
            )}
          </div>

          {/* Right: Sheet library */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <SheetLibrary
              sheets={sheets}
              planItems={planItems}
              history={sheetHistory}
              onAdd={requestAddSheet}
              onPreview={setPreviewSheetId}
              search={search}
              onSearchChange={setSearch}
            />
          </div>
        </div>
      </main>

      <CustomItemModal
        open={showCustomItem}
        onClose={() => setShowCustomItem(false)}
        onAdd={addCustomItem}
      />

      <SheetPreviewModal
        sheetId={previewSheetId}
        onClose={() => setPreviewSheetId(null)}
        onAdd={previewSheetId && !planItems.some(i => i.sheetId === previewSheetId)
          ? (sheet) => requestAddSheet(sheet)
          : null}
        alreadyAdded={planItems.some(i => i.sheetId === previewSheetId)}
      />

      {aiModal}
      {confirmModal}
      <ConfirmModal
        open={!!confirmRemove}
        title="Remove this sheet?"
        message={
          confirmRemove?.completed
            ? `"${confirmRemove?.title}" has been completed by the student. Removing it will delete their score and time-spent record for this sheet. This cannot be undone.`
            : `Remove "${confirmRemove?.title}" from this lesson plan? You can add it back from the library.`
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemoveItem}
        onClose={() => setConfirmRemove(null)}
      />
    </>
  )
}
