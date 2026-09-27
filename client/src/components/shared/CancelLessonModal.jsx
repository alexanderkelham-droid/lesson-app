import { useState, useEffect, useId } from 'react'
import { X, CalendarX } from 'lucide-react'
import { cancelSession } from '../../lib/sessions'

// Cancel a lesson that hasn't happened and decide where its work goes.
export default function CancelLessonModal({ session, itemCount = 0, onClose, onDone }) {
  const [moveWork, setMoveWork] = useState('next')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const when = new Date(session.scheduledAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const r = await cancelSession(session.id, moveWork)
      onDone?.(r)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Could not cancel the lesson')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-redwood-50 text-redwood-700 flex items-center justify-center"><CalendarX className="icon" aria-hidden /></span>
            <h2 id={titleId} className="section-title">Cancel lesson</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1" aria-label="Close" title="Close"><X className="icon" aria-hidden /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{when}</p>
        {itemCount > 0 ? (
          <fieldset className="space-y-2 mb-4">
            <legend className="text-sm font-medium text-gray-800 mb-1">What should happen to its {itemCount} planned item{itemCount === 1 ? '' : 's'}?</legend>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="cancel-move-work" checked={moveWork === 'next'} onChange={() => setMoveWork('next')} className="mt-0.5 accent-redwood-600" />
              <span><span className="font-medium">Move to the next lesson</span><span className="block text-gray-500 text-xs">Recommended, so nothing gets forgotten.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="cancel-move-work" checked={moveWork === 'unscheduled'} onChange={() => setMoveWork('unscheduled')} className="mt-0.5 accent-redwood-600" />
              <span><span className="font-medium">Keep them unscheduled</span><span className="block text-gray-500 text-xs">You'll assign them to a lesson later.</span></span>
            </label>
          </fieldset>
        ) : (
          <p className="text-sm text-gray-600 mb-4">This lesson has no planned work.</p>
        )}
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Keep lesson</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Cancelling…' : 'Cancel lesson'}</button>
        </div>
      </div>
    </div>
  )
}
