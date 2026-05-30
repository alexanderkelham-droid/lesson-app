import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import api from '../../lib/api'

// Map our DB dayOfWeek (0=Mon…6=Sun) to JS day indices (0=Sun,1=Mon…6=Sat)
function dbDayToJsDay(dbDay) {
  return dbDay === 6 ? 0 : dbDay + 1
}

function getDatesForDay(jsDayOfWeek, start, end) {
  const dates = []
  const d = new Date(start)
  while (d.getDay() !== jsDayOfWeek) d.setDate(d.getDate() + 1)
  while (d <= end) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return dates
}

const SUBJECT_COLORS = {
  maths:   { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  english: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  both:    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  default: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' }
}

export default function CalendarView({ students, plans }) {
  const navigate = useNavigate()
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [sessions, setSessions] = useState([])
  const [editSession, setEditSession] = useState(null) // { id, scheduledAt, durationMins, notes }
  const [savingEdit, setSavingEdit] = useState(false)

  // Fetch sessions spanning the calendar's visible range (3 months)
  async function loadSessions() {
    try {
      const today = new Date()
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth() + 2, 0)
      const res = await api.get(`/sessions?from=${from.toISOString()}&to=${to.toISOString()}`)
      setSessions(res.data)
    } catch (e) { /* ignore */ }
  }

  useEffect(() => { loadSessions() }, [])

  // Build events: real sessions (foreground) + recurring lesson-day placeholders (background)
  const events = useMemo(() => {
    const evts = []
    const today = new Date()
    const rangeStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)

    // Active sessions — primary events, draggable
    sessions.forEach(s => {
      const student = s.lessonPlan?.student
      const colors = SUBJECT_COLORS[student?.subjectFocus] || SUBJECT_COLORS.default
      const attended = !!s.attendedAt
      const past = !attended && new Date(s.scheduledAt) < new Date()

      evts.push({
        id: `session-${s.id}`,
        title: student?.name || 'Lesson',
        start: s.scheduledAt,
        backgroundColor: attended ? '#dcfce7' : past ? '#fef3c7' : colors.bg,
        borderColor:     attended ? '#16a34a' : past ? '#d97706' : colors.border,
        textColor:       attended ? '#166534' : past ? '#92400e' : colors.text,
        editable: true,
        durationEditable: false,
        extendedProps: {
          kind: 'session',
          sessionId: s.id,
          studentId: student?.id,
          studentName: student?.name,
          tutorName: s.lessonPlan?.tutor?.name,
          planTitle: s.lessonPlan?.title,
          planId: s.lessonPlan?.id,
          subjectFocus: student?.subjectFocus,
          attended,
          notes: s.notes,
          durationMins: s.durationMins,
        }
      })
    })

    // Recurring lesson-day slots — background events showing the regular schedule
    // (skip days that already have a real session)
    const sessionDates = new Set(
      sessions.map(s => new Date(s.scheduledAt).toISOString().split('T')[0] + '-' + s.lessonPlan?.studentId)
    )
    students.forEach(student => {
      const days = student.lessonDays || []
      days.forEach(dbDay => {
        const jsDay = dbDayToJsDay(dbDay)
        const dates = getDatesForDay(jsDay, rangeStart, rangeEnd)
        dates.forEach(date => {
          const key = date.toISOString().split('T')[0] + '-' + student.id
          if (sessionDates.has(key)) return // session already exists this day for this student
          const dayPlans = plans.filter(p => p.studentId === student.id && p.lessonDayOfWeek === dbDay && p.status === 'active')
          evts.push({
            id: `placeholder-${student.id}-${date.toISOString()}`,
            title: student.name,
            start: date.toISOString().split('T')[0],
            display: 'background',
            backgroundColor: dayPlans.length > 0 ? '#f3e8ff' : '#fef9c3',
            extendedProps: {
              kind: 'placeholder',
              studentId: student.id,
              studentName: student.name,
              subjectFocus: student.subjectFocus,
              dayOfWeek: dbDay,
              planId: dayPlans[0]?.id || null,
              planTitle: dayPlans[0]?.title || null,
              hasPlan: dayPlans.length > 0
            }
          })
        })
      })
    })

    return evts
  }, [students, plans, sessions])

  function handleEventClick(info) {
    setSelectedEvent({ ...info.event.extendedProps, date: info.event.startStr })
  }

  async function handleEventDrop(info) {
    const props = info.event.extendedProps
    if (props.kind !== 'session') {
      info.revert()
      return
    }
    try {
      await api.put(`/sessions/${props.sessionId}`, {
        scheduledAt: info.event.start.toISOString()
      })
      await loadSessions()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to reschedule')
      info.revert()
    }
  }

  function openEditFromSelected() {
    if (selectedEvent?.kind !== 'session') return
    const s = sessions.find(x => x.id === selectedEvent.sessionId)
    if (!s) return
    const dt = new Date(s.scheduledAt)
    const pad = n => String(n).padStart(2, '0')
    setEditSession({
      id: s.id,
      scheduledAt: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
      durationMins: s.durationMins || 60,
      notes: s.notes || ''
    })
    setSelectedEvent(null)
  }

  async function saveEdit() {
    if (!editSession) return
    setSavingEdit(true)
    try {
      await api.put(`/sessions/${editSession.id}`, {
        scheduledAt: new Date(editSession.scheduledAt).toISOString(),
        durationMins: editSession.durationMins ? parseInt(editSession.durationMins) : null,
        notes: editSession.notes || null
      })
      setEditSession(null)
      await loadSessions()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteSession(id) {
    if (!confirm('Delete this session?')) return
    try {
      await api.delete(`/sessions/${id}`)
      setSelectedEvent(null)
      setEditSession(null)
      await loadSessions()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete')
    }
  }

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#dbeafe', borderColor: '#3b82f6' }} />
          <span className="text-gray-600">Maths session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#fce7f3', borderColor: '#ec4899' }} />
          <span className="text-gray-600">English session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#dcfce7', borderColor: '#16a34a' }} />
          <span className="text-gray-600">Attended</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#fef3c7', borderColor: '#d97706' }} />
          <span className="text-gray-600">Past — no record</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f3e8ff' }} />
          <span className="text-gray-600">Regular slot (no session)</span>
        </div>
        <span className="text-gray-400 italic">Drag a session to reschedule</span>
      </div>

      <div className="card p-2 sm:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          editable={true}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          firstDay={1}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
        />
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">{selectedEvent.studentName}</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-800 text-right">
                  {new Date(selectedEvent.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {selectedEvent.kind === 'session' && (
                    <span className="block text-xs text-gray-500">
                      {new Date(selectedEvent.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {selectedEvent.durationMins ? ` · ${selectedEvent.durationMins} min` : ''}
                    </span>
                  )}
                </span>
              </div>

              {selectedEvent.subjectFocus && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-800 capitalize">{selectedEvent.subjectFocus}</span>
                </div>
              )}

              {selectedEvent.kind === 'session' && (
                <>
                  {selectedEvent.tutorName && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tutor</span>
                      <span className="font-medium text-gray-800">{selectedEvent.tutorName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    {selectedEvent.attended ? (
                      <span className="font-medium text-green-600">Attended ✓</span>
                    ) : (
                      <span className="font-medium text-amber-600">Scheduled</span>
                    )}
                  </div>
                  {selectedEvent.notes && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Notes</p>
                      <p className="text-xs text-gray-700 italic whitespace-pre-wrap">{selectedEvent.notes}</p>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between">
                <span className="text-gray-500">Lesson Plan</span>
                {selectedEvent.planTitle ? (
                  <span className="font-medium text-green-600">{selectedEvent.planTitle}</span>
                ) : (
                  <span className="font-medium text-yellow-600">Not assigned</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5 flex-wrap">
              {selectedEvent.kind === 'session' ? (
                <>
                  <button onClick={openEditFromSelected} className="btn-primary flex-1 text-sm">
                    Reschedule
                  </button>
                  <button
                    onClick={() => navigate(`/manager/lesson-plans/${selectedEvent.planId}/live`)}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteSession(selectedEvent.sessionId)}
                    className="text-xs py-2 px-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate(`/manager/students/${selectedEvent.studentId}`)}
                    className="btn-secondary flex-1 text-sm"
                  >
                    View Student
                  </button>
                  {selectedEvent.hasPlan ? (
                    <button
                      onClick={() => navigate(`/manager/lesson-plans/${selectedEvent.planId}/builder`)}
                      className="btn-primary flex-1 text-sm"
                    >
                      Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate(`/manager/lesson-plans/new?studentId=${selectedEvent.studentId}&day=${selectedEvent.dayOfWeek}`)}
                      className="btn-primary flex-1 text-sm"
                    >
                      Create Plan
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule edit modal */}
      {editSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditSession(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-lg mb-3">Reschedule session</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Date & time</label>
                <input
                  type="datetime-local"
                  value={editSession.scheduledAt}
                  onChange={e => setEditSession({ ...editSession, scheduledAt: e.target.value })}
                  className="input text-sm mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Duration (mins)</label>
                <input
                  type="number"
                  value={editSession.durationMins}
                  onChange={e => setEditSession({ ...editSession, durationMins: e.target.value })}
                  className="input text-sm mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Notes</label>
                <textarea
                  value={editSession.notes}
                  onChange={e => setEditSession({ ...editSession, notes: e.target.value })}
                  rows={2}
                  className="input text-sm mt-0.5 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditSession(null)} className="btn-secondary flex-1" disabled={savingEdit}>Cancel</button>
              <button onClick={saveEdit} className="btn-primary flex-1" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
