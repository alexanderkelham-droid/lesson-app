import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import { CalendarClock, CalendarX, Check, Move, NotebookPen, Plus, Trash2, Users, X } from 'lucide-react'
import api from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { localDateKey, sortSlots, subjectLabel, sessionNumbers, toSlots } from '../../lib/dates'
import { fmtDayLong, fmtDayTime, fmtTime, todayUk, ukDateTimeInput, ukInputToIso, ukParts, ukTimeKey, ukToIso } from '../../lib/datetime'
import { rescheduleSession } from '../../lib/sessions'
import { useConfirm } from '../shared/ConfirmModal'
import CancelLessonModal from '../shared/CancelLessonModal'
import GroupDetailPanel from '../shared/GroupDetailPanel'
import GroupSessionModal from '../shared/GroupSessionModal'
import { useApplyTo } from '../shared/ApplyToDialog'

// ── UK wall-clock <-> FullCalendar ─────────────────────────────────────
// FullCalendar runs in the device's local zone. We feed it NAIVE UK
// wall-clock strings ("2026-10-07T17:40:00", no offset), so a 17:40 UK
// lesson shows at 17:40 on any device. Going back, we read the wall-clock
// FullCalendar reports (the first characters of its *Str values) and treat
// it as UK time.
const ukNaive = date => `${ukDateTimeInput(date)}:00`
const wallDate = str => String(str).slice(0, 10)                  // "YYYY-MM-DD"
const wallTime = str => (String(str).length > 10 ? String(str).slice(11, 16) : '00:00') // "HH:MM"
const wallToIso = str => ukToIso(wallDate(str), wallTime(str))

// Calendar-date maths on "YYYY-MM-DD" keys (UTC arithmetic, independent of the device zone)
function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
function dowOfKey(key) { // 0 = Mon … 6 = Sun
  const [y, m, d] = key.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return js === 0 ? 6 : js - 1
}
function datesForDay(dbDay, startKey, endKey) {
  const out = []
  let k = startKey
  while (dowOfKey(k) !== dbDay) k = addDaysKey(k, 1)
  for (; k < endKey; k = addDaysKey(k, 7)) out.push(k)
  return out
}

// Palette-only event colours (redwood / cream / stone; forest + amber for status)
const SUBJECT_COLORS = {
  maths:   { bg: '#fdf2f0', border: '#c44424', text: '#7e2614' }, // redwood
  english: { bg: '#f7f0e3', border: '#78716c', text: '#44403c' }, // cream / stone
  both:    { bg: '#ffffff', border: '#a8341a', text: '#7e2614' }, // white, redwood edge
  default: { bg: '#f5f5f4', border: '#a8a29e', text: '#44403c' }  // stone
}
SUBJECT_COLORS['11plus'] = SUBJECT_COLORS.default
SUBJECT_COLORS.other = SUBJECT_COLORS.default

const STATUS_COLORS = {
  attended: { bg: '#eaf5ee', border: '#266839', text: '#1e522d' }, // forest
  past:     { bg: '#fffbeb', border: '#d97706', text: '#92400e' }, // amber
}

const REGULAR_SWATCH = { bg: '#fafaf9', border: '#e7e5e4' }

// Group sessions (classes): cream with a forest edge, one event per class
const GROUP_COLORS = { bg: '#f7f0e3', border: '#266839', text: '#173f23' }

// Component-scoped FullCalendar styling (serif title, tidy regular-slot rows)
const CALENDAR_CSS = `
.redwood-calendar .fc .fc-toolbar-title {
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.redwood-calendar .fc .fc-daygrid-event.fc-regular-slot {
  background: #fafaf9;
  border: 1px dashed #d6d3d1 !important;
  color: #78716c;
  margin-top: 2px;
}
.redwood-calendar .fc .fc-daygrid-event.fc-regular-slot:hover {
  background: #f5f5f4;
}
.redwood-calendar .fc .fc-event.fc-group-event {
  border-left-width: 3px !important;
}
.redwood-calendar .fc .fc-daygrid-day-top {
  position: relative;
  z-index: 3;
}
`

