import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ArrowRight, CalendarDays, CalendarPlus, CalendarX, Check, ClipboardCheck, FileText, MapPin, Play, Printer, StickyNote, Users } from 'lucide-react'
import api from '../../lib/api'
import { printPlanUrl, openInNewTab, downloadOriginalsPack } from '../../lib/print'
import { localDateKey } from '../../lib/dates'
import { carryOverSession } from '../../lib/sessions'
import CancelLessonModal from './CancelLessonModal'
import GroupDetailPanel, { GroupRegisterDialog, formatGroupWhen } from './GroupDetailPanel'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Today view shared by manager and tutor.
// Shows scheduled sessions today + students with no scheduled session who are
// due today based on their lessonDays (gap-fill).
export default function TodayView({ refreshKey = 0 }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const basePath = user?.role === 'tutor' ? '/tutor' : '/manager'

  const [sessions, setSessions] = useState([])
  const [students, setStudents] = useState([])
  const [plans, setPlans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [printDate, setPrintDate] = useState(() => localDateKey())
  const [printing, setPrinting]   = useState(false)
  const [printInfo, setPrintInfo] = useState('')
  const [printWarn, setPrintWarn] = useState('')
  const [printSessions, setPrintSessions] = useState(null) // lessons on printDate
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [rowMsg, setRowMsg] = useState({}) // sessionId -> message
  const [busyId, setBusyId] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [groups, setGroups] = useState([])
  const [printGroups, setPrintGroups] = useState(null) // groups on printDate
  const [openGroupId, setOpenGroupId] = useState(null)
  const [registerGroup, setRegisterGroup] = useState(null)
  const [groupMsg, setGroupMsg] = useState({}) // groupId -> message

  // Which lessons the print run's date contains
  useEffect(() => {
    let stale = false
    setPrintSessions(null)
    setPrintGroups(null)
    setPrintInfo('')
    setPrintWarn('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(printDate)) return
    api.get(`/sessions?date=${printDate}`)
      .then(r => { if (!stale) setPrintSessions(r.data || []) })
      .catch(() => { if (!stale) setPrintSessions([]) })
    api.get(`/groups?date=${printDate}`)
      .then(r => { if (!stale) setPrintGroups(r.data || []) })
      .catch(() => { if (!stale) setPrintGroups([]) })
    return () => { stale = true }
  }, [printDate, sessions, groups])

  async function printRun() {
    setPrinting(true)
    setPrintInfo('')
    setPrintWarn('')
    const summary = await downloadOriginalsPack(`/sessions/originals?date=${printDate}`, { quiet: true })
    setPrinting(false)
    if (summary?.error) setPrintWarn(summary.error)
    else if (summary?.empty) setPrintWarn('None of these lessons has sheets with an original PDF.')
    else if (summary) {
      const missing = Array.isArray(summary.missing) ? summary.missing.length : summary.missing || 0
      setPrintInfo(`${summary.included} sheets · ${summary.pages} pages${missing ? ` · ${missing} without an original (listed on the cover pages)` : ''}`)
    }
  }

  async function printOriginals(session) {
    setRowMsg(m => ({ ...m, [session.id]: '' }))
    const summary = await downloadOriginalsPack(`/lesson-plans/${session.lessonPlan.id}/originals?session=${session.id}`, { quiet: true })
    if (summary?.error) setRowMsg(m => ({ ...m, [session.id]: summary.error }))
    else if (summary?.empty) setRowMsg(m => ({ ...m, [session.id]: 'This lesson has no sheets with an original PDF.' }))
  }

  async function printGroupOriginals(group) {
    setGroupMsg(m => ({ ...m, [group.id]: '' }))
    const summary = await downloadOriginalsPack(`/groups/${group.id}/originals`, { quiet: true })
    if (summary?.error) setGroupMsg(m => ({ ...m, [group.id]: summary.error }))
    else if (summary?.empty) setGroupMsg(m => ({ ...m, [group.id]: 'None of these students has sheets with an original PDF in this lesson.' }))
  }

  async function carryOver(session) {
    setBusyId(session.id)
    setActionError('')
    setNotice('')
    try {
      const r = await carryOverSession(session.id)
      setNotice(r.carriedOver > 0
        ? `${r.carriedOver} unfinished item${r.carriedOver === 1 ? '' : 's'} from ${session.lessonPlan?.student?.name || 'this lesson'} copied into the next lesson.`
        : 'Nothing to move: that work is already done or already carried over.')
      load({ quiet: true })
    } catch (e) {
      setActionError(e.response?.data?.error || 'Could not move the work')
    } finally {
      setBusyId(null)
    }
  }

  const today = new Date()
  const todayDayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1 // 0=Mon..6=Sun
  const dayLabel = DAY_NAMES[today.getDay()]
  const dateLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setError('')
    Promise.all([
      api.get(`/sessions?date=${todayISO()}`),
      api.get('/users/students'),
      api.get('/lesson-plans'),
      api.get(`/groups?date=${todayISO()}`).catch(() => ({ data: [] }))
    ])
      .then(([sRes, stRes, pRes, gRes]) => {
        setSessions(sRes.data)
        setStudents(stRes.data)
        setPlans(pRes.data)
        setGroups(gRes.data || [])
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load today\'s schedule'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load({ quiet: refreshKey > 0 }) }, [refreshKey])

  if (loading) return <p className="text-sm text-gray-500">Loading today's schedule…</p>
  if (error) return (
    <div className="card text-center">
      <p className="text-red-700 mb-3">{error}</p>
      <button onClick={load} className="btn-primary">Retry</button>
    </div>
  )

  // Students whose lessonDays include today AND who have an active plan tied to today
  // AND don't already have a session record for today
  const sessionPlanIds = new Set(sessions.map(s => s.lessonPlanId))
  const expectedToday = students.filter(s => (s.lessonDays || []).includes(todayDayOfWeek))
  const expectedNotScheduled = expectedToday
    .map(s => {
      const plan = plans.find(p => p.studentId === s.id && p.status === 'active' && p.lessonDayOfWeek === todayDayOfWeek)
      return plan && !sessionPlanIds.has(plan.id) ? { student: s, plan } : null
    })
    .filter(Boolean)

  // Lessons that belong to a group are shown on the group's card
  const individual = sessions.filter(s => !s.groupSessionId)

  async function quickCreateSession(plan) {
    const now = new Date()
    const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString()
    try {
      await api.post('/sessions', { lessonPlanId: plan.id, scheduledAt })
      load({ quiet: true })
    } catch (e) {
      setActionError(e.response?.data?.error || 'Failed to create session')
    }
  }

  async function markAttended(session) {
    try {
      await api.put(`/sessions/${session.id}`, { markAttended: true })
      load({ quiet: true })
    } catch (e) {
      setActionError(e.response?.data?.error || 'Failed to update')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Today</p>
          <h2 className="page-title">{dayLabel}</h2>
          <p className="text-sm text-gray-500">{dateLabel}</p>
        </div>
        {/* Mass print: every lesson's original worksheets for a day, in one PDF */}
        <div className="card p-3 flex flex-wrap items-center gap-2 max-w-md">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Printer className="icon text-gray-500" aria-hidden /> Print run
          </span>
          <input type="date" value={printDate} onChange={e => setPrintDate(e.target.value)} className="input w-auto text-sm py-1" aria-label="Day to print" />
          <button
            onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setPrintDate(localDateKey(d)) }}
            className="btn-ghost btn-sm"
          >
            Tomorrow
          </button>
          <button
            onClick={printRun}
            disabled={printing || (printSessions?.length === 0 && printGroups?.length === 0)}
            className="btn-primary btn-sm"
            title="One PDF of the original worksheets for every lesson that day, each with a cover page"
          >
            {printing ? 'Building…' : 'Print all originals'}
          </button>
          <p className="w-full text-xs text-gray-600">
            {printSessions === null || printGroups === null
              ? 'Checking lessons…'
              : printSessions.length === 0 && printGroups.length === 0
                ? 'No lessons on this day.'
                : (() => {
                    const lessons = [
                      ...printGroups.map(g => ({ at: g.scheduledAt, label: `${formatTime(g.scheduledAt)} ${g.title} (group of ${g.members.length})` })),
                      ...printSessions.filter(ps => !ps.groupSessionId).map(ps => ({ at: ps.scheduledAt, label: `${formatTime(ps.scheduledAt)} ${ps.lessonPlan?.student?.name || 'Lesson'}` })),
                    ].sort((a, b) => new Date(a.at) - new Date(b.at))
                    return <>{lessons.length} lesson{lessons.length === 1 ? '' : 's'}: {lessons.map(l => l.label).join(', ')}</>
                  })()}
          </p>
          <p className="w-full text-xs text-gray-500">Prints the original PDF worksheets (not the digital versions), with a cover page per lesson.</p>
          {printInfo && <p className="w-full text-xs text-gray-500" role="status">{printInfo}</p>}
          {printWarn && <p className="w-full text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1.5" role="alert">{printWarn}</p>}
        </div>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{actionError}</p>}
      {notice && <p role="status" className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 mb-3 flex items-start gap-2"><Check className="icon mt-0.5" aria-hidden /><span>{notice}</span></p>}

      {/* Scheduled sessions */}
      {individual.length === 0 && groups.length === 0 && expectedNotScheduled.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <CalendarDays className="icon-lg" aria-hidden />
          </div>
          <p className="font-medium text-gray-900">No lessons today</p>
          <p className="text-sm text-gray-500 mt-1">Enjoy the day off, or use it to plan ahead.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const when = formatGroupWhen(group)
            const count = group.members.length
            const present = group.members.filter(m => m.attendedAt).length
            const started = new Date(group.scheduledAt) < new Date()
            return (
              <div key={`g-${group.id}`} className="card flex flex-col sm:flex-row sm:items-center gap-4 p-4 border-l-[3px] border-l-forest-600">
                <div className="flex-shrink-0 sm:w-16 sm:text-center sm:border-r sm:border-gray-100 sm:pr-4">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">{when.start}</p>
                  <p className="text-xs text-gray-500">{group.durationMins} min</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Users className="icon text-forest-700" aria-hidden />
                    <p className="font-semibold text-gray-900">{group.title}</p>
                    <span className="badge">Group · {count} student{count === 1 ? '' : 's'}</span>
                    {count > 0 && present === count && <span className="badge-success"><Check className="icon-sm" aria-hidden />All present</span>}
                    {count > 0 && present > 0 && present < count && <span className="badge-warning">{present} of {count} present</span>}
                    {count > 0 && present === 0 && started && <span className="badge-warning">No register yet</span>}
                  </div>
                  <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                    {group.tutor?.name && <span>with {group.tutor.name}</span>}
                    {group.location && <span className="inline-flex items-center gap-0.5"><MapPin className="icon-sm" aria-hidden />{group.location}</span>}
                  </p>
                  {count > 0 && (
                    <ul className="flex flex-wrap gap-1.5 mt-1.5" aria-label="Students and attendance">
                      {group.members.map(m => (
                        <li key={m.student.id} className={m.attendedAt ? 'badge-success' : 'badge'} title={m.attendedAt ? 'Present' : 'Not marked present'}>
                          {m.attendedAt && <Check className="icon-sm" aria-hidden />}
                          {m.student.name}
                          <span className="sr-only">{m.attendedAt ? ', present' : ', not marked present'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {groupMsg[group.id] && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1 mt-1.5 inline-block" role="alert">{groupMsg[group.id]}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <button onClick={() => setOpenGroupId(group.id)} className="btn-primary btn-sm">Open</button>
                  <button onClick={() => setRegisterGroup(group)} disabled={count === 0} className="btn-secondary btn-sm">
                    <ClipboardCheck className="icon-sm" aria-hidden /> Register
                  </button>
                  <button
                    onClick={() => printGroupOriginals(group)}
                    disabled={count === 0}
                    className="btn-secondary btn-sm"
                    title="Original worksheets for every student in this class, one PDF with a cover page per child"
                  >
                    <FileText className="icon-sm" aria-hidden /> Originals
                  </button>
                </div>
              </div>
            )
          })}

          {individual.map(session => {
            const studentName = session.lessonPlan?.student?.name
            const tutorName = session.lessonPlan?.tutor?.name
            const isAttended = !!session.attendedAt
            const isMissed = !isAttended && new Date(session.scheduledAt) < new Date()
            const unfinished = (session.items || []).filter(i => i.status !== 'completed').length

            return (
              <div
                key={session.id}
                className={`card flex flex-col sm:flex-row sm:items-center gap-4 p-4 ${
                  isAttended ? 'border-forest-100' : isMissed ? 'border-amber-200' : ''
                }`}
              >
                <div className="flex-shrink-0 sm:w-16 sm:text-center sm:border-r sm:border-gray-100 sm:pr-4">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatTime(session.scheduledAt).split(':')[0]}:{formatTime(session.scheduledAt).split(':')[1]}</p>
                  {session.durationMins && (
                    <p className="text-xs text-gray-500">{session.durationMins} min</p>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900">{studentName}</p>
                    {session.lessonPlan?.student?.subjectFocus && (
                      <span className="badge capitalize">
                        {session.lessonPlan.student.subjectFocus}
                      </span>
                    )}
                    {isAttended && <span className="badge-success"><Check className="icon-sm" aria-hidden />Attended</span>}
                    {isMissed && <span className="badge-warning">No record yet</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {session.lessonPlan?.title}
                    {user?.role === 'manager' && tutorName && <span className="text-gray-400"> · with {tutorName}</span>}
                  </p>
                  {session.notes && (
                    <p className="text-xs text-gray-600 mt-1 italic line-clamp-2 flex items-start gap-1">
                      <StickyNote className="icon-sm mt-0.5 text-gray-400 not-italic" aria-hidden />
                      <span>{session.notes}</span>
                    </p>
                  )}
                  {rowMsg[session.id] && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1 mt-1.5 inline-block" role="alert">{rowMsg[session.id]}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {!isAttended && (
                    <button
                      onClick={() => navigate(`${basePath}/lesson-plans/${session.lessonPlan.id}/live`)}
                      className="btn-primary btn-sm"
                    >
                      <Play className="icon-sm" aria-hidden />
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`${basePath}/students/${session.lessonPlan.studentId}`)}
                    className="btn-secondary btn-sm"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => openInNewTab(printPlanUrl(session.lessonPlan.id, { session: session.id }))}
                    className="btn-secondary btn-sm"
                    title="Print this lesson's sheets"
                  >
                    <Printer className="icon-sm" aria-hidden /> Print
                  </button>
                  <button
                    onClick={() => printOriginals(session)}
                    className="btn-secondary btn-sm"
                    title="Original scanned worksheets for this lesson, as one PDF"
                  >
                    <FileText className="icon-sm" aria-hidden /> Originals
                  </button>
                  {isMissed && unfinished > 0 && (
                    <button
                      onClick={() => carryOver(session)}
                      disabled={busyId === session.id}
                      className="btn-secondary btn-sm"
                      title="Copy this lesson's unfinished work into the next lesson"
                    >
                      <ArrowRight className="icon-sm" aria-hidden /> {busyId === session.id ? 'Moving…' : 'Move work to next lesson'}
                    </button>
                  )}
                  {!isAttended && !isMissed && (
                    <button
                      onClick={() => setCancelling(session)}
                      className="btn-ghost btn-sm"
                      aria-label={`Cancel ${studentName ? `${studentName}'s` : 'this'} lesson`}
                    >
                      <CalendarX className="icon-sm" aria-hidden /> Cancel lesson
                    </button>
                  )}
                  {!isAttended && (
                    <button
                      onClick={() => markAttended(session)}
                      className="btn btn-sm bg-white text-forest-700 border border-forest-100 hover:bg-forest-50"
                    >
                      <Check className="icon-sm" aria-hidden /> Mark attended
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Expected-but-not-scheduled */}
          {expectedNotScheduled.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow mb-2">
                Scheduled by lesson day · no session created yet
              </p>
              <div className="space-y-2">
                {expectedNotScheduled.map(({ student, plan }) => (
                  <div key={plan.id} className="card-muted p-4 flex items-center gap-3">
                    <div className="w-9 h-9 bg-redwood-50 text-redwood-700 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{student.name}</p>
                      <p className="text-xs text-gray-500 truncate">{plan.title} · expected today</p>
                    </div>
                    <button
                      onClick={() => quickCreateSession(plan)}
                      className="btn-secondary btn-sm"
                    >
                      <CalendarPlus className="icon-sm" aria-hidden /> Schedule
                    </button>
                    <button
                      onClick={() => navigate(`${basePath}/students/${student.id}`)}
                      className="btn-ghost btn-sm"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {openGroupId && (
        <GroupDetailPanel groupId={openGroupId} onClose={() => setOpenGroupId(null)} onChanged={() => load({ quiet: true })} />
      )}
      {registerGroup && (
        <GroupRegisterDialog
          group={registerGroup}
          onClose={() => setRegisterGroup(null)}
          onDone={r => {
            setRegisterGroup(null)
            setNotice(`Register saved for ${registerGroup.title}.${r?.carriedOver ? ` ${r.carriedOver} unfinished item${r.carriedOver === 1 ? '' : 's'} carried to the next lessons.` : ''}`)
            load({ quiet: true })
          }}
        />
      )}
      {cancelling && (
        <CancelLessonModal
          session={cancelling}
          itemCount={(cancelling.items || []).filter(i => i.status !== 'completed').length}
          onClose={() => setCancelling(null)}
          onDone={r => {
            setNotice(r?.moved
              ? `Lesson cancelled. ${r.moved} item${r.moved === 1 ? '' : 's'} moved ${r.movedTo ? 'to the next lesson' : 'to unscheduled'}.`
              : 'Lesson cancelled.')
            load({ quiet: true })
          }}
        />
      )}
    </div>
  )
}
