import { useMemo, useState } from 'react'
import { ArrowDownToLine, ChevronRight, ClipboardList, FileText, RotateCcw } from 'lucide-react'
import { sessionLabel } from '../../lib/sessions'
import { customTypeLabel } from '../../lib/customTypes'
import { isOver } from './LessonPicker'
import { itemTitle, scoreClass } from './LessonItem'

const COMPLETED_SHOWN = 10

// Work from earlier lessons that can come into the selected lesson:
//  - unfinished items (not completed, not already carried forward): move here
//  - recently completed items: repeat (a new copy in this lesson)
export default function BringForwardPanel({ items, sessions, ordinals, selectedKey, onMoveHere, onRepeat, onPreview, busy }) {
  const [open, setOpen] = useState(true)
  const [showDone, setShowDone] = useState(false)

  const { unfinishedGroups, unfinishedCount, completed } = useMemo(() => {
    const now = Date.now()
    const selected = sessions.find(s => s.id === selectedKey) || null
    const byId = Object.fromEntries(sessions.map(s => [s.id, s]))
    const earlier = s => s && s.id !== selectedKey && isOver(s, now) &&
      (!selected || new Date(s.scheduledAt) < new Date(selected.scheduledAt))

    const groups = new Map()
    for (const it of items) {
      if (it.status === 'completed' || it._count?.carriedTo > 0) continue
      if (it.sessionId == null) {
        if (selectedKey === 'unscheduled') continue
        if (!groups.has('unscheduled')) groups.set('unscheduled', { key: 'unscheduled', label: 'Unscheduled', order: Infinity, items: [] })
        groups.get('unscheduled').items.push(it)
        continue
      }
      const s = byId[it.sessionId]
      if (!earlier(s)) continue
      if (!groups.has(s.id)) groups.set(s.id, { key: s.id, label: sessionLabel(s, ordinals), order: new Date(s.scheduledAt).getTime(), items: [] })
      groups.get(s.id).items.push(it)
    }
    // Most recent lesson first, then the unscheduled pool
    const unfinishedGroups = [...groups.values()].sort((a, b) => {
      if (a.order === Infinity) return 1
      if (b.order === Infinity) return -1
      return b.order - a.order
    })

    const seen = new Set()
    const completed = items
      .filter(it => it.status === 'completed' && it.sessionId !== selectedKey && (it.sessionId == null ? false : earlier(byId[it.sessionId])))
      .sort((a, b) => new Date(byId[b.sessionId].scheduledAt) - new Date(byId[a.sessionId].scheduledAt))
      .filter(it => {
        const key = it.sheetId ? `s${it.sheetId}` : `c${it.customType}:${it.customTitle}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(it => ({ item: it, label: sessionLabel(byId[it.sessionId], ordinals) }))

    return { unfinishedGroups, unfinishedCount: unfinishedGroups.reduce((n, g) => n + g.items.length, 0), completed }
  }, [items, sessions, ordinals, selectedKey])

  const shownCompleted = showDone ? completed : completed.slice(0, COMPLETED_SHOWN)

  const titleCell = it => (
    <span className="flex items-center gap-1.5 min-w-0 flex-1">
      {it.sheetId ? <FileText className="icon-sm text-gray-400" aria-hidden /> : <ClipboardList className="icon-sm text-gray-400" aria-hidden />}
      {it.sheetId ? (
        <button type="button" onClick={() => onPreview(it.sheetId)} className="truncate text-left hover:text-redwood-700 hover:underline underline-offset-2" title="Preview this sheet">
          {itemTitle(it)}
        </button>
      ) : (
        <span className="truncate" title={customTypeLabel(it.customType)}>{itemTitle(it)}</span>
      )}
    </span>
  )

  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <ChevronRight className={`icon text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <span className="section-title">Bring forward</span>
        </span>
        <span className="text-xs text-gray-500">{unfinishedCount} unfinished · {completed.length} done before</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <section aria-label="Unfinished work from earlier lessons">
            <p className="eyebrow mb-1.5">Unfinished</p>
            {unfinishedGroups.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing unfinished from earlier lessons.</p>
            ) : (
              <div className="space-y-3">
                {unfinishedGroups.map(g => (
                  <div key={g.key}>
                    <p className="text-xs font-medium text-gray-600 mb-1">{g.label}</p>
                    <ul className="space-y-1">
                      {g.items.map(it => (
                        <li key={it.id} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1.5">
                          {titleCell(it)}
                          {it.status === 'in_progress' && <span className="badge-warning text-[10px] px-1.5 py-0">In progress</span>}
                          <button
                            type="button"
                            onClick={() => onMoveHere(it)}
                            disabled={busy}
                            className="btn-ghost btn-sm text-redwood-700 hover:text-redwood-700 flex-shrink-0 px-2"
                            title="Move to this lesson"
                            aria-label={`Move ${itemTitle(it)} to this lesson`}
                          >
                            <ArrowDownToLine className="icon-sm" aria-hidden /> <span className="hidden sm:inline">Move here</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Recently completed work">
            <p className="eyebrow mb-1.5">Recently completed</p>
            {completed.length === 0 ? (
              <p className="text-xs text-gray-500">No completed work in earlier lessons yet.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {shownCompleted.map(({ item: it, label }) => {
                    const score = it.studentResponses?.[0]?.score
                    return (
                      <li key={it.id} className="flex items-center gap-2 text-xs text-gray-700 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        {titleCell(it)}
                        {score != null && <span className={`font-semibold tabular-nums flex-shrink-0 ${scoreClass(score)}`}>{Math.round(score)}%</span>}
                        <span className="text-[11px] text-gray-400 flex-shrink-0 hidden xl:inline" title={label}>{label.split(' · ')[0]}</span>
                        <button
                          type="button"
                          onClick={() => onRepeat(it)}
                          disabled={busy}
                          className="btn-ghost btn-sm flex-shrink-0 px-2"
                          title="Set it again in this lesson"
                          aria-label={`Repeat ${itemTitle(it)} in this lesson`}
                        >
                          <RotateCcw className="icon-sm" aria-hidden /> <span className="hidden sm:inline">Repeat</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {completed.length > COMPLETED_SHOWN && (
                  <button type="button" onClick={() => setShowDone(s => !s)} className="link text-xs mt-1.5">
                    {showDone ? 'Show fewer' : `Show all ${completed.length}`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