const fmtWhen = fmtDayTime

export default function CalendarView({ students, plans, refreshKey = 0 }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [sessions, setSessions] = useState([])
  const [range, setRange] = useState(null)        // { startKey, endKey, viewType } (UK date keys)
  const [editSession, setEditSession] = useState(null) // { id, scheduledAt, durationMins, notes }
  const [savingEdit, setSavingEdit] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [message, setMessage] = useState(null)     // { kind: 'error' | 'ok', text }
  const [groups, setGroups] = useState([])
  const [openGroupId, setOpenGroupId] = useState(null)
  const [createAt, setCreateAt] = useState(null)   // { date, time? } for the new-group dialog
  const [confirm, confirmModal] = useConfirm()
  const [askApplyTo, applyToDialog] = useApplyTo()
  const lastRangeKey = useRef('')

  // Fetch sessions + group sessions for the visible range
  const loadSessions = useCallback(async (r = range) => {
    if (!r) return
    const q = `from=${encodeURIComponent(ukToIso(r.startKey))}&to=${encodeURIComponent(ukToIso(r.endKey))}`
    const [sRes, gRes] = await Promise.allSettled([api.get(`/sessions?${q}`), api.get(`/groups?${q}`)])
    if (sRes.status === 'fulfilled') setSessions(sRes.value.data)
    if (gRes.status === 'fulfilled') setGroups(gRes.value.data)
  }, [range])

  useEffect(() => { loadSessions() }, [loadSessions, refreshKey])

  function handleDatesSet(info) {
    const startKey = wallDate(info.startStr)
    const endKey = wallDate(info.endStr)
    const key = `${startKey}|${endKey}|${info.view.type}`
    if (key === lastRangeKey.current) return
    lastRangeKey.current = key
    setRange({ startKey, endKey, viewType: info.view.type })
  }

  // Escape closes the popover / edit dialog (the confirm & cancel dialogs handle their own)
  useEffect(() => {
    if (!selectedEvent && !editSession) return
    const onKey = e => {
      if (e.key !== 'Escape' || cancelling) return
      if (editSession && !savingEdit) setEditSession(null)
      else if (selectedEvent) setSelectedEvent(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedEvent, editSession, savingEdit, cancelling])

  const isMonth = !range || range.viewType === 'dayGridMonth'

  // Events: real sessions, plus (month view only) one muted "Regular: …" row
  // per day for students whose regular lesson day has no session yet
  const events = useMemo(() => {
    const evts = []

    groups.forEach(g => {
      const startMs = new Date(g.scheduledAt).getTime()
      const count = g.members?.length || 0
      const allAttended = count > 0 && g.members.every(m => m.attendedAt)
      evts.push({
        id: `group-${g.id}`,
        title: `${g.title} · ${count}`,
        start: ukNaive(startMs),
        end: ukNaive(startMs + (g.durationMins || 60) * 60000),
        classNames: ['fc-group-event'],
        backgroundColor: allAttended ? STATUS_COLORS.attended.bg : GROUP_COLORS.bg,
        borderColor: GROUP_COLORS.border,
        textColor: GROUP_COLORS.text,
        editable: !allAttended,
        durationEditable: false,
        extendedProps: { kind: 'group', order: 0, groupId: g.id, seriesId: g.seriesId, title: g.title, count },
      })
    })

    const numbers = sessionNumbers(sessions.filter(s => !s.groupSessionId))
    sessions.forEach(s => {
      if (s.groupSessionId) return // shown as part of its group
      const student = s.lessonPlan?.student
      const colors = SUBJECT_COLORS[s.subject || student?.subjectFocus] || SUBJECT_COLORS.default
      const attended = !!s.attendedAt
      const past = !attended && new Date(s.scheduledAt) < new Date()
      const subject = subjectLabel(s.subject)
      const sessionLabel = numbers.get(s.id) || null
      const startMs = new Date(s.scheduledAt).getTime()

      evts.push({
        id: `session-${s.id}`,
        title: [student?.name || 'Lesson', subject, sessionLabel].filter(Boolean).join(' · '),
        start: ukNaive(startMs),
        end: ukNaive(startMs + (s.durationMins || 60) * 60000),
        backgroundColor: attended ? STATUS_COLORS.attended.bg : past ? STATUS_COLORS.past.bg : colors.bg,
        borderColor:     attended ? STATUS_COLORS.attended.border : past ? STATUS_COLORS.past.border : colors.border,
        textColor:       attended ? STATUS_COLORS.attended.text : past ? STATUS_COLORS.past.text : colors.text,
        editable: !attended,
        durationEditable: false,
        extendedProps: {
          kind: 'session',
          order: 0,
          sessionId: s.id,
          studentId: student?.id,
          studentName: student?.name,
          tutorName: s.lessonPlan?.tutor?.name,
          planTitle: s.lessonPlan?.title,
          planId: s.lessonPlan?.id,
          subjectFocus: student?.subjectFocus,
          subject: s.subject || null,
          sessionLabel,
          scheduledAt: s.scheduledAt,
          attended,
          past,
          notes: s.notes,
          durationMins: s.durationMins,
        }
      })
    })

    if (!isMonth || !range) return evts

    // Real sessions by student + UK day, to see which regular slots are covered
    const byStudentDay = new Map()
    sessions.forEach(s => {
      const k = `${s.lessonPlan?.studentId}|${localDateKey(s.scheduledAt)}`
      if (!byStudentDay.has(k)) byStudentDay.set(k, [])
      byStudentDay.get(k).push(s)
    })
    const todayKey = todayUk()
    const byDay = {} // dateKey -> [{ student, dbDay, slot, plan }]
    students.forEach(student => {
      // Prefer the full weekly slots (day + time + subject); fall back to bare days
      const slots = sortSlots(student.slots?.length ? student.slots : toSlots(student.lessonDays))
      slots.forEach(slot => {
        const dbDay = slot.dayOfWeek
        datesForDay(dbDay, range.startKey, range.endKey).forEach(key => {
          if (key < todayKey) return // only upcoming days need a session
          const existing = byStudentDay.get(`${student.id}|${key}`) || []
          const covered = existing.some(s =>
            (slot.id != null && s.slotId === slot.id) ||
            (slot.time ? ukTimeKey(s.scheduledAt) === slot.time : true))
          if (covered) return
          const plan = plans.find(p => p.studentId === student.id && p.status === 'active' && (p.lessonDayOfWeek === dbDay || p.lessonDayOfWeek == null))
            || plans.find(p => p.studentId === student.id && p.status === 'active')
          ;(byDay[key] ||= []).push({ student, dbDay, slot, plan })
        })
      })
    })
    Object.entries(byDay).forEach(([key, slots]) => {
      slots.sort((a, b) => String(a.slot.time || '99').localeCompare(String(b.slot.time || '99')) || a.student.name.localeCompare(b.student.name))
      const names = slots.map(x => [x.student.name.split(' ')[0], x.slot.time, subjectLabel(x.slot.subject)].filter(Boolean).join(' '))
      evts.push({
        id: `regular-${key}`,
        title: `Regular: ${names.join(', ')}`,
        start: key,
        allDay: true,
        editable: false,
        classNames: ['fc-regular-slot'],
        backgroundColor: REGULAR_SWATCH.bg,
        borderColor: REGULAR_SWATCH.border,
        textColor: '#78716c',
        extendedProps: { kind: 'regular', order: 1, slots, date: key }
      })
    })

    return evts
  }, [students, plans, sessions, groups, isMonth, range])

  // Week/day views show 07:00-22:00, widened only if a lesson falls outside
  const { slotMin, slotMax } = useMemo(() => {
    let min = 7, max = 22
    ;[...sessions, ...groups].forEach(x => {
      const p = ukParts(x.scheduledAt)
      const start = p.hour
      const end = Math.ceil(start + p.minute / 60 + (x.durationMins || 60) / 60)
      min = Math.min(min, start)
      max = Math.max(max, Math.min(24, end))
    })
    const pad = n => `${String(n).padStart(2, '0')}:00:00`
    return { slotMin: pad(min), slotMax: pad(max) }
  }, [sessions, groups])

  function renderEventContent(arg) {
    const p = arg.event.extendedProps
    if (p.kind === 'regular') {
      return (
        <div className="px-1 text-[11px] leading-4 truncate" title={arg.event.title}>
          {arg.event.title}
        </div>
      )
    }
    if (p.kind === 'group') {
      return (
        <div className="flex items-center gap-1 px-1 min-w-0 overflow-hidden text-xs leading-5" title={`Group session: ${p.title}, ${p.count} student${p.count === 1 ? '' : 's'}`}>
          <Users className="w-3 h-3 flex-shrink-0" aria-hidden />
          {arg.timeText && <span className="font-semibold tabular-nums flex-shrink-0">{arg.timeText}</span>}
          <span className="truncate font-medium">{arg.event.title}</span>
        </div>
      )
    }
    return (
      <div className="flex gap-1 px-1 min-w-0 overflow-hidden text-xs leading-5">
        {arg.timeText && <span className="font-semibold tabular-nums flex-shrink-0">{arg.timeText}</span>}
        <span className="truncate">{arg.event.title}</span>
      </div>
    )
  }

  function handleEventClick(info) {
    const p = info.event.extendedProps
    if (p.kind === 'group') { setOpenGroupId(p.groupId); return }
    setSelectedEvent({ ...p, date: p.kind === 'regular' ? p.date : p.scheduledAt })
  }

  async function handleEventDrop(info) {
    const props = info.event.extendedProps
    if (props.kind === 'group') {
      await moveGroup(info, props)
      return
    }
    if (props.kind !== 'session') {
      info.revert()
      return
    }
    setMessage(null)
    try {
      const res = await rescheduleSession(props.sessionId, wallToIso(info.event.startStr), {}, confirm)
      if (!res) { info.revert(); return }
      if (res.merged) setMessage({ kind: 'ok', text: `${props.studentName}'s lessons were merged into ${fmtWhen(res.scheduledAt)}.` })
      await loadSessions()
    } catch (e) {
      info.revert()
      setMessage({ kind: 'error', text: e.response?.data?.error || 'Failed to reschedule' })
    }
  }

  // Drag a class: every student's lesson (and their planned work) moves with it
  async function moveGroup(info, props) {
    setMessage(null)
    let applyTo = 'this'
    const newIso = wallToIso(info.event.startStr)
    if (props.seriesId) {
      applyTo = await askApplyTo({
        title: 'Move group session',
        message: `Move ${props.title} to ${fmtWhen(newIso)}?`,
        confirmLabel: 'Move',
      })
      if (!applyTo) { info.revert(); return }
    }
    try {
      const res = await api.put(`/groups/${props.groupId}`, { scheduledAt: newIso, applyTo })
      setMessage({ kind: 'ok', text: res.data?.updated > 1
        ? `${props.title} moved, with ${res.data.updated - 1} following session${res.data.updated === 2 ? '' : 's'}.`
        : `${props.title} moved to ${fmtWhen(newIso)}.` })
      await loadSessions()
    } catch (e) {
      info.revert()
      setMessage({ kind: 'error', text: e.response?.data?.error || 'Failed to move the group session' })
    }
  }

  // Clicking an empty day (month) or slot (week/day) starts a new group session there
  function handleDateClick(info) {
    // dateStr is the clicked wall-clock, which the calendar shows as UK time
    setCreateAt({
      date: wallDate(info.dateStr),
      time: info.allDay ? undefined : wallTime(info.dateStr),
    })
  }

  function openEditFromSelected() {
    if (selectedEvent?.kind !== 'session') return
    const s = sessions.find(x => x.id === selectedEvent.sessionId)
    if (!s) return
    setEditSession({
      id: s.id,
      studentName: selectedEvent.studentName,
      scheduledAt: ukDateTimeInput(s.scheduledAt), // UK wall-clock for the input
      durationMins: s.durationMins || 60,
      notes: s.notes || ''
    })
    setSelectedEvent(null)
  }

  async function saveEdit() {
    if (!editSession) return
    setSavingEdit(true)
    setMessage(null)
    try {
      const res = await rescheduleSession(editSession.id, ukInputToIso(editSession.scheduledAt), {
        durationMins: editSession.durationMins ? parseInt(editSession.durationMins) : null,
        notes: editSession.notes || null
      }, confirm)
      if (!res) return // kept as it was: leave the dialog open
      if (res.merged) setMessage({ kind: 'ok', text: `${editSession.studentName}'s lessons were merged into ${fmtWhen(res.scheduledAt)}.` })
      setEditSession(null)
      await loadSessions()
    } catch (e) {
      setMessage({ kind: 'error', text: e.response?.data?.error || 'Failed to save' })
      setEditSession(null)
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteSession(id) {
    const ok = await confirm({
      title: 'Delete this session?',
      message: 'Any planned work in it goes back to unscheduled.',
      confirmLabel: 'Delete session',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/sessions/${id}`)
      setSelectedEvent(null)
      setEditSession(null)
      await loadSessions()
    } catch (e) {
      setMessage({ kind: 'error', text: e.response?.data?.error || 'Failed to delete' })
    }
  }

  function startCancel() {
    const s = sessions.find(x => x.id === selectedEvent?.sessionId)
    if (!s) return
    setCancelling(s)
    setSelectedEvent(null)
  }

  return (
    <div className="relative redwood-calendar">
      <style>{CALENDAR_CSS}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500">All times are UK time. Click an empty day to add a group session there.</p>
        <button onClick={() => setCreateAt({ date: todayUk() })} className="btn-secondary btn-sm">
          <Users className="icon-sm" aria-hidden /> New group session
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs">
        {[
          { label: 'Group session', swatch: GROUP_COLORS, thick: true },
          { label: 'Maths session', swatch: SUBJECT_COLORS.maths },
          { label: 'English session', swatch: SUBJECT_COLORS.english },
          { label: 'Attended', swatch: STATUS_COLORS.attended },
          { label: 'Past, no record', swatch: STATUS_COLORS.past },
          { label: 'Regular lesson, no session yet (month view)', swatch: REGULAR_SWATCH, dashed: true },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm border ${l.dashed ? 'border-dashed' : ''} ${l.thick ? 'border-l-[3px]' : ''}`} style={{ backgroundColor: l.swatch.bg, borderColor: l.dashed ? '#a8a29e' : l.swatch.border }} aria-hidden />
            <span className="text-gray-600">{l.label}</span>
          </div>
        ))}
        <span className="inline-flex items-center gap-1 text-gray-500 sm:ml-auto">
          <Move className="icon-sm" aria-hidden /> Drag a session or group to reschedule
        </span>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm rounded-lg px-3 py-2 mb-3 border ${message.kind === 'error' ? 'text-red-700 bg-red-50 border-red-100' : 'text-forest-700 bg-forest-50 border-forest-100'}`}
        >
          {message.text}
        </p>
      )}

      <div className="card p-2 sm:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={enGbLocale}
          initialView="dayGridMonth"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          nextDayThreshold="06:00:00"
          scrollTime="08:00:00"
          slotMinTime={slotMin}
          slotMaxTime={slotMax}
          allDaySlot={false}
          events={events}
          eventOrder="order,start,title"
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          dateClick={handleDateClick}
          datesSet={handleDatesSet}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => setSelectedEvent(null)}>
          <div role="dialog" aria-modal="true" aria-label={selectedEvent.kind === 'regular' ? 'Regular lessons' : `Session with ${selectedEvent.studentName}`} className="modal-panel w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="eyebrow">{selectedEvent.kind === 'session' ? 'Session' : 'Regular lesson day'}</p>
                <h3 className="section-title truncate">
                  {selectedEvent.kind === 'session'
                    ? selectedEvent.studentName
                    : fmtDayLong(ukToIso(selectedEvent.date, '12:00'))}
                </h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="btn-ghost -mr-2 -mt-1" aria-label="Close" title="Close">
                <X className="icon" aria-hidden />
              </button>
            </div>

            {selectedEvent.kind === 'regular' ? (
              <>
                <p className="text-sm text-gray-600 mb-3">No session has been created yet for these regular lessons.</p>
                <ul className="divide-y divide-gray-100 border-y border-gray-100">
                  {selectedEvent.slots.map(({ student, dbDay, slot, plan }, i) => (
                    <li key={`${student.id}-${slot.id ?? i}`} className="py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {student.name}
                          {(slot.time || slot.subject) && (
                            <span className="font-normal text-gray-600 tabular-nums"> · {[slot.time, subjectLabel(slot.subject)].filter(Boolean).join(' ')}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{plan ? plan.title : 'No active plan for this day'}</p>
                      </div>
                      <button onClick={() => navigate(`${basePath}/students/${student.id}`)} className="btn-ghost btn-sm" aria-label={`View ${student.name}`}>
                        View
                      </button>
                      {plan ? (
                        <button onClick={() => navigate(`${basePath}/lesson-plans/${plan.id}/builder`)} className="btn-secondary btn-sm" aria-label={`Plan ${student.name}'s lesson`}>
                          Plan
                        </button>
                      ) : (
                        <button onClick={() => navigate(`${basePath}/lesson-plans/new?studentId=${student.id}&day=${dbDay}`)} className="btn-secondary btn-sm" aria-label={`Create a plan for ${student.name}`}>
                          <Plus className="icon-sm" aria-hidden /> Create plan
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <dl className="divide-y divide-gray-100 text-sm border-y border-gray-100">
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-gray-500">Date</dt>
                    <dd className="font-medium text-gray-900 text-right">
                      {fmtDayLong(selectedEvent.date)}
                      <span className="block text-xs font-normal text-gray-500">
                        {fmtTime(selectedEvent.date)} UK
                        {selectedEvent.durationMins ? ` · ${selectedEvent.durationMins} min` : ''}
                      </span>
                    </dd>
                  </div>

                  {(selectedEvent.subject || selectedEvent.subjectFocus) && (
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-500">Subject</dt>
                      <dd className="font-medium text-gray-900 capitalize">
                        {selectedEvent.subject ? subjectLabel(selectedEvent.subject) : selectedEvent.subjectFocus}
                        {selectedEvent.sessionLabel && <span className="font-normal text-gray-500"> · {selectedEvent.sessionLabel}</span>}
                      </dd>
                    </div>
                  )}
                  {selectedEvent.tutorName && (
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-500">Tutor</dt>
                      <dd className="font-medium text-gray-900">{selectedEvent.tutorName}</dd>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-4 py-2.5">
                    <dt className="text-gray-500">Status</dt>
                    <dd>
                      {selectedEvent.attended ? (
                        <span className="badge-success"><Check className="icon-sm" aria-hidden /> Attended</span>
                      ) : selectedEvent.past ? (
                        <span className="badge-warning">No record</span>
                      ) : (
                        <span className="badge">Scheduled</span>
                      )}
                    </dd>
                  </div>
                  {selectedEvent.notes && (
                    <div className="py-2.5">
                      <dt className="text-gray-500 text-xs mb-1">Notes</dt>
                      <dd className="text-xs text-gray-700 italic whitespace-pre-wrap">{selectedEvent.notes}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-gray-500">Lesson plan</dt>
                    <dd className="font-medium text-gray-900 text-right">{selectedEvent.planTitle}</dd>
                  </div>
                </dl>

                <div className="flex gap-2 mt-5 flex-wrap">
                  {!selectedEvent.attended && (
                    <button onClick={openEditFromSelected} className="btn-primary flex-1">
                      <CalendarClock className="icon" aria-hidden /> Reschedule
                    </button>
                  )}
                  {!selectedEvent.attended && selectedEvent.planId && (
                    <button
                      onClick={() => navigate(`${basePath}/lesson-plans/${selectedEvent.planId}/builder?session=${selectedEvent.sessionId}`)}
                      className="btn-secondary flex-1"
                    >
                      <NotebookPen className="icon" aria-hidden /> Plan
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`${basePath}/lesson-plans/${selectedEvent.planId}/live`)}
                    className="btn-secondary flex-1"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteSession(selectedEvent.sessionId)}
                    className="btn-danger px-3"
                    aria-label={`Delete ${selectedEvent.studentName}'s session`}
                    title="Delete session"
                  >
                    <Trash2 className="icon" aria-hidden />
                  </button>
                  {!selectedEvent.attended && (
                    <button onClick={startCancel} className="btn-secondary w-full">
                      <CalendarX className="icon" aria-hidden /> Cancel lesson
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reschedule edit modal */}
      {editSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !savingEdit && setEditSession(null)}>
          <div role="dialog" aria-modal="true" aria-label="Reschedule session" className="modal-panel w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-4">Reschedule session</h3>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="cal-edit-when">Date and time (UK)</label>
                <input
                  id="cal-edit-when"
                  type="datetime-local"
                  value={editSession.scheduledAt}
                  onChange={e => setEditSession({ ...editSession, scheduledAt: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="cal-edit-duration">Duration (mins)</label>
                <input
                  id="cal-edit-duration"
                  type="number"
                  value={editSession.durationMins}
                  onChange={e => setEditSession({ ...editSession, durationMins: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="cal-edit-notes">Notes</label>
                <textarea
                  id="cal-edit-notes"
                  value={editSession.notes}
                  onChange={e => setEditSession({ ...editSession, notes: e.target.value })}
                  rows={2}
                  className="input resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditSession(null)} className="btn-secondary flex-1" disabled={savingEdit}>Cancel</button>
              <button onClick={saveEdit} className="btn-primary flex-1" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelling && (
        <CancelLessonModal
          session={cancelling}
          itemCount={(cancelling.items || []).filter(i => i.status !== 'completed').length}
          onClose={() => setCancelling(null)}
          onDone={r => {
            setMessage({ kind: 'ok', text: r?.moved
              ? `Lesson cancelled. ${r.moved} item${r.moved === 1 ? '' : 's'} moved ${r.movedTo ? `to ${fmtWhen(r.movedTo.scheduledAt)}` : 'to unscheduled'}.`
              : 'Lesson cancelled.' })
            loadSessions()
          }}
        />
      )}
      {openGroupId && (
        <GroupDetailPanel
          groupId={openGroupId}
          onClose={() => setOpenGroupId(null)}
          onChanged={() => loadSessions()}
        />
      )}
      {createAt && (
        <GroupSessionModal
          defaultDate={createAt.date}
          defaultTime={createAt.time}
          onClose={() => setCreateAt(null)}
          onSaved={r => {
            setCreateAt(null)
            setMessage({ kind: 'ok', text: r?.occurrences > 1 ? `${r.title} created: ${r.occurrences} weekly sessions.` : `${r?.title || 'Group session'} created.` })
            loadSessions()
          }}
        />
      )}
      {confirmModal}
      {applyToDialog}
    </div>
  )
}
