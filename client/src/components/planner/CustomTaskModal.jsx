import { useState, useRef, useId } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { useTopEscape } from '../../lib/escape'
import { CUSTOM_TYPES, customTypeLabel } from '../../lib/customTypes'

const HINTS = {
  ixl_maths: 'e.g. Level G, F.2, 20 questions',
  ixl_english: 'e.g. Level F, Literary devices, 25 questions',
  corbett_maths: 'e.g. 5-a-day, or a Corbett textbook exercise',
  eleven_plus: 'e.g. Verbal reasoning paper, section 2',
  paper: 'e.g. Times tables grid',
  homework: 'e.g. Finish page 3 and read for 20 minutes',
  other: 'What is the task?',
}

// Add a task that isn't a library sheet (IXL, Corbett Maths, 11+, homework…)
export default function CustomTaskModal({ lessonLabel, onClose, onAdd }) {
  const [customType, setCustomType] = useState('ixl_maths')
  const [customTitle, setCustomTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const panelRef = useRef(null)
  const titleId = useId()
  useTopEscape(panelRef, onClose, !busy)

  const defaultTitle = customTypeLabel(customType)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const ok = await onAdd({ customType, customTitle: customTitle.trim() || defaultTitle })
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => !busy && onClose()}>
      <form
        ref={panelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id={titleId} className="section-title flex items-center gap-2">
            <ClipboardList className="icon-lg text-gray-500" aria-hidden /> Add custom task
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1 -mr-1" aria-label="Close" title="Close">
            <X className="icon" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          For IXL, Corbett Maths, 11+ practice, homework or anything not in the sheet library.
          {lessonLabel && <> It goes into <span className="font-medium text-gray-700">{lessonLabel}</span>.</>}
        </p>

        <div className="space-y-3">
          <div>
            <label className="label" htmlFor={`${titleId}-type`}>Type</label>
            <select id={`${titleId}-type`} value={customType} onChange={e => setCustomType(e.target.value)} className="input">
              {CUSTOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {customType === 'homework' && (
              <p className="text-xs text-gray-500 mt-1">Homework is printed in the Homework row of the lesson sheet.</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor={`${titleId}-name`}>Details <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              id={`${titleId}-name`}
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder={HINTS[customType] || defaultTitle}
              maxLength={200}
              className="input"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">Left blank, it is called "{defaultTitle}".</p>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? 'Adding…' : 'Add to this lesson'}</button>
        </div>
      </form>
    </div>
  )
}
