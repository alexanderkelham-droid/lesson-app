import { useState, useEffect } from 'react'
import api from '../../lib/api'

function formatDateTime(d) {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function toLocalISO(d) {
  // Format Date as "yyyy-MM-ddTHH:mm" for datetime-local inputs
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SessionsPanel({ planId, planTitle, canEdit = true }) {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft]         = useState({ scheduledAt: '', durationMins: 60, notes: '' })
  const [saving, setSaving]       = useState(false)

  function load() {
    setLoading(true)
    api.get(`/sessions?from=${new Date(Date.now() - 90 * 86400000).toISOString()}&to=${new Date(Date.now() + 90 * 86400000).toISOString()}`)
      .then(res => {
        setSessions(res.data.filter(s => s.lessonPlanId === planId))
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [planId])

  function startAdd() {
    const next = new Date()
    next.setHours(15, 0, 0, 0)
    setDraft({ scheduledAt: toLocalISO(next), durationMins: 60, notes: '' })
    setEditingId(null)
    setShowAdd(true)
  }

  function startEdit(s) {
    setDraft({
      scheduledAt: toLocalISO(new Date(s.scheduledAt)),
      durationMins: s.durationMins || 60,
      notes: s.notes || ''
    })
    setEditingId(s.id)
    setShowAdd(true)
  }

  async function saveDraft() {
    if (!draft.scheduledAt) return
    setSaving(true)
    try {
      const payload = {
        scheduledAt: new Date(draft.scheduledAt).toISOString(),
        durationMins: draft.durationMins ? parseInt(draft.durationMins) : null,
        notes: draft.notes || null
      }
      if (editingId) {
        await api.put(`/sessions/${editingId}`, payload)
      } else {
        await api.post('/sessions', { lessonPlanId: planId, ...payload })
      }
      setShowAdd(false)
      setEditingId(null)
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function markAttended(s) {
    try {
      await api.put(`/sessions/${s.id}`, { markAttended: true })
      load()
    } catch (e) { setError(e.response?.data?.error || 'Failed to update') }
  }

  async function unmarkAttended(s) {
    try {
      await api.put(`/sessions/${s.id}`, { attendedAt: null })
      load()
    } catch (e) { setError(e.response?.data?.error || 'Failed to update') }
  }

  async function deleteSession(s) {
    if (!confirm('Delete this session record?')) return
    try {
      await api.delete(`/sessions/${s.id}`)
      load()
    } catch (e) { setError(e.response?.data?.error || 'Failed to delete') }
  }

  const upcoming = sessions.filter(s => !s.attendedAt && new Date(s.scheduledAt) >= new Date())
  const past     = sessions.filter(s => s.attendedAt || new Date(s.scheduledAt) < new Date())
                            .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">Sessions</h3>
        {canEdit && (
          <button onClick={startAdd} className="btn-secondary text-xs py-1.5">
            + Schedule session
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading...</p> : (
        <>
          {/* Add/edit form */}
          {showAdd && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">{editingId ? 'Edit session' : 'New session'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">When</label>
                  <input
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={e => setDraft({ ...draft, scheduledAt: e.target.value })}
                    className="input text-xs py-1.5 mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Duration (mins)</label>
                  <input
                    type="number"
                    value={draft.durationMins}
                    onChange={e => setDraft({ ...draft, durationMins: e.target.value })}
                    className="input text-xs py-1.5 mt-0.5"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Notes (optional)</label>
                <textarea
                  value={draft.notes}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  className="input text-xs py-1.5 mt-0.5 resize-none"
                  rows={2}
                  placeholder="What was covered, observations, next steps..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowAdd(false); setEditingId(null) }} className="btn-secondary text-xs py-1.5">Cancel</button>
                <button onClick={saveDraft} disabled={saving} className="btn-primary text-xs py-1.5">
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Schedule'}
                </button>
              </div>
            </div>
          )}

          {sessions.length === 0 && !showAdd && (
            <p className="text-sm text-gray-400 text-center py-6">
              No sessions logged yet. Schedule one to track lessons.
            </p>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    canEdit={canEdit}
                    onEdit={startEdit}
                    onAttend={markAttended}
                    onDelete={deleteSession}
                    isPast={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Past</p>
              <div className="space-y-2">
                {past.slice(0, 8).map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    canEdit={canEdit}
                    onEdit={startEdit}
                    onAttend={markAttended}
                    onUnattend={unmarkAttended}
                    onDelete={deleteSession}
                    isPast
                  />
                ))}
                {past.length > 8 && <p className="text-xs text-gray-400 text-center pt-1">+{past.length - 8} older sessions</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SessionRow({ session, canEdit, onEdit, onAttend, onUnattend, onDelete, isPast }) {
  const attended = !!session.attendedAt
  const missed = isPast && !attended
  return (
    <div className={`border rounded-lg p-3 ${
      attended ? 'bg-green-50 border-green-200' : missed ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{formatDateTime(session.scheduledAt)}</p>
            {session.durationMins && <span className="text-xs text-gray-500">· {session.durationMins} min</span>}
            {attended && <span className="badge bg-green-100 text-green-700 text-[10px]">Attended</span>}
            {missed && <span className="badge bg-amber-100 text-amber-700 text-[10px]">No record</span>}
          </div>
          {session.notes && (
            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{session.notes}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1 flex-shrink-0">
            {!attended && (
              <button onClick={() => onAttend(session)} className="text-xs px-2 py-1 text-green-700 hover:bg-green-100 rounded" title="Mark attended">
                ✓
              </button>
            )}
            {attended && onUnattend && (
              <button onClick={() => onUnattend(session)} className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 rounded" title="Unmark attended">
                ↺
              </button>
            )}
            <button onClick={() => onEdit(session)} className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded" title="Edit / reschedule">
              ✎
            </button>
            <button onClick={() => onDelete(session)} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded" title="Delete">
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
