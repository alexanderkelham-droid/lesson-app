import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import SheetPreviewModal from './SheetPreviewModal'
import InteractiveSheet from './InteractiveSheet'
import api from '../../lib/api'

export default function LiveSessionView() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [planDetails, setPlanDetails] = useState(null)
  const [sessionId, setSessionId]     = useState(null)
  const [activeItemId, setActiveItemId] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
        setSessionId(sessionRes.data.sessionId)
        setActiveItemId(sessionRes.data.activeItemId)
        setPlanDetails(planRes.data)
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to start live session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [planId])

  // Poll for active item changes (teacher might change sheet from sidebar)
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    async function poll() {
      try {
        const res = await api.get(`/sessions/${sessionId}/live-state`)
        if (!cancelled) setActiveItemId(res.data.activeItemId)
      } catch { /* ignore */ }
    }
    const interval = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [sessionId])

  const isTeacher = user?.role !== 'student'
  const activeItem = planDetails?.items?.find(i => i.id === activeItemId)
  const activeSheet = activeItem?.sheet  // a sheet might be linked; custom items have no sheet

  async function setActiveItem(itemId) {
    setActiveItemId(itemId)
    // Persist for student to follow
    if (sessionId) {
      try { await api.patch(`/sessions/${sessionId}/live-state`, { activeItemId: itemId }) } catch {}
    }
  }

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
        status: 'available',
        // Auto-assign to current session so the sheet shows up in this lesson
        sessionId: sessionId || undefined
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

  if (error || !sessionId) {
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

  // Filter to items belonging to THIS session. Items with no sessionId
  // (unscheduled pool) are also shown so the tutor can pull from the backlog
  // mid-lesson — items from other sessions are hidden to reduce clutter.
  const allItems = planDetails?.items?.sort((a, b) => a.sequenceOrder - b.sequenceOrder) || []
  const items = sessionId
    ? allItems.filter(i => !i.sessionId || i.sessionId === sessionId)
    : allItems

  return (
    <>
      <LiveRoom
        sessionId={sessionId}
        isTeacher={isTeacher}
        items={items}
        planDetails={planDetails}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeItem={activeItem}
        onSelectItem={setActiveItem}
        onEndSession={endSession}
        onAddSheet={isTeacher ? openAddSheet : null}
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

function LiveRoom({
  sessionId, isTeacher, items, planDetails,
  sidebarOpen, setSidebarOpen,
  activeItem, onSelectItem, onEndSession, onAddSheet,
}) {
  const activeItemSheet = activeItem?.sheet
  const isCustomActive  = activeItem && !activeItem.sheet
  const hasInteractive  = !!activeItemSheet

  return (
    <div className="h-screen flex flex-col bg-cream">
      {/* Top bar */}
      <header className="bg-white border-b-2 border-redwood-100 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-redwood-50 text-forest-700"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-serif font-bold text-gray-900 text-sm truncate">{planDetails?.title}</h1>
            <p className="text-xs text-forest-700 truncate">
              {isTeacher
                ? `Teaching ${planDetails?.student?.name}`
                : `Learning with ${planDetails?.tutor?.name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`badge ${isTeacher ? 'bg-redwood-100 text-redwood-700' : 'bg-forest-100 text-forest-700'}`}>
            {isTeacher ? 'Teacher' : 'Student'}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
          <button onClick={onEndSession} className="btn-danger text-xs py-1.5 px-3">
            End
          </button>
        </div>
      </header>

      {/* Main: sidebar + sheet */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="w-60 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lesson Items</h2>
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
              <p className="text-xs text-gray-400 mt-0.5">
                {isTeacher ? 'Click to open for both' : 'Tutor will pick what to work on'}
              </p>
            </div>
            <div className="p-2 space-y-1">
              {items.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No items in this plan</p>
              )}
              {items.map((item, idx) => {
                const isActive = activeItem?.id === item.id
                const isCustom = !item.sheet && item.customTitle
                const title = isCustom ? item.customTitle : item.sheet?.title
                return (
                  <button
                    key={item.id}
                    onClick={() => isTeacher && onSelectItem(item.id)}
                    disabled={!isTeacher}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      isActive ? 'bg-redwood-50 border border-redwood-200'
                      : isTeacher ? 'hover:bg-gray-50 border border-transparent'
                      : 'border border-transparent cursor-default'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`flex-shrink-0 w-5 h-5 rounded text-xs font-semibold flex items-center justify-center mt-0.5 ${
                        isActive ? 'bg-redwood-600 text-white'
                        : isCustom ? 'bg-purple-100 text-purple-700'
                        : 'bg-brand-100 text-brand-700'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium leading-snug truncate ${isActive ? 'text-redwood-700' : 'text-gray-800'}`}>
                          {title || 'Untitled'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {isCustom ? 'Custom' : item.sheet?.subject}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>
        )}

        {/* Main content area — shared interactive sheet only */}
        <main className="flex-1 relative min-w-0 overflow-hidden">
          {hasInteractive ? (
            <InteractiveSheet
              sessionId={sessionId}
              sheetId={activeItemSheet.id}
              isTeacher={isTeacher}
              onCloseSheet={isTeacher ? () => onSelectItem(null) : null}
            />
          ) : isCustomActive ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="card text-center max-w-md">
                <p className="text-4xl mb-3">📋</p>
                <h3 className="font-serif font-bold text-gray-900 text-lg mb-1">
                  {activeItem.customTitle}
                </h3>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                  {activeItem.customType === 'ixl_maths' ? 'IXL Maths'
                    : activeItem.customType === 'ixl_english' ? 'IXL English'
                    : activeItem.customType === 'paper' ? 'Paper activity'
                    : 'Custom task'}
                </p>
                <p className="text-sm text-gray-600">
                  Work on this externally. {isTeacher && 'Mark as done from the student\'s profile when finished.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8 bg-gradient-to-br from-cream to-redwood-50">
              <div className="text-center max-w-md">
                <p className="text-5xl mb-3">📚</p>
                <h3 className="font-serif font-bold text-gray-900 text-xl mb-2">
                  {isTeacher ? 'Pick an item from the sidebar' : 'Waiting for your tutor'}
                </h3>
                <p className="text-sm text-forest-700">
                  {isTeacher
                    ? 'Click any item on the left to start. The student will see the same sheet when you open it.'
                    : 'Your tutor will open a sheet to work on shortly. Hang tight!'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
