import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tldraw } from 'tldraw'
import { useSyncDemo } from '@tldraw/sync'
import 'tldraw/tldraw.css'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import SheetPreviewModal from './SheetPreviewModal'
import api from '../../lib/api'

export default function LiveSessionView() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [planDetails, setPlanDetails] = useState(null)
  const [boardUuid, setBoardUuid]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeSheet, setActiveSheet] = useState(null)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [allSheets, setAllSheets]       = useState([])
  const [sheetSearch, setSheetSearch]   = useState('')
  const [previewSheetId, setPreviewSheetId] = useState(null)

  const basePath = user?.role === 'tutor' ? '/tutor'
                 : user?.role === 'student' ? '/student'
                 : '/manager'

  useEffect(() => {
    async function load() {
      try {
        const [sessionRes, planRes] = await Promise.all([
          api.get(`/lesson-plans/${planId}/live-session`),
          api.get(`/lesson-plans/${planId}`)
        ])
        setBoardUuid(sessionRes.data.boardUuid)
        setPlanDetails(planRes.data)
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to start live session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [planId])

  async function openAddSheet() {
    setShowAddSheet(true)
    if (allSheets.length === 0) {
      try {
        const res = await api.get('/sheets')
        setAllSheets(res.data)
      } catch (e) {
        console.error('Failed to load sheets', e)
      }
    }
  }

  async function addSheetToPlan(sheet) {
    try {
      await api.post(`/lesson-plans/${planId}/items`, {
        sheetId: sheet.id,
        status: 'available'
      })
      // Refresh plan details to show new item in sidebar
      const planRes = await api.get(`/lesson-plans/${planId}`)
      setPlanDetails(planRes.data)
      setShowAddSheet(false)
      setSheetSearch('')
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to add sheet')
    }
  }

  async function openSheet(itemSheet) {
    if (activeSheet?.id === itemSheet.id) {
      setActiveSheet(null)
      return
    }
    setSheetLoading(true)
    try {
      const res = await api.get(`/sheets/${itemSheet.id}`)
      setActiveSheet(res.data)
    } catch (e) {
      console.error('Failed to load sheet', e)
    } finally {
      setSheetLoading(false)
    }
  }

  function endSession() {
    if (user?.role === 'student') navigate('/student')
    else navigate(`${basePath}/students/${planDetails?.studentId || ''}`)
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <LoadingSpinner />
        <p className="text-gray-500 text-sm mt-3">Setting up your whiteboard...</p>
      </div>
    )
  }

  if (error || !boardUuid) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4">
        <div className="card max-w-md text-center">
          <h2 className="text-lg font-bold text-red-600 mb-2">Could not start session</h2>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={endSession} className="btn-secondary">Back</button>
        </div>
      </div>
    )
  }

  const items = planDetails?.items?.sort((a, b) => a.sequenceOrder - b.sequenceOrder) || []
  const isTeacher = user?.role !== 'student'

  return (
    <>
      <Whiteboard
        boardUuid={boardUuid}
        isTeacher={isTeacher}
        user={user}
        items={items}
        planDetails={planDetails}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeSheet={activeSheet}
        sheetLoading={sheetLoading}
        onOpenSheet={openSheet}
        onCloseSheet={() => setActiveSheet(null)}
        onEndSession={endSession}
        onAddSheet={isTeacher ? openAddSheet : null}
        onPreviewSheet={(id) => setPreviewSheetId(id)}
      />

      {/* Add sheet picker modal */}
      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddSheet(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Add a sheet to the plan</h2>
              <button onClick={() => setShowAddSheet(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <input
                value={sheetSearch}
                onChange={e => setSheetSearch(e.target.value)}
                placeholder="Search sheets..."
                className="input text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {allSheets.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">Loading sheets...</p>
              ) : (
                allSheets
                  .filter(s => {
                    if (!sheetSearch) return true
                    const q = sheetSearch.toLowerCase()
                    return s.title.toLowerCase().includes(q) ||
                           s.topic.toLowerCase().includes(q) ||
                           s.subject.toLowerCase().includes(q)
                  })
                  .slice(0, 50)
                  .map(sheet => {
                    const inPlan = items.some(i => i.sheetId === sheet.id)
                    return (
                      <div key={sheet.id} className={`flex items-center gap-2 p-2 rounded text-sm ${inPlan ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <button
                          onClick={() => !inPlan && addSheetToPlan(sheet)}
                          disabled={inPlan}
                          className="flex-1 min-w-0 text-left disabled:cursor-default"
                        >
                          <p className={`font-medium truncate ${inPlan ? 'text-green-700' : 'text-gray-800'}`}>
                            {inPlan && '✓ '}{sheet.title}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{sheet.subject} · {sheet.topic}</p>
                        </button>
                        <button
                          onClick={() => setPreviewSheetId(sheet.id)}
                          className="text-gray-400 hover:text-brand-600 p-1 flex-shrink-0"
                          title="Preview"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>
      )}

      <SheetPreviewModal
        sheetId={previewSheetId}
        onClose={() => setPreviewSheetId(null)}
      />
    </>
  )
}

// ─── Sheet panel: read-only preview of questions ─────────────────────────────

function SheetPanel({ sheet, onClose, sheetLoading }) {
  if (sheetLoading) {
    return (
      <aside className="w-[420px] bg-white border-l border-gray-200 flex items-center justify-center">
        <LoadingSpinner />
      </aside>
    )
  }
  if (!sheet) return null

  const questions = sheet.contentJson?.questions || []

  return (
    <aside className="w-[420px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-2 bg-gradient-to-r from-brand-50 to-indigo-50">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 text-sm truncate">{sheet.title}</h2>
          <p className="text-xs text-gray-500">{sheet.subject} · {sheet.topic}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/60 text-gray-500 flex-shrink-0"
          title="Close worksheet"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {questions.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No questions on this worksheet.</p>
        )}
        {questions.map((q, i) => (
          <div key={q.id || i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 bg-brand-600 text-white rounded-full text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
                {q.options && q.options.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, j) => (
                      <li key={j} className="text-xs text-gray-600 flex items-center gap-2">
                        <span className="font-mono text-gray-400">{String.fromCharCode(97 + j)})</span>
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
                {q.pairs && (
                  <div className="mt-2 space-y-1">
                    {q.pairs.map((pair, j) => (
                      <div key={j} className="text-xs text-gray-600">
                        <span className="font-medium">{pair.left}</span>
                        <span className="text-gray-400 mx-1">↔</span>
                        <span>?</span>
                      </div>
                    ))}
                  </div>
                )}
                {q.correct && q.correct.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Show answer</summary>
                    <p className="text-xs text-green-600 font-medium mt-1">
                      {q.correct.join(' / ')}
                    </p>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
        Reference only — work through the questions on the whiteboard.
      </div>
    </aside>
  )
}

function Whiteboard({ boardUuid, isTeacher, user, items, planDetails, sidebarOpen, setSidebarOpen, activeSheet, sheetLoading, onOpenSheet, onCloseSheet, onEndSession, onAddSheet, onPreviewSheet }) {
  const store = useSyncDemo({
    roomId: `lesson-app-${boardUuid}`,
    userInfo: {
      id: String(user?.id || 'anon'),
      name: user?.name || 'User',
      color: isTeacher ? '#a855f7' : '#3b82f6'
    }
  })

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 text-sm truncate">{planDetails?.title}</h1>
            <p className="text-xs text-gray-500 truncate">
              {isTeacher
                ? `Teaching ${planDetails?.student?.name}`
                : `Learning with ${planDetails?.tutor?.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeSheet && (
            <span className="hidden md:inline-flex badge bg-brand-100 text-brand-700 truncate max-w-[200px]">
              📄 {activeSheet.title}
            </span>
          )}
          <span className={`badge ${isTeacher ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {isTeacher ? 'Teacher' : 'Student'}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
          <button onClick={onEndSession} className="btn-danger text-xs py-1.5 px-3">
            End Session
          </button>
        </div>
      </header>

      {/* Main: sidebar + whiteboard + sheet panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="w-60 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lesson Sheets</h2>
                {onAddSheet && (
                  <button
                    onClick={onAddSheet}
                    className="text-xs text-brand-600 hover:bg-brand-50 px-2 py-0.5 rounded font-semibold"
                    title="Add a sheet to this plan"
                  >
                    + Add
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Click to view alongside</p>
            </div>
            <div className="p-2 space-y-1">
              {items.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No sheets in this plan</p>
              )}
              {items.map((item, idx) => {
                const isActive = activeSheet?.id === item.sheet?.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onOpenSheet(item.sheet)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      isActive ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`flex-shrink-0 w-5 h-5 rounded text-xs font-semibold flex items-center justify-center mt-0.5 ${
                        isActive ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium leading-snug truncate ${isActive ? 'text-brand-700' : 'text-gray-800'}`}>
                          {item.sheet?.title}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.sheet?.subject}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="p-3 border-t border-gray-100 mt-2 text-xs text-gray-500 leading-relaxed">
              <p className="mb-2"><strong className="text-gray-700">How it works</strong></p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Click a sheet to open it in the right panel</li>
                <li>Both of you draw on the canvas in real-time</li>
                <li>Work through questions together</li>
              </ul>
            </div>
          </aside>
        )}

        {/* Whiteboard canvas */}
        <main className="flex-1 relative min-w-0">
          <Tldraw store={store} autoFocus />
        </main>

        {/* Sheet panel on the right */}
        {(activeSheet || sheetLoading) && (
          <SheetPanel
            sheet={activeSheet}
            onClose={onCloseSheet}
            sheetLoading={sheetLoading}
          />
        )}
      </div>
    </div>
  )
}
