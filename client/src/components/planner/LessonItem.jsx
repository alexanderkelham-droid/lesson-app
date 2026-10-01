import { useState, useEffect, useId } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ClipboardList, CornerDownRight, Eye, FileText, GripVertical, StickyNote, Trash2 } from 'lucide-react'
import { customTypeLabel } from '../../lib/customTypes'

export function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

export const itemTitle = item => item.customTitle || item.sheet?.title || 'Untitled'

export function StatusBadge({ item }) {
  const score = item.studentResponses?.[0]?.score
  if (item.status === 'completed') {
    return (
      <span className="badge-success">
        <Check className="icon-sm" aria-hidden /> Completed
        {score != null && <span className={`ml-1 font-semibold ${scoreClass(score)}`}>{Math.round(score)}%</span>}
      </span>
    )
  }
  if (item.status === 'in_progress') return <span className="badge-warning">In progress</span>
  return null
}

// One item in the selected lesson: drag handle (mouse, touch or keyboard:
// focus the handle, press Space, use the arrow keys, Space again to drop),
// preview, tutor note, move to another lesson, remove.
export default function LessonItem({ item, index, moveOptions, onPreview, onSaveNote, onMove, onRemove, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  const [noteOpen, setNoteOpen] = useState(!!item.tutorNotes)
  const [note, setNote] = useState(item.tutorNotes || '')
  const [noteState, setNoteState] = useState('') // '' | saving | saved | error
  const noteId = useId()
  const title = itemTitle(item)
  const isSheet = !!item.sheetId

  // Pick up changes from the server (e.g. after a refresh) unless mid-edit
  useEffect(() => { if (noteState !== 'saving') setNote(item.tutorNotes || '') }, [item.tutorNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNote() {
    if ((item.tutorNotes || '') === note) return
    setNoteState('saving')
    const ok = await onSaveNote(item, note)
    setNoteState(ok ? 'saved' : 'error')
    if (ok) setTimeout(() => setNoteState(s => (s === 'saved' ? '' : s)), 2000)
  }

  const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors flex-shrink-0'

  return (
    <li ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-card list-none">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none p-0.5 rounded disabled:cursor-default"
          aria-label={`Reorder ${title}. Press Space, then the arrow keys to move it, and Space again to drop.`}
          title="Drag to reorder"
          disabled={disabled}
        >
          <GripVertical className="icon-lg" aria-hidden />
        </button>
        <span className="text-xs text-gray-400 tabular-nums w-4 text-right flex-shrink-0" aria-hidden>{index + 1}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {isSheet ? (
              <FileText className="icon-sm text-gray-400" aria-hidden />
            ) : (
              <span className="badge flex-shrink-0"><ClipboardList className="icon-sm text-gray-500" aria-hidden />{customTypeLabel(item.customType)}</span>
            )}
            {isSheet ? (
              <button type="button" onClick={() => onPreview(item.sheetId)} className="font-medium text-sm text-gray-900 truncate text-left hover:text-redwood-700 hover:underline underline-offset-2" title="Preview this sheet">
                {title}
              </button>
            ) : (
              <span className="font-medium text-sm text-gray-900 truncate">{title}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
            {isSheet && (
              <span>{[item.sheet?.subject, item.sheet?.topic, item.sheet?.difficultyLevel ? `Level ${item.sheet.difficultyLevel}` : null].filter(Boolean).join(' · ')}</span>
            )}
            <StatusBadge item={item} />
            {item.carriedFromId && (
              <span className="inline-flex items-center gap-0.5 text-amber-800"><CornerDownRight className="w-3 h-3" aria-hidden />Carried over</span>
            )}
            {item.tutorNotes && !noteOpen && (
              <span className="inline-flex items-center gap-1" title={item.tutorNotes}><StickyNote className="w-3 h-3" aria-hidden /> Has note</span>
            )}
          </div>
        </div>

        {isSheet && (
          <button type="button" onClick={() => onPreview(item.sheetId)} className={`${iconBtn} hidden sm:inline-flex`} title="Preview sheet" aria-label={`Preview ${title}`}>
            <Eye className="icon" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setNoteOpen(o => !o)}
          className={`${iconBtn} ${noteOpen ? 'text-redwood-700 bg-redwood-50 hover:bg-redwood-50 hover:text-redwood-700' : ''}`}
          title="Tutor note"
          aria-label={`Tutor note for ${title}`}
          aria-expanded={noteOpen}
          aria-controls={noteId}
        >
          <StickyNote className="icon" aria-hidden />
        </button>
        <select
          value=""
          onChange={e => e.target.value && onMove(item, e.target.value)}
          disabled={disabled}
          className="input text-xs py-1 px-1.5 w-auto max-w-[9rem] hidden md:block"
          aria-label={`Move ${title} to another lesson`}
          title="Move to another lesson"
        >
          <option value="">Move to…</option>
          {moveOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => onRemove(item)}
          disabled={disabled}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-700 hover:bg-red-50 transition-colors flex-shrink-0"
          title="Remove from this lesson"
          aria-label={`Remove ${title} from this lesson`}
        >
          <Trash2 className="icon" aria-hidden />
        </button>
      </div>

      {/* Small screens: the move control sits under the row */}
      <div className="px-3 pb-3 -mt-1 md:hidden">
        <select
          value=""
          onChange={e => e.target.value && onMove(item, e.target.value)}
          disabled={disabled}
          className="input text-xs py-1"
          aria-label={`Move ${title} to another lesson`}
        >
          <option value="">Move to another lesson…</option>
          {moveOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {noteOpen && (
        <div id={noteId} className="border-t border-gray-100 px-3 py-3 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between mb-1">
            <label className="label text-xs mb-0" htmlFor={`${noteId}-text`}>Tutor note (private)</label>
            <span className="text-xs" role="status" aria-live="polite">
              {noteState === 'saving' && <span className="text-gray-500">Saving…</span>}
              {noteState === 'saved' && <span className="text-forest-700 inline-flex items-center gap-1"><Check className="icon-sm" aria-hidden />Saved</span>}
              {noteState === 'error' && <span className="text-red-700">Not saved</span>}
            </span>
          </div>
          <textarea
            id={`${noteId}-text`}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveNote}
            className="input text-xs py-1.5 resize-none"
            rows={2}
            maxLength={1000}
            placeholder="e.g. Revisit denominators before starting"
          />
          <p className="text-[11px] text-gray-500 mt-1">Saves when you click away.</p>
        </div>
      )}
    </li>
  )
}
