import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ConfirmModal from './ConfirmModal'
import SheetHistoryBadge from './SheetHistoryBadge'
import useSheetHistory, { describeHistory } from '../../hooks/useSheetHistory'
import SheetPreviewModal from './SheetPreviewModal'
import InteractiveSheet from './InteractiveSheet'
import api from '../../lib/api'
import { ArrowLeft, BookOpen, Check, ClipboardList, ExternalLink, Eye, Hourglass, LoaderCircle, LogOut, Menu, Plus, X } from 'lucide-react'

export default function LiveSessionView() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [planDetails, setPlanDetails] = useState(null)
  const [sessionId, setSessionId]     = useState(null)
  const [activeItemId, setActiveItemId] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  // Students on small screens start with the list closed so the sheet has room
  const [sidebarOpen, setSidebarOpen] = useState(() => !(user?.role === 'student' && window.innerWidth < 900))
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [allSheets, setAllSheets]       = useState([])
  const [sheetSearch, setSheetSearch]   = useState('')
  const [previewSheetId, setPreviewSheetId] = useState(null)
  const [studentOnline, setStudentOnline]   = useState(null) // null until first poll
  const [confirmEnd, setConfirmEnd]         = useState(false)
  const [repeatSheet, setRepeatSheet]       = useState(null) // sheet awaiting "add again?" confirmation
  const [addError, setAddError]             = useState('')
  const [sheetHistory, reloadHistory]       = useSheetHistory(user?.role !== 'student' ? planId : null)

  // Escape closes the top-most dialog (the preview modal handles its own)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || previewSheetId) return
      if (repeatSheet) setRepeatSheet(null)
      else if (confirmEnd) setConfirmEnd(false)
      else if (showAddSheet) setShowAddSheet(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewSheetId, repeatSheet, confirmEnd, showAddSheet])

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

  // Student arrived before the tutor opened today's lesson: keep checking
  useEffect(() => {
    if (loading || sessionId || error) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/lesson-plans/${planId}/live-session`)
        if (res.data.sessionId) {
          setSessionId(res.data.sessionId)
          setActiveItemId(res.data.activeItemId)
        }
      } catch { /* keep waiting */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [loading, sessionId, error, planId])

  // Poll for active item changes (teacher might change sheet from sidebar)
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    async function poll() {
      try {
        const res = await api.get(`/sessions/${sessionId}/live-state`)
        if (cancelled) return
        const nextActive = res.data.activeItemId
        setActiveItemId(nextActive)
        if (typeof res.data.studentOnline === 'boolean') setStudentOnline(res.data.studentOnline)
        // The tutor opened a sheet we don't know about yet (added mid-lesson)
        if (nextActive && !planItemIdsRef.current.has(nextActive)) refreshPlan()
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 3000)
    // Also pick up items added/completed by the other side every so often
    const planInterval = setInterval(refreshPlan, 15000)
    return () => { cancelled = true; clearInterval(interval); clearInterval(planInterval) }
  }, [sessionId])

  const planItemIdsRef = useRef(new Set())
  useEffect(() => {
    planItemIdsRef.current = new Set((planDetails?.items || []).map(i => i.id))
  }, [planDetails])

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

  async function refreshPlan() {
    try {
      const planRes = await api.get(`/lesson-plans/${planId}`)
      setPlanDetails(planRes.data)
    } catch { /* keep current view */ }
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

  // Ask first when the student has done this sheet before or it's already planned
  function requestAddSheet(sheet) {
    const h = sheetHistory[sheet.id]
    const inPlan = (planDetails?.items || []).some(i => i.sheetId === sheet.id)
    if (inPlan || h?.completed > 0 || h?.planned) setRepeatSheet(sheet)
    else addSheetToPlan(sheet)
  }

  async function addSheetToPlan(sheet) {
    setAddError('')
    try {
      await api.post(`/lesson-plans/${planId}/items`, {
        sheetId: sheet.id,
        status: 'available',
        // Auto-assign to current session so the sheet shows up in this lesson
        sessionId: sessionId || undefined
      })
      // Refresh plan details to show new item in sidebar
      await refreshPlan()
      reloadHistory()
      setRepeatSheet(null)
      setShowAddSheet(false)
      setSheetSearch('')
    } catch (e) {
      setRepeatSheet(null)
      setAddError(e.response?.data?.error || 'Failed to add sheet')
    }
  }

  function leave() {
    if (user?.role === 'student') navigate('/student')
    else navigate(`${basePath}/students/${planDetails?.studentId || ''}`)
  }

  function endSession() {
    if (user?.role === 'student') return leave()
    setConfirmEnd(true)
  }

  async function confirmEndSession() {
    if (sessionId) {
      try { await api.patch(`/sessions/${sessionId}/live-state`, { activeItemId: null }) } catch { /* leave anyway */ }
    }
    leave()
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-canvas">
        <div role="status" aria-live="polite" className="flex items-center gap-2.5 text-gray-600 text-sm">
          <LoaderCircle className="w-5 h-5 animate-spin text-redwood-600" aria-hidden />
          Setting up your lesson…
        </div>
      </div>
    )
  }

  if (!error && !sessionId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4 bg-cream">
        <div className="card max-w-md text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
            <Hourglass className="icon-lg" aria-hidden />
          </div>
          <h2 className="section-title text-xl mb-2">Your lesson hasn't started yet</h2>
          <p className="text-gray-600 text-base mb-5">
            This page will open the lesson by itself as soon as your tutor starts it.
          </p>
          <button onClick={leave} className="btn-secondary px-5 py-2.5 text-base">
            <ArrowLeft className="icon" aria-hidden /> Back
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4 bg-canvas">
        <div className="card max-w-md text-center">
          <h2 className="section-title text-red-700 mb-2">Could not start the lesson</h2>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={leave} className="btn-secondary">
            <ArrowLeft className="icon" aria-hidden /> Back
          </button>
        </div>
      </div>
    )
  }

  // Filter to items belonging to THIS session. Items with no sessionId
  // (unscheduled pool) are also shown so the tutor can pull from the backlog
  // mid-lesson — items from other sessions are hidden to reduce clutter.
  const allItems = [...(planDetails?.items || [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder) || []
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
        onItemFinalized={refreshPlan}
        studentOnline={studentOnline}
      />

      <ConfirmModal
        open={confirmEnd}
        title="End the lesson?"
        message="The sheet will close on the student's screen too. Remember to mark the session attended from the student's page."
        confirmLabel="End lesson"
        destructive
        onConfirm={() => { setConfirmEnd(false); confirmEndSession() }}
        onClose={() => setConfirmEnd(false)}
      />

      <ConfirmModal
        open={!!repeatSheet}
        title={repeatSheet && sheetHistory[repeatSheet.id]?.completed > 0 ? 'Set this sheet again?' : 'Add this sheet again?'}
        message={repeatSheet ? (() => {
          const h = sheetHistory[repeatSheet.id]
          const who = planDetails?.student?.name || 'This student'
          if (h?.completed > 0) return `${who} has already done "${repeatSheet.title}" (${describeHistory(h).toLowerCase()}). Add it again, for example for revision?`
          return `"${repeatSheet.title}" is already in ${who}'s plan. Add it again anyway?`
        })() : ''}
        confirmLabel="Add again"
        onConfirm={() => addSheetToPlan(repeatSheet)}
        onClose={() => setRepeatSheet(null)}
      />

      {/* Add sheet picker modal */}
      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => setShowAddSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label="Add a sheet to the plan" className="modal-panel w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="section-title">Add a sheet to the plan</h2>
              <button onClick={() => setShowAddSheet(false)} className="btn-ghost p-1.5" aria-label="Close" title="Close">
                <X className="icon-lg" aria-hidden />
              </button>
            </div>
            {addError && <p className="px-5 pt-3 text-sm text-red-700" role="alert">{addError}</p>}
            <div className="p-3 border-b border-gray-100">
              <input
                value={sheetSearch}
                onChange={e => setSheetSearch(e.target.value)}
                placeholder="Search sheets…"
                className="input text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {allSheets.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">Loading sheets…</p>
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
                    // Anywhere in the plan, not just this lesson
                    const inPlan = (planDetails?.items || []).some(i => i.sheetId === sheet.id)
                    const history = sheetHistory[sheet.id]
                    return (
                      <div key={sheet.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
                        <button
                          onClick={() => requestAddSheet(sheet)}
                          className="flex-1 min-w-0 text-left"
                          title={inPlan ? 'Already in this plan' : describeHistory(history) || undefined}
                        >
                          <p className="font-medium text-gray-800 flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{sheet.title}</span>
                            {inPlan && (
                              <span className="badge text-[10px] px-1.5 py-0 flex-shrink-0">
                                <Check className="icon-sm" aria-hidden /> In plan
                              </span>
                            )}
                            <SheetHistoryBadge history={history} />
                          </p>
                          <p className="text-xs text-gray-500 truncate">{sheet.subject} · {sheet.topic}</p>
                        </button>
                        <button
                          onClick={() => setPreviewSheetId(sheet.id)}
                          className="btn-ghost p-1.5 flex-shrink-0"
                          title="Preview"
                          aria-label={`Preview ${sheet.title}`}
                        >
                          <Eye className="icon" aria-hidden />
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
  activeItem, onSelectItem, onEndSession, onAddSheet, onItemFinalized, studentOnline,
}) {
  const [markError, setMarkError] = useState('')
  useEffect(() => { setMarkError('') }, [activeItem?.id])
  const activeItemSheet = activeItem?.sheet
  const isCustomActive  = activeItem && !activeItem.sheet
  const hasInteractive  = !!activeItemSheet

  return (
    <div className="h-screen flex flex-col bg-canvas">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn-ghost p-2"
            title={sidebarOpen ? 'Hide lesson items' : 'Show lesson items'}
            aria-label={sidebarOpen ? 'Hide lesson items' : 'Show lesson items'}
            aria-expanded={sidebarOpen}
          >
            <Menu className="icon-lg" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="font-serif font-semibold text-gray-900 text-base leading-snug line-clamp-2">{planDetails?.title}</h1>
            <p className="text-xs text-gray-500 truncate">
              {isTeacher
                ? `Teaching ${planDetails?.student?.name}`
                : `Learning with ${planDetails?.tutor?.name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isTeacher ? (
            studentOnline !== null && (
              <span
                role="status"
                className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${studentOnline ? 'text-forest-700' : 'text-gray-500'}`}
              >
                <span className={`w-2 h-2 rounded-full ${studentOnline ? 'bg-forest-600' : 'bg-gray-300'}`} aria-hidden />
                {studentOnline ? 'Student connected' : 'Waiting for student'}
              </span>
            )
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-forest-700 font-medium">
              <span className="w-2 h-2 bg-forest-600 rounded-full animate-pulse" aria-hidden />
              Live
            </span>
          )}
          <span className={`${isTeacher ? 'badge-accent' : 'badge'} hidden md:inline-flex`}>
            {isTeacher ? 'Teacher' : 'Student'}
          </span>
          {isTeacher ? (
            <button onClick={onEndSession} className="btn-danger btn-sm">
              <X className="icon-sm" aria-hidden /> End lesson
            </button>
          ) : (
            <button onClick={onEndSession} className="btn-secondary btn-sm">
              <LogOut className="icon-sm" aria-hidden /> Leave lesson
            </button>
          )}
        </div>
      </header>

      {/* Main: sidebar + sheet */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="eyebrow">Lesson items</h2>
                {onAddSheet && (
                  <button
                    onClick={onAddSheet}
                    className="btn-ghost btn-sm text-redwood-700 hover:text-redwood-800 px-2"
                    title="Add a sheet to this plan"
                  >
                    <Plus className="icon-sm" aria-hidden /> Add
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isTeacher ? 'Click an item to open it for both of you' : 'Your tutor will pick what to work on'}
              </p>
            </div>
            <div className="p-2 space-y-0.5">
              {items.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No items in this plan</p>
              )}
              {items.map((item, idx) => {
                const isActive = activeItem?.id === item.id
                const isCustom = !item.sheet && item.customTitle
                const title = isCustom ? item.customTitle : item.sheet?.title
                const isDone = item.status === 'completed'
                return (
                  <button
                    key={item.id}
                    onClick={() => isTeacher && onSelectItem(item.id)}
                    disabled={!isTeacher}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      isActive ? 'bg-redwood-50 border-redwood-200'
                      : isTeacher ? 'hover:bg-gray-50 border-transparent'
                      : 'border-transparent cursor-default'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${
                        isDone ? 'bg-forest-600 text-white'
                        : isActive ? 'bg-redwood-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isDone
                          ? <Check className="icon-sm" aria-label="Completed" />
                          : isCustom
                            ? <ClipboardList className="icon-sm" aria-hidden />
                            : idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug line-clamp-2 break-words ${isActive ? 'text-redwood-700' : 'text-gray-800'}`} title={title || undefined}>
                          {title || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {isCustom ? 'Custom task' : item.sheet?.subject}
                          {isDone && (() => {
                            const sc = item.studentResponses?.[0]?.score
                            const r = sc != null ? Math.round(sc) : null
                            const tone = r == null || r >= 70 ? 'text-forest-700' : r >= 40 ? 'text-amber-700' : 'text-red-700'
                            return (
                              <span className={`${tone} font-medium`}>
                                {' · done'}{r != null ? ` ${r}%` : ''}
                              </span>
                            )
                          })()}
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
              key={activeItem.id}
              sessionId={sessionId}
              itemId={activeItem.id}
              itemStatus={activeItem.status}
              sheetId={activeItemSheet.id}
              isTeacher={isTeacher}
              onCloseSheet={isTeacher ? () => onSelectItem(null) : null}
              onFinalized={onItemFinalized}
            />
          ) : isCustomActive ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="card text-center max-w-md relative">
                {isTeacher && (
                  <button
                    onClick={() => onSelectItem(null)}
                    className="btn-ghost p-1.5 absolute top-3 right-3"
                    title="Close task for both"
                    aria-label="Close task for both"
                  >
                    <X className="icon-lg" aria-hidden />
                  </button>
                )}
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                  <ClipboardList className="icon-lg" aria-hidden />
                </div>
                <h3 className="section-title text-xl mb-2 px-6 break-words">
                  {activeItem.customTitle}
                </h3>
                <p className="badge mb-3">
                  {activeItem.customType === 'ixl_maths' ? 'IXL Maths'
                    : activeItem.customType === 'ixl_english' ? 'IXL English'
                    : activeItem.customType === 'paper' ? 'Paper activity'
                    : 'Custom task'}
                </p>
                <p className="text-base text-gray-600">
                  {activeItem.customType?.startsWith('ixl')
                    ? (isTeacher ? 'The student works on this in IXL.' : 'Open IXL and do this skill. Your tutor will tick it off when you\'re done.')
                    : (isTeacher ? 'This task is done away from the screen.' : 'Your tutor will explain this task and tick it off when you\'re done.')}
                </p>
                {activeItem.customType?.startsWith('ixl') && (
                  <a href="https://www.ixl.com/signin" target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4">
                    Open IXL <ExternalLink className="icon" aria-hidden />
                  </a>
                )}
                {isTeacher && (
                  activeItem.status === 'completed' ? (
                    <p className="mt-4 badge-success text-sm px-3 py-1">
                      <Check className="icon" aria-hidden /> Done
                    </p>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          setMarkError('')
                          // File it under today's lesson
                          await api.put(`/lesson-plans/${planDetails.id}/items/${activeItem.id}`, { status: 'completed', sessionId })
                          onItemFinalized?.()
                        } catch (e) { setMarkError(e.response?.data?.error || 'Could not mark done') }
                      }}
                      className="btn-primary mt-4"
                    >
                      <Check className="icon" aria-hidden /> Mark done
                    </button>
                  )
                )}
                {markError && <p className="text-sm text-red-700 mt-2" role="alert">{markError}</p>}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
                  <BookOpen className="w-6 h-6" aria-hidden />
                </div>
                <h3 className="section-title text-xl mb-2">
                  {isTeacher ? 'Pick an item from the list' : 'Waiting for your tutor'}
                </h3>
                <p className="text-base text-gray-600">
                  {isTeacher
                    ? 'Click any item on the left to start. The student will see the same sheet when you open it.'
                    : 'Your tutor will open a sheet for you in a moment.'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
