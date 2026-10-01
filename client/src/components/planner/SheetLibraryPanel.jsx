import { useState, useEffect, useMemo } from 'react'
import { BookOpen, Check, ChevronRight, Eye, Plus, Search } from 'lucide-react'
import SheetHistoryBadge from '../shared/SheetHistoryBadge'

// Worksheet library: subject > topic > sheet. Clicking a sheet adds it to the
// selected lesson. Sheets already in this lesson are ticked; the student's
// sheet memory (done before / planned elsewhere) shows as a badge.
export default function SheetLibraryPanel({ sheets, inLesson, history = {}, onAdd, onPreview, busy = false }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sheets
    return sheets.filter(s => `${s.title} ${s.topic} ${s.subject}`.toLowerCase().includes(q))
  }, [sheets, search])

  const tree = useMemo(() => {
    const map = {}
    for (const sheet of filtered) {
      const topics = map[sheet.subject] || (map[sheet.subject] = {})
      const list = topics[sheet.topic] || (topics[sheet.topic] = [])
      list.push(sheet)
    }
    return Object.keys(map).sort().map(subject => ({
      subject,
      topics: Object.keys(map[subject]).sort().map(topic => ({
        topic,
        sheets: map[subject][topic].slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })),
      })),
    }))
  }, [filtered])

  // Expand everything while searching
  useEffect(() => {
    if (!search.trim()) return
    const all = {}
    tree.forEach(s => {
      all[s.subject] = true
      s.topics.forEach(t => { all[`${s.subject}/${t.topic}`] = true })
    })
    setExpanded(all)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const countIn = list => list.filter(s => inLesson.has(s.id)).length

  return (
    <div className="card p-4">
      <h2 className="section-title mb-1">Sheet library</h2>
      <p className="text-xs text-gray-500 mb-3">Click a sheet to add it to this lesson.</p>

      <div className="relative mb-3">
        <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9"
          placeholder="Search sheets"
          aria-label="Search sheets"
        />
      </div>

      <div className="max-h-[calc(100vh-260px)] min-h-[200px] overflow-y-auto pr-1 -mr-1">
        {tree.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-6">No sheets match your search.</p>
        ) : (
          <div className="space-y-1">
            {tree.map(subjectNode => {
              const subjectKey = subjectNode.subject
              const open = expanded[subjectKey]
              const total = subjectNode.topics.reduce((n, t) => n + t.sheets.length, 0)
              const added = subjectNode.topics.reduce((n, t) => n + countIn(t.sheets), 0)
              return (
                <div key={subjectKey}>
                  <button
                    type="button"
                    onClick={() => toggle(subjectKey)}
                    aria-expanded={!!open}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <ChevronRight className={`icon text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
                    <BookOpen className="icon text-gray-400" aria-hidden />
                    <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{subjectNode.subject}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {added > 0 && <span className="text-forest-700 mr-1">{added} in lesson</span>}
                      {total}
                    </span>
                  </button>

                  {open && (
                    <div className="ml-4 border-l border-gray-100 pl-1 space-y-0.5">
                      {subjectNode.topics.map(topicNode => {
                        const topicKey = `${subjectKey}/${topicNode.topic}`
                        const topicOpen = expanded[topicKey]
                        const topicAdded = countIn(topicNode.sheets)
                        return (
                          <div key={topicKey}>
                            <button
                              type="button"
                              onClick={() => toggle(topicKey)}
                              aria-expanded={!!topicOpen}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left"
                            >
                              <ChevronRight className={`icon-sm text-gray-400 transition-transform ${topicOpen ? 'rotate-90' : ''}`} aria-hidden />
                              <span className="text-xs font-medium text-gray-600 flex-1 truncate">{topicNode.topic}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                                {topicAdded > 0 && <span className="text-forest-700 mr-1">{topicAdded}</span>}
                                {topicNode.sheets.length}
                              </span>
                            </button>

                            {topicOpen && (
                              <div className="ml-4 space-y-0.5 py-1">
                                {topicNode.sheets.map(sheet => {
                                  const here = inLesson.has(sheet.id)
                                  const h = history[sheet.id]
                                  return (
                                    <div
                                      key={sheet.id}
                                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                                        here ? 'bg-forest-50 text-forest-700' : 'hover:bg-redwood-50 text-gray-700 hover:text-redwood-700'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => !here && onAdd(sheet)}
                                        disabled={here || busy}
                                        className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default"
                                        title={here ? 'Already in this lesson' : 'Add to this lesson'}
                                        aria-label={here ? `${sheet.title} (already in this lesson)` : `Add ${sheet.title} to this lesson`}
                                      >
                                        <span className="flex-shrink-0">
                                          {here ? <Check className="icon-sm text-forest-600" aria-hidden /> : <Plus className="icon-sm text-gray-400" aria-hidden />}
                                        </span>
                                        <span className="flex-1 truncate">{sheet.title}</span>
                                        {!here && <SheetHistoryBadge history={h} />}
                                        {sheet.printOnly && (
                                          <span className="badge text-[10px] px-1.5 py-0 flex-shrink-0" title="No online version yet: print the original PDF">Paper</span>
                                        )}
                                        {sheet.needsReview && (
                                          <span className="badge-warning text-[10px] px-1.5 py-0 flex-shrink-0" title="Digital version may have errors. Check it, or print the original">Review</span>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onPreview(sheet.id)}
                                        className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors p-0.5 rounded"
                                        title="Preview sheet"
                                        aria-label={`Preview ${sheet.title}`}
                                      >
                                        <Eye className="icon-sm" aria-hidden />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {search.trim() && filtered.length > 0 && (
          <p className="text-xs text-gray-500 text-center mt-3 pt-2 border-t border-gray-100">
            {filtered.length} sheet{filtered.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>
    </div>
  )
}
