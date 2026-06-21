import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import api from '../../lib/api'

export default function SheetsList() {
  const navigate = useNavigate()
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')

  useEffect(() => {
    api.get('/sheets')
      .then(res => setSheets(res.data))
      .finally(() => setLoading(false))
  }, [])

  // Build tree: subject → topic → sheets
  const tree = useMemo(() => {
    const map = {}
    sheets.forEach(s => {
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
  }, [sheets])

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
      <main className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/manager')} className="text-sm text-gray-500 hover:text-gray-800 mb-3 flex items-center gap-1">
          ← Back to dashboard
        </button>

        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-serif text-2xl font-bold text-gray-900">Sheet Library</h1>
            <p className="text-sm text-gray-500">{sheets.length} sheets · click any to edit</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or topic..."
            className="input flex-1 min-w-[200px]"
          />
          <select
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Tree */}
        {filtered.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <p>No sheets match your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(subjectNode => (
              <div key={subjectNode.subject} className="card p-4">
                <h2 className="font-serif font-bold text-base text-forest-900 mb-3">
                  {subjectNode.subject}
                </h2>
                <div className="space-y-3">
                  {subjectNode.topics.map(topicNode => (
                    <details key={topicNode.topic} className="group">
                      <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-redwood-600 py-1 flex items-center gap-2">
                        <span className="text-xs text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                        {topicNode.topic}
                        <span className="text-xs font-normal text-gray-400">({topicNode.sheets.length})</span>
                      </summary>
                      <div className="ml-4 mt-1 space-y-0.5">
                        {topicNode.sheets.map(sheet => (
                          <button
                            key={sheet.id}
                            onClick={() => navigate(`/manager/sheets/${sheet.id}/edit`)}
                            className="w-full text-left px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-redwood-50 hover:text-redwood-700 flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{sheet.title}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">Edit →</span>
                          </button>
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
    </>
  )
}
