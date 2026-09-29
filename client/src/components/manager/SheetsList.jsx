import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import SheetPreviewModal from '../shared/SheetPreviewModal'
import { printSheetUrl } from '../../lib/print'
import { ArrowLeft, BookOpen, ChevronRight, FileText, Pencil, Printer, Search } from 'lucide-react'
import api from '../../lib/api'

export default function SheetsList() {
  const navigate = useNavigate()
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [previewId, setPreviewId] = useState(null)

  useEffect(() => {
    api.get('/sheets')
      .then(res => setSheets(res.data))
      .finally(() => setLoading(false))
  }, [])

  // Build tree: subject > topic > sheets
  const tree = useMemo(() => {
    const map = {}
    sheets.filter(s => (!difficultyFilter || String(s.difficultyLevel) === difficultyFilter) && (!reviewOnly || s.needsReview)).forEach(s => {
      if (!map[s.subject]) map[s.subject] = {}
      if (!map[s.subject][s.topic]) map[s.subject][s.topic] = []
      map[s.subject][s.topic].push(s)
    })
    return Object.keys(map).sort().map(subject => ({
      subject,
      topics: Object.keys(map[subject]).sort().map(topic => ({
        topic,
        sheets: map[subject][topic].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        )
      }))
    }))
  }, [sheets, difficultyFilter, reviewOnly])

  const subjects = useMemo(
    () => [...new Set(sheets.map(s => s.subject))].sort(),
    [sheets]
  )

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return tree
      .filter(s => !subjectFilter || s.subject === subjectFilter)
      .map(s => ({
        ...s,
        topics: s.topics
          .map(t => ({
            ...t,
            sheets: t.sheets.filter(sh =>
              !q ||
              sh.title.toLowerCase().includes(q) ||
              sh.topic.toLowerCase().includes(q)
            )
          }))
          .filter(t => t.sheets.length > 0)
      }))
      .filter(s => s.topics.length > 0)
  }, [tree, search, subjectFilter])

  if (loading) return <><Navbar /><LoadingSpinner /></>

  return (
    <>
      <Navbar title="Sheet Library" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/manager')} className="btn-ghost btn-sm -ml-2.5 mb-3">
          <ArrowLeft className="icon-sm" aria-hidden /> Back to dashboard
        </button>

        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="page-title">Sheet library</h1>
            <p className="text-sm text-gray-500 mt-1">
              {(search || subjectFilter || difficultyFilter || reviewOnly)
                ? `${filtered.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.sheets.length, 0), 0)} of ${sheets.length} sheets`
                : `${sheets.length} sheets`} · click a sheet to preview
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or topic"
              aria-label="Search sheets"
              className="input pl-9"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            className="input w-auto"
            aria-label="Subject"
          >
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} className="input w-auto" aria-label="Level">
            <option value="">All levels</option>
            {[1, 2, 3, 4, 5].map(d => <option key={d} value={String(d)}>Level {d}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              id="sheets-needs-review"
              type="checkbox"
              checked={reviewOnly}
              onChange={e => setReviewOnly(e.target.checked)}
              className="accent-redwood-600"
              aria-describedby="sheets-needs-review-count"
            />
            <label htmlFor="sheets-needs-review" className="cursor-pointer">
              Only sheets that need review
            </label>
            <span id="sheets-needs-review-count" className="text-gray-500 tabular-nums">({sheets.filter(s => s.needsReview).length})</span>
          </div>
        </div>

        {/* Tree */}
        {filtered.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <FileText className="icon-lg" aria-hidden />
            </div>
            <p className="font-medium text-gray-900">No sheets found</p>
            <p className="text-sm text-gray-500 mt-1">No sheets match your filters. Try a different search or level.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(subjectNode => (
              <div key={subjectNode.subject} className="card p-5">
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <BookOpen className="icon-lg text-gray-400" aria-hidden />
                  {subjectNode.subject}
                </h2>
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {subjectNode.topics.map(topicNode => (
                    <details key={topicNode.topic} className="group py-1">
                      <summary className="list-none [&::-webkit-details-marker]:hidden text-sm font-medium text-gray-800 cursor-pointer hover:text-redwood-700 py-1.5 flex items-center gap-2">
                        <ChevronRight className="icon text-gray-400 group-open:rotate-90 transition-transform" aria-hidden />
                        {topicNode.topic}
                        <span className="text-xs font-normal text-gray-500 tabular-nums">({topicNode.sheets.length})</span>
                      </summary>
                      <div className="ml-6 mt-1 mb-2 space-y-0.5">
                        {topicNode.sheets.map(sheet => (
                          <div key={sheet.id} className="flex items-center gap-1 rounded-md hover:bg-gray-50 group/row">
                            <button
                              onClick={() => setPreviewId(sheet.id)}
                              className="flex-1 min-w-0 text-left px-3 py-1.5 text-sm text-gray-700 hover:text-redwood-700 flex items-center gap-2"
                              title="Preview"
                            >
                              <FileText className="icon-sm text-gray-400" aria-hidden />
                              <span className="truncate">{sheet.title}</span>
                              <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">L{sheet.difficultyLevel}</span>
                              {sheet.printOnly && (
                                <span className="badge flex-shrink-0" title="No online version yet: print the original PDF">Paper only</span>
                              )}
                              {sheet.needsReview && (
                                <span className="badge-warning flex-shrink-0" title="The digital version may have errors — check it, or print the original PDF">
                                  Needs review
                                </span>
                              )}
                            </button>
                            <a
                              href={printSheetUrl(sheet.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 flex-shrink-0"
                              title="Print this sheet"
                              aria-label={`Print ${sheet.title}`}
                            >
                              <Printer className="icon" aria-hidden />
                            </a>
                            <button
                              onClick={() => navigate(`/manager/sheets/${sheet.id}/edit`)}
                              className="btn-ghost btn-sm flex-shrink-0"
                            >
                              <Pencil className="icon-sm" aria-hidden /> Edit
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <SheetPreviewModal sheetId={previewId} onClose={() => setPreviewId(null)} />
    </>
  )
}
