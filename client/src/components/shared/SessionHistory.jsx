import { useState, useEffect } from 'react'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'

/**
 * SessionHistory — timeline view of every session for a given student
 * (across all their lesson plans). Shows date, attendance, planned items,
 * completion ticks, scores, carry-over relationships, and notes.
 *
 * Used inside StudentDetail under a "History" tab.
 */
export default function SessionHistory({ studentId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('all') // all | attended | missed

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // Pull a wide date range so the entire history of this student fits
    const from = new Date(Date.now() - 365 * 86400000).toISOString()
    const to   = new Date(Date.now() + 90  * 86400000).toISOString()
    api.get(`/sessions?from=${from}&to=${to}`)
      .then(res => {
        if (cancelled) return
        const filtered = (res.data || []).filter(s => s.lessonPlan?.studentId === parseInt(studentId))
        setSessions(filtered)
      })
      .catch(err => !cancelled && setError(err.response?.data?.error || 'Failed to load history'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [studentId])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="card text-center text-red-600">{error}</div>

  const now = new Date()
  const filteredSessions = sessions
    .filter(s => {
      if (filter === 'attended') return !!s.attendedAt
      if (filter === 'missed')   return !s.attendedAt && new Date(s.scheduledAt) < now
      return true
    })
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)) // newest first

  if (sessions.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-3xl mb-2">📚</p>
        <p className="text-gray-600 font-medium">No sessions yet</p>
        <p className="text-sm text-gray-400 mt-1">Sessions appear here once they're scheduled or auto-generated for a plan.</p>
      </div>
    )
  }

  // Totals
  const totalSessions   = sessions.length
  const attendedCount   = sessions.filter(s => !!s.attendedAt).length
  const totalItems      = sessions.reduce((sum, s) => sum + (s.items?.length || 0), 0)
  const completedItems  = sessions.reduce((sum, s) => sum + (s.items?.filter(i => i.status === 'completed').length || 0), 0)
  const scoredResponses = sessions.flatMap(s => s.items?.flatMap(i => i.studentResponses || []) || []).filter(r => r.score != null)
  const avgScore        = scoredResponses.length
    ? Math.round(scoredResponses.reduce((sum, r) => sum + r.score, 0) / scoredResponses.length)
    : null

  return (
    <div>
      {/* Stats bar */}
      <div className="card mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sessions" value={totalSessions} />
        <Stat label="Attended"  value={`${attendedCount}/${totalSessions}`} />
        <Stat label="Sheets done" value={`${completedItems}/${totalItems}`} />
        <Stat label="Avg score" value={avgScore != null ? `${avgScore}%` : '—'} color={avgScore != null && avgScore >= 70 ? 'text-green-600' : avgScore != null ? 'text-red-500' : 'text-gray-400'} />
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: 'all',      label: 'All' },
          { key: 'attended', label: 'Attended' },
          { key: 'missed',   label: 'Missed / No record' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" aria-hidden />

        <div className="space-y-4">
          {filteredSessions.map(session => (
            <HistorySession key={session.id} session={session} now={now} />
          ))}
          {filteredSessions.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No sessions match this filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color || 'text-brand-600'}`}>{value}</p>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
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

  const dotColor = attended ? 'bg-green-500' : missed ? 'bg-amber-500' : 'bg-brand-500'

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-1.5 top-3 w-3 h-3 rounded-full ${dotColor} ring-4 ring-white`} />

      <div className={`card p-4 ${
        attended ? 'bg-green-50/40 border-green-200'
        : missed ? 'bg-amber-50/40 border-amber-200'
        : 'bg-white'
      }`}>
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{dateStr}</p>
            <p className="text-xs text-gray-500">
              {timeStr}
              {session.durationMins && ` · ${session.durationMins} min`}
              {session.lessonPlan?.title && (
                <> · <span className="text-brand-600">{session.lessonPlan.title}</span></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {attended && <span className="badge bg-green-100 text-green-700 text-[10px]">Attended</span>}
            {missed   && <span className="badge bg-amber-100 text-amber-700 text-[10px]">No record</span>}
            {upcoming && <span className="badge bg-brand-100 text-brand-700 text-[10px]">Upcoming</span>}
            {avgScore != null && (
              <span className={`text-sm font-bold ${avgScore >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                {avgScore}%
              </span>
            )}
          </div>
        </div>

        {/* Notes */}
        {session.notes && (
          <p className="text-xs text-gray-700 italic bg-gray-50 px-3 py-2 rounded mb-2 whitespace-pre-wrap">
            📝 {session.notes}
          </p>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No items assigned to this session</p>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-1">
              {completed.length}/{items.length} item{items.length === 1 ? '' : 's'} completed
            </p>
            <ul className="space-y-1">
              {items.map(it => {
                const isDone = it.status === 'completed'
                const resp = it.studentResponses?.[0]
                const title = it.customTitle || it.sheet?.title || 'Untitled'
                return (
                  <li key={it.id} className="text-xs flex items-start gap-2">
                    <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isDone ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isDone ? '✓' : '·'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`${isDone ? 'text-gray-800' : 'text-gray-600'}`}>{title}</span>
                      {resp?.score != null && (
                        <span className={`ml-2 font-semibold ${resp.score >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                          {resp.score}%
                        </span>
                      )}
                      {it.carriedFromId && (
                        <span className="ml-2 text-[10px] text-amber-600 italic">↳ carried from earlier session</span>
                      )}
                      {it.tutorNotes && (
                        <span className="ml-2 text-[10px] text-gray-500 italic" title={it.tutorNotes}>📝</span>
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
