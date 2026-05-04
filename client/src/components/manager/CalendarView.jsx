import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'

// Map our DB dayOfWeek (0=Mon…6=Sun) to JS day indices (0=Sun,1=Mon…6=Sat)
function dbDayToJsDay(dbDay) {
  return dbDay === 6 ? 0 : dbDay + 1
}

// Generate recurring dates for a given day-of-week within a date range
function getDatesForDay(jsDayOfWeek, start, end) {
  const dates = []
  const d = new Date(start)
  // Move to the first occurrence of that day
  while (d.getDay() !== jsDayOfWeek) d.setDate(d.getDate() + 1)
  while (d <= end) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return dates
}

const SUBJECT_COLORS = {
  maths:   { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },    // blue
  english: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },    // pink
  both:    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },    // indigo
  default: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' }     // gray
}

export default function CalendarView({ students, plans }) {
  const navigate = useNavigate()
  const [selectedEvent, setSelectedEvent] = useState(null)

  // Build calendar events from student lesson days
  const events = useMemo(() => {
    const evts = []
    // Generate events for 3 months around today
    const today = new Date()
    const rangeStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)

    students.forEach(student => {
      const days = student.lessonDays || []
      days.forEach(dbDay => {
        const jsDay = dbDayToJsDay(dbDay)
        const dates = getDatesForDay(jsDay, rangeStart, rangeEnd)

        // Check if there's an active plan for this student + day
        const dayPlans = plans.filter(
          p => p.studentId === student.id && p.lessonDayOfWeek === dbDay && p.status === 'active'
        )
        const hasPlan = dayPlans.length > 0

        const colors = SUBJECT_COLORS[student.subjectFocus] || SUBJECT_COLORS.default

        dates.forEach(date => {
          evts.push({
            id: `${student.id}-${dbDay}-${date.toISOString()}`,
            title: student.name,
            date: date.toISOString().split('T')[0],
            backgroundColor: hasPlan ? colors.bg : '#fef9c3',
            borderColor: hasPlan ? colors.border : '#eab308',
            textColor: hasPlan ? colors.text : '#854d0e',
            extendedProps: {
              studentId: student.id,
              studentName: student.name,
              subjectFocus: student.subjectFocus,
              dayOfWeek: dbDay,
              hasPlan,
              planTitle: dayPlans[0]?.title || null,
              planId: dayPlans[0]?.id || null
            }
          })
        })
      })
    })
    return evts
  }, [students, plans])

  function handleEventClick(info) {
    const props = info.event.extendedProps
    setSelectedEvent({
      ...props,
      date: info.event.startStr
    })
  }

  function handleDateClick(info) {
    setSelectedEvent(null)
  }

  function closePopover() {
    setSelectedEvent(null)
  }

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#dbeafe', borderColor: '#3b82f6' }} />
          <span className="text-gray-600">Maths (has plan)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#fce7f3', borderColor: '#ec4899' }} />
          <span className="text-gray-600">English (has plan)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#e0e7ff', borderColor: '#6366f1' }} />
          <span className="text-gray-600">Both (has plan)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: '#fef9c3', borderColor: '#eab308' }} />
          <span className="text-gray-600">No plan assigned</span>
        </div>
      </div>

      <div className="card p-2 sm:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek'
          }}
          firstDay={1}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
          eventTimeFormat={{ hour: undefined }}
          displayEventTime={false}
          eventContent={(arg) => {
            const props = arg.event.extendedProps
            return (
              <div className="px-1.5 py-0.5 text-xs font-medium truncate cursor-pointer flex items-center gap-1">
                {!props.hasPlan && <span className="flex-shrink-0">!</span>}
                <span className="truncate">{arg.event.title}</span>
                {props.subjectFocus && (
                  <span className="opacity-60 capitalize hidden sm:inline">
                    ({props.subjectFocus === 'both' ? 'M+E' : props.subjectFocus.charAt(0).toUpperCase()})
                  </span>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closePopover}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">{selectedEvent.studentName}</h3>
              <button onClick={closePopover} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-800">
                  {new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </span>
              </div>

              {selectedEvent.subjectFocus && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-800 capitalize">{selectedEvent.subjectFocus}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-500">Lesson Plan</span>
                {selectedEvent.hasPlan ? (
                  <span className="font-medium text-green-600">{selectedEvent.planTitle}</span>
                ) : (
                  <span className="font-medium text-yellow-600">Not assigned</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
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
                  Edit Plan
                </button>
              ) : (
                <button
                  onClick={() => navigate(`/manager/lesson-plans/new?studentId=${selectedEvent.studentId}&day=${selectedEvent.dayOfWeek}`)}
                  className="btn-primary flex-1 text-sm"
                >
                  Create Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
