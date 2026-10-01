import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import api from '../../lib/api'
import { printPlanUrl, openInNewTab, downloadOriginalsPack } from '../../lib/print'
import { FileDown, Printer } from 'lucide-react'
import { fmtDayTime, todayUk, ukDateKey } from '../../lib/datetime'
import { sessionNumbers, subjectLabel } from '../../lib/dates'

// "Tue 7 Oct, 17:40 · Maths · Session 2" (UK time)
function formatSession(s, numbers) {
  return [fmtDayTime(s.scheduledAt), subjectLabel(s.subject), numbers?.get(s.id)].filter(Boolean).join(' · ')
}

// "Print lesson pack" button + small popover: pick a session (defaults to
// the next upcoming unattended one), all items or unscheduled, then open the
// printable pack in a new tab.
export default function PrintPackMenu({ planId }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState(null)
  const [itemCounts, setItemCounts] = useState({})
  const [numbers, setNumbers] = useState(() => new Map())
  const [choice, setChoice] = useState('all')
  const [answers, setAnswers] = useState(false)
  const [notes, setNotes] = useState(false)
  const ref = useRef(null)
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => { setSessions(null); setOpen(false) }, [planId])

  useEffect(() => {
    if (!open || sessions) return
    api.get(`/lesson-plans/${planId}`)
      .then(res => {
        const today = todayUk()
        const all = res.data.sessions || []
        setNumbers(sessionNumbers(all, () => 'student'))
        const upcoming = all
          .filter(s => !s.attendedAt && ukDateKey(s.scheduledAt) >= today)
          .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
          .slice(0, 8)
        const counts = {}
        for (const it of res.data.items || []) if (it.sessionId) counts[it.sessionId] = (counts[it.sessionId] || 0) + 1
        setItemCounts(counts)
        setSessions(upcoming)
        setChoice(upcoming[0] ? String(upcoming[0].id) : 'all')
      })
      .catch(() => setSessions([]))
  }, [open, sessions, planId])

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Keep the popover on-screen: fixed position, right-aligned to the button
  // but clamped to the viewport (8px gutter), and flipped above the button
  // when there isn't room below.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function place() {
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = Math.min(288, vw - 16)
      const left = Math.max(8, Math.min(r.right - width, vw - width - 8))
      const below = vh - r.bottom - 12
      const above = r.top - 12
      if (below >= 320 || below >= above) {
        setPos({ left, width, top: r.bottom + 4, maxHeight: Math.max(160, below) })
      } else {
        setPos({ left, width, bottom: vh - r.top + 4, maxHeight: Math.max(160, above) })
      }
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const [building, setBuilding] = useState(false)
  const [packInfo, setPackInfo] = useState('')
  const [packError, setPackError] = useState('')

  function go() {
    openInNewTab(printPlanUrl(planId, { session: choice, answers, notes }))
    setOpen(false)
  }

  async function originals() {
    setBuilding(true)
    setPackInfo('')
    setPackError('')
    const summary = await downloadOriginalsPack(`/lesson-plans/${planId}/originals?session=${encodeURIComponent(choice)}`, { quiet: true })
    setBuilding(false)
    if (summary?.error) {
      setPackError(summary.error)
    } else if (summary?.empty) {
      setPackError(choice === 'all' || choice === 'unscheduled'
        ? 'None of these items has an original PDF'
        : 'This lesson has no sheets with an original PDF')
    } else if (summary) {
      const missing = summary.missing?.length ?? summary.missing ?? 0
      setPackInfo(`${summary.included} original${summary.included === 1 ? '' : 's'} · ${summary.pages} pages${missing ? ` · ${missing} without an original (see cover page)` : ''}`)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} className="btn-secondary btn-sm" aria-expanded={open} aria-haspopup="dialog">
        <Printer className="icon-sm" aria-hidden /> Print lesson pack
      </button>
      {open && pos && (
        <div
          role="dialog"
          aria-label="Print lesson pack"
          className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-pop p-3 overflow-y-auto text-left"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          <p className="eyebrow mb-2">What to print</p>
          {sessions === null ? (
            <p className="text-sm text-gray-500 py-2">Loading sessions…</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {sessions.map((s, i) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50">
                  <input type="radio" name="print-choice" checked={choice === String(s.id)} onChange={() => setChoice(String(s.id))} className="accent-redwood-600" />
                  <span className="flex-1">
                    {i === 0 ? 'Next: ' : ''}{formatSession(s, numbers)}
                    <span className="text-xs text-gray-500"> · {itemCounts[s.id] || 0} item{itemCounts[s.id] === 1 ? '' : 's'}</span>
                  </span>
                </label>
              ))}
              {sessions.length === 0 && <p className="text-xs text-gray-500 px-1">No upcoming sessions.</p>}
              {[['all', 'All items in plan'], ['unscheduled', 'Unscheduled items']].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50">
                  <input type="radio" name="print-choice" checked={choice === key} onChange={() => setChoice(key)} className="accent-redwood-600" />
                  {label}
                </label>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer px-1">
              <input type="checkbox" checked={answers} onChange={e => setAnswers(e.target.checked)} className="accent-redwood-600" />
              Include answer key (teacher copy)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer px-1">
              <input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} className="accent-redwood-600" />
              Include tutor notes
            </label>
          </div>
          <button onClick={go} disabled={sessions === null} className="btn-primary btn-sm w-full mt-3">
            Open print view (digital)
          </button>
          <button
            onClick={originals}
            disabled={sessions === null || building}
            className="btn-secondary btn-sm w-full mt-2"
            title="One PDF of the original scanned worksheets, in lesson order, ready to print"
          >
            {!building && <FileDown className="icon-sm" aria-hidden />}
            {building ? 'Building PDF…' : 'Download original sheets (PDF)'}
          </button>
          {packInfo && <p className="text-xs text-gray-500 mt-1.5" role="status">{packInfo}</p>}
          {packError && <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mt-1.5" role="alert">{packError}</p>}
        </div>
      )}
    </div>
  )
}
