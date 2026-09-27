import { useState, useEffect } from 'react'
import { BookOpen, Check, CornerDownRight, Printer, StickyNote } from 'lucide-react'
import SheetLink from './SheetLink'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'
import { printPlanUrl } from '../../lib/print'

// Score colours: >=70 forest, 40-69 amber, <40 red (rounded first)
function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

/**
 * SessionHistory — timeline view of every session for a given student
 * (across all their lesson plans). Shows date, attendance, planned items,
 * completion ticks, scores, carry-over relationships, and notes.
 *
 * Used inside StudentDetail under a "History" tab.
 */
export default function SessionHistory({ studentId }) {
  const [sessions, setSessions] = useState([])
  const [planItems, setPlanItems] = useState(null) // all items across the student's plans
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('past') // past | upcoming | attended | missed | all

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // Pull a wide date range so the entire history of this student fits
    const from = new Date(Date.now() - 365 * 86400000).toISOString()
    const to   = new Date(Date.now() + 90  * 86400000).toISOString()
    Promise.all([api.get(`/sessions?from=${from}&to=${to}`), api.get('/lesson-plans').catch(() => null)])
      .then(([res, plansRes]) => {
        if (cancelled) return
        const filtered = (res.data || []).filter(s => s.lessonPlan?.studentId === parseInt(studentId))
        setSessions(filtered)
        if (plansRes) {
          setPlanItems((plansRes.data || [])
            .filter(p => p.studentId === parseInt(studentId))
            .flatMap(p => p.items || []))
        }
      })
      .catch(err => !cancelled && setError(err.response?.data?.error || 'Failed to load history'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [studentId])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="card text-center text-red-700">{error}</div>

  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const filteredSessions = sessions
    .filter(s => {
      const at = new Date(s.scheduledAt)
      if (filter === 'past')     return at < endOfToday || !!s.attendedAt
      if (filter === 'upcoming') return at >= endOfToday && !s.attendedAt
      if (filter === 'attended') return !!s.attendedAt
      if (filter === 'missed')   return !s.attendedAt && at < now
      return true
    })
    // Upcoming reads soonest-first; everything else newest-first
    .sort((a, b) => filter === 'upcoming'
      ? new Date(a.scheduledAt) - new Date(b.scheduledAt)
      : new Date(b.scheduledAt) - new Date(a.scheduledAt))

  if (sessions.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
          <BookOpen className="icon-lg" aria-hidden />
        </div>
        <p className="text-gray-900 font-medium">No sessions yet</p>
        <p className="text-sm text-gray-500 mt-1">Sessions appear here once they're scheduled or auto-generated for a plan.</p>
      </div>
    )
  }

  // Totals. Lessons count only once they've happened (future ones excluded).
  // Sheets are counted like the student page header: every item in the
  // student's plans, except unfinished originals that were carried forward
  // (they count once, as their copy in the later lesson).
  const pastSessions    = sessions.filter(s => !!s.attendedAt || new Date(s.scheduledAt) < now)
  const attendedCount   = pastSessions.filter(s => !!s.attendedAt).length
  let countedItems
  if (planItems) {
    countedItems = planItems.filter(i => i.status === 'completed' || !(i._count?.carriedTo > 0))
  } else {
    const allItems   = sessions.flatMap(s => s.items || [])
    const carriedIds = new Set(allItems.map(i => i.carriedFromId).filter(Boolean))
    countedItems = allItems.filter(i => i.status === 'completed' || !carriedIds.has(i.id))
  }
  const totalItems      = countedItems.length
  const completedItems  = countedItems.filter(i => i.status === 'completed').length
  const scoredResponses = countedItems.filter(i => i.status === 'completed').map(i => i.studentResponses?.[0]).filter(r => r?.score != null)
  const avgScore        = scoredResponses.length
    ? Math.round(scoredResponses.reduce((sum, r) => sum + r.score, 0) / scoredResponses.length)
    : null

  return (
    <div>
      {/* Stats bar */}
      <div className="card p-5 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:divide-x sm:divide-gray-100">
        <Stat label="Past lessons" value={pastSessions.length} />
        <Stat
          label="Attended"
          value={`${attendedCount}/${pastSessions.length}`}
          srText={`Attended ${attendedCount} of ${pastSessions.length} past lessons`}
        />
        <Stat label="Sheets done" value={`${completedItems}/${totalItems}`} />
        <Stat label="Avg score" value={avgScore != null ? `${avgScore}%` : '—'} color={avgScore != null ? scoreClass(avgScore) : 'text-gray-400'} />
        <p className="col-span-2 sm:col-span-4 text-xs text-gray-500 text-center sm:border-0 pt-1" aria-hidden>
          Attended {attendedCount} of {pastSessions.length} past lesson{pastSessions.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Filter */}
      <div className="tabs flex-wrap mb-4" role="tablist">
        {[
          { key: 'past',     label: 'Past & today' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'attended', label: 'Attended' },
          { key: 'missed',   label: 'Missed / No record' },
          { key: 'all',      label: 'All' },
        ].map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={`tab text-xs ${filter === t.key ? 'tab-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" aria-hidden />

        <div className="space-y-4">
          {filteredSessions.map(session => (
            <HistorySession key={session.id} session={session} now={now} />
          ))}
          {filteredSessions.length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">No sessions match this filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color, srText }) {
  return (
    <div className="text-center">
      <p className={`font-serif text-2xl font-semibold tabular-nums ${color || 'text-gray-900'}`} aria-hidden={srText ? true : undefined}>{value}</p>
      {srText && <span className="sr-only">{srText}</span>}
      <p className="eyebrow mt-0.5" aria-hidden={srText ? true : undefined}>{label}</p>
    </div>
  )
}

function HistorySession({ session, now }) {
  const attended  = !!session.attendedAt
  const past      = new Date(session.scheduledAt) < now
  const missed    = past && !attended
  const upcoming  = !past && !attended

  const items = (session.items || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  const completed = items.filter(i => i.status === 'completed')
  const responses = items.flatMap(i => i.studentResponses || []).filter(r => r.score != null)
  const avgScore = responses.length ? Math.round(responses.reduce((s, r) => s + r.score, 0) / responses.length) : null

  const dt = new Date(session.scheduledAt)
  const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const dotColor = attended ? 'bg-forest-600' : missed ? 'bg-amber-500' : 'bg-gray-400'

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-[7px] top-4 w-3 h-3 rounded-full ${dotColor} ring-4 ring-canvas`} />

      <div className={`card p-4 ${
        attended ? 'border-forest-100'
        : missed ? 'border-amber-200'
        : ''
      }`}>
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{dateStr}</p>
            <p className="text-xs text-gray-500">
              {timeStr}
              {session.durationMins && ` · ${session.durationMins} min`}
              {session.lessonPlan?.title && (
                <> · <span className="text-redwood-700">{session.lessonPlan.title}</span></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {attended && <span className="badge-success">Attended</span>}
            {missed   && <span className="badge-warning">No record</span>}
            {upcoming && <span className="badge">Upcoming</span>}
            {avgScore != null && (
              <span className={`text-sm font-semibold tabular-nums ${scoreClass(avgScore)}`}>
                {avgScore}%
              </span>
            )}
            <a
              href={printPlanUrl(session.lessonPlanId, { session: session.id })}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary btn-sm"
              title="Print this session's sheets"
            >
              <Printer className="icon-sm" aria-hidden /> Print
            </a>
          </div>
        </div>

        {/* Notes */}
        {session.notes && (
          <p className="text-xs text-gray-700 italic bg-gray-50 border border-gray-100 px-3 py-2 rounded-lg mb-3 whitespace-pre-wrap flex items-start gap-2">
            <StickyNote className="icon-sm mt-0.5 text-gray-400" aria-hidden />
            <span>{session.notes}</span>
          </p>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No items assigned to this session</p>
        ) : (
          <div>
            <p className="eyebrow mb-1.5">
              {completed.length}/{items.length} item{items.length === 1 ? '' : 's'} completed
            </p>
            <ul className="space-y-1">
              {items.map(it => {
                const isDone = it.status === 'completed'
                const resp = it.studentResponses?.[0]
                const title = it.customTitle || it.sheet?.title || 'Untitled'
                return (
                  <li key={it.id} className="text-xs flex items-start gap-2">
                    <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                      isDone ? 'bg-forest-600 text-white' : 'bg-gray-200'
                    }`}>
                      {isDone ? <Check className="w-2.5 h-2.5" strokeWidth={3} aria-label="Completed" /> : <span className="w-1 h-1 rounded-full bg-gray-400" aria-hidden />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <SheetLink sheetId={it.sheet?.id} className={`${isDone ? 'text-gray-800' : 'text-gray-600'}`}>{title}</SheetLink>
                      {resp?.score != null && (
                        <span className={`ml-2 font-semibold ${scoreClass(resp.score)}`}>
                          {Math.round(resp.score)}%
                        </span>
                      )}
                      {it.carriedFromId && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-amber-800 italic"><CornerDownRight className="w-3 h-3" aria-hidden />carried from earlier session</span>
                      )}
                      {it.tutorNotes && (
                        <span className="ml-2 inline-flex align-middle text-gray-400" title={it.tutorNotes} aria-label="Has tutor note"><StickyNote className="w-3 h-3" aria-hidden /></span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
