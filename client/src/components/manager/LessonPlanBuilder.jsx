import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import ConfirmModal from '../shared/ConfirmModal'
import SheetPreviewModal from '../shared/SheetPreviewModal'
import api from '../../lib/api'

const difficultyLabel = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' }
const difficultyColor = { 1: 'text-green-600', 2: 'text-blue-600', 3: 'text-yellow-600', 4: 'text-orange-600', 5: 'text-red-600' }
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Map DB day (0=Mon…6=Sun) → JS day (0=Sun…6=Sat)
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
  return d.toISOString().split('T')[0]
}

function SortablePlanItem({ item, onRemove, onUpdate, onPreview }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [showDetails, setShowDetails] = useState(!!item.scheduledDate || !!item.tutorNotes)

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none px-1">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{item.sheet?.title || item.sheetTitle}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-500">{item.sheet?.subject || item.subject}</span>
            <span className="text-gray-300">·</span>
            <span className={`text-xs font-medium ${difficultyColor[item.sheet?.difficultyLevel || item.difficultyLevel]}`}>
              {difficultyLabel[item.sheet?.difficultyLevel || item.difficultyLevel]}
            </span>
            {item.status === 'completed' && (
              <span className="text-xs text-green-600 font-semibold">✓ Completed</span>
            )}
            {item.scheduledDate && (
              <span className="text-xs text-brand-600">
                📅 {new Date(item.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {item.tutorNotes && (
              <span className="text-xs text-gray-600 italic" title={item.tutorNotes}>
                📝 has note
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => onPreview(item.sheetId)}
          className="text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0"
          title="Preview sheet"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        <button
          onClick={() => setShowDetails(s => !s)}
          className={`text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0 ${showDetails ? 'text-brand-600' : ''}`}
          title="Schedule and notes"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" transform="rotate(45 12 12)" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Remove from plan">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {showDetails && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Scheduled date</label>
              <input
                type="date"
                value={item.scheduledDate ? item.scheduledDate.split('T')[0] : ''}
                onChange={e => onUpdate(item.id, { scheduledDate: e.target.value || null })}
                className="input text-xs py-1.5 mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Due date</label>
              <input
                type="date"
                value={item.dueDate ? item.dueDate.split('T')[0] : ''}
                onChange={e => onUpdate(item.id, { dueDate: e.target.value || null })}
                className="input text-xs py-1.5 mt-0.5"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tutor notes</label>
            <textarea
              value={item.tutorNotes || ''}
              onChange={e => onUpdate(item.id, { tutorNotes: e.target.value })}
              className="input text-xs py-1.5 mt-0.5 resize-none"
              rows={2}
              placeholder="e.g. Revisit denominators next session"
            />
          </div>
        </div>
      )}
    </div>
  )
}

const SUBJECT_ICONS = {
  Mathematics: '📐',
  English: '📝',
  Science: '🔬'
}

function SheetLibrary({ sheets, planItems, onAdd, onPreview, search, onSearchChange }) {
  const [expanded, setExpanded] = useState({})

  // Filter sheets by search
  const filtered = sheets.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.title.toLowerCase().includes(q) ||
           s.topic.toLowerCase().includes(q) ||
           s.subject.toLowerCase().includes(q)
  })

  // Build tree: subject → topic → sheets
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
      icon: SUBJECT_ICONS[subject] || '📄',
      topics: Object.keys(map[subject]).sort().map(topic => ({
        topic,
        sheets: map[subject][topic].sort((a, b) => a.title.localeCompare(b.title))
      }))
    }))
    return sorted
  }, [filtered])

  // Auto-expand all when searching
  useEffect(() => {
    if (search) {
      const all = {}
      tree.forEach(s => {
        all[s.subject] = true
        s.topics.forEach(t => { all[`${s.subject}/${t.topic}`] = true })
      })
      setExpanded(all)
    }
  }, [search, tree])

  function toggleExpand(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const totalFiltered = filtered.length

  return (
    <div className="card sticky top-20 p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Sheet Library</h2>

      <input
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        className="input mb-3"
        placeholder="Search sheets…"
      />

      <div className="max-h-[calc(100vh-240px)] overflow-y-auto pr-1 -mr-1">
        {tree.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">No sheets match your search.</p>
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
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-base flex-shrink-0">{subjectNode.icon}</span>
                    <span className={`text-xs flex-shrink-0 transition-transform ${isSubjectOpen ? 'rotate-90' : ''}`}>▶</span>
                    <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{subjectNode.subject}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {subjectAddedCount > 0 && <span className="text-green-600 mr-1">{subjectAddedCount} added</span>}
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
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left"
                            >
                              <span className={`text-xs text-gray-400 flex-shrink-0 transition-transform ${isTopicOpen ? 'rotate-90' : ''}`}>▶</span>
                              <span className="text-xs font-medium text-gray-600 flex-1 truncate">{topicNode.topic}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {topicAddedCount > 0 && <span className="text-green-600 mr-1">{topicAddedCount}</span>}
                                {topicNode.sheets.length}
                              </span>
                            </button>

                            {/* Sheets within topic */}
                            {isTopicOpen && (
                              <div className="ml-4 space-y-1 py-1">
                                {topicNode.sheets.map(sheet => {
                                  const inPlan = planItems.some(i => i.sheetId === sheet.id)
                                  return (
                                    <div
                                      key={sheet.id}
                                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                                        inPlan
                                          ? 'bg-green-50 text-green-700'
                                          : 'hover:bg-brand-50 text-gray-700 hover:text-brand-700'
                                      }`}
                                    >
                                      <button
                                        onClick={() => !inPlan && onAdd(sheet)}
                                        disabled={inPlan}
                                        className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default cursor-pointer"
                                      >
                                        <span className="flex-shrink-0">
                                          {inPlan ? (
                                            <span className="text-green-500">✓</span>
                                          ) : (
                                            <span className="text-gray-300">○</span>
                                          )}
                                        </span>
                                        <span className="flex-1 truncate">{sheet.title}</span>
                                      </button>
                                      <button
                                        onClick={() => onPreview(sheet.id)}
                                        className="flex-shrink-0 text-gray-300 hover:text-brand-600 transition-colors p-0.5"
                                        title="Preview sheet"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
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
          <p className="text-xs text-gray-400 text-center mt-3 pt-2 border-t border-gray-100">
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

  // Plan items
  const [planItems, setPlanItems] = useState([])

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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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
  }, [studentId, students, isNew])

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

        if (!isNew) {
          const planRes = await api.get(`/lesson-plans/${planId}`)
          const plan = planRes.data
          setTitle(plan.title)
          setStudentId(String(plan.studentId))
          setTutorId(String(plan.tutorId))
          setSelectedDate(plan.startDate?.split('T')[0] || '')
          setStatus(plan.status)
          setLessonDayOfWeek(plan.lessonDayOfWeek !== null && plan.lessonDayOfWeek !== undefined ? String(plan.lessonDayOfWeek) : '')
          setPlanItems(plan.items.sort((a, b) => a.sequenceOrder - b.sequenceOrder).map(i => ({
            id: i.id,
            sheetId: i.sheetId,
            sheet: i.sheet,
            scheduledDate: i.scheduledDate,
            dueDate: i.dueDate,
            tutorNotes: i.tutorNotes || '',
            status: i.status
          })))
        }
      } catch (e) {
        setError('Failed to load data')
      } finally {
        setLoading(false)
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
          start: d.toISOString().split('T')[0],
          display: 'background',
          backgroundColor: '#e0e7ff'
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
        backgroundColor: '#4f46e5',
        borderColor: '#4f46e5',
        textColor: '#fff'
      })
    }

    return evts
  }, [studentDays, selectedDate])

  function addSheet(sheet) {
    if (planItems.find(i => i.sheetId === sheet.id)) return
    setPlanItems(prev => [...prev, {
      id: `temp-${Date.now()}-${sheet.id}`,
      sheetId: sheet.id,
      sheet,
      scheduledDate: null,
      status: 'available'
    }])
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
      if (isNew) {
        const res = await api.post('/lesson-plans', {
          title, studentId, tutorId, status,
          startDate: selectedDate || null,
          lessonDayOfWeek: lessonDayOfWeek !== '' ? lessonDayOfWeek : null
        })
        plan = res.data
      } else {
        const res = await api.put(`/lesson-plans/${planId}`, {
          title, tutorId, status,
          startDate: selectedDate || null,
          lessonDayOfWeek: lessonDayOfWeek !== '' ? lessonDayOfWeek : null
        })
        plan = res.data
        const existingRes = await api.get(`/lesson-plans/${planId}`)
        for (const item of existingRes.data.items) {
          await api.delete(`/lesson-plans/${planId}/items/${item.id}`)
        }
      }

      const pid = plan.id || parseInt(planId)

      for (let i = 0; i < planItems.length; i++) {
        const item = planItems[i]
        await api.post(`/lesson-plans/${pid}/items`, {
          sheetId: item.sheetId,
          scheduledDate: item.scheduledDate || undefined,
          dueDate: item.dueDate || undefined,
          tutorNotes: item.tutorNotes || undefined,
          status: 'available'
        })
      }

      setSuccess('Lesson plan saved!')
      setTimeout(() => navigate(`${basePath}/students/${studentId}`), 1000)
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <><Navbar /><LoadingSpinner /></>

  return (
    <>
      <Navbar title={isNew ? 'New Lesson Plan' : 'Edit Lesson Plan'} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">
          ← Back
        </button>

        <div className={`flex flex-col lg:flex-row gap-6 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
          {/* Left: Plan config + items */}
          <div className="flex-1 space-y-5">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">{isNew ? 'Create Lesson Plan' : 'Edit Plan'}</h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Plan Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="e.g. Alice's Maths Programme" />
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
                    <select value={tutorId} onChange={e => setTutorId(e.target.value)} className="input">
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

                {/* Lesson day + calendar scheduling */}
                {studentId && (
                  <div className="border-t border-gray-100 pt-4">
                    <label className="label mb-2">Schedule Lesson</label>

                    {studentDays.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500 mb-2">
                          {selectedStudent?.name}'s lesson days — click to pick the next date:
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {studentDays.map(d => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleDaySelect(d)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                String(d) === lessonDayOfWeek
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {DAY_NAMES[d]}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-yellow-600 mb-3">
                        No lesson days set for this student. Pick a date from the calendar, or
                        <button
                          type="button"
                          onClick={() => navigate(`${basePath}/students/${studentId}`)}
                          className="text-brand-600 hover:underline ml-1"
                        >
                          edit their profile
                        </button>.
                      </p>
                    )}

                    {selectedDate && (
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-sm text-gray-600">Selected:</span>
                        <span className="text-sm font-semibold text-brand-700">
                          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedDate(''); setLessonDayOfWeek('') }}
                          className="text-xs text-gray-400 hover:text-red-500 ml-1"
                        >
                          clear
                        </button>
                      </div>
                    )}

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
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
                      <p className="text-xs text-gray-400 mt-2">
                        Highlighted dates are {selectedStudent?.name}'s scheduled lesson days
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Plan Items ({planItems.length})</h2>
                <p className="text-xs text-gray-400">Drag to reorder</p>
              </div>

              {planItems.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm">Add sheets from the library on the right</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={planItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {planItems.map(item => (
                        <SortablePlanItem
                          key={item.id}
                          item={item}
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

            {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">{success}</div>}

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3 text-base">
              {saving ? 'Saving…' : isNew ? 'Create Lesson Plan' : 'Save Changes'}
            </button>
          </div>

          {/* Right: Sheet library */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <SheetLibrary
              sheets={sheets}
              planItems={planItems}
              onAdd={addSheet}
              onPreview={setPreviewSheetId}
              search={search}
              onSearchChange={setSearch}
            />
          </div>
        </div>
      </main>

      <SheetPreviewModal
        sheetId={previewSheetId}
        onClose={() => setPreviewSheetId(null)}
        onAdd={previewSheetId && !planItems.some(i => i.sheetId === previewSheetId)
          ? (sheet) => addSheet(sheet)
          : null}
        alreadyAdded={planItems.some(i => i.sheetId === previewSheetId)}
      />

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
