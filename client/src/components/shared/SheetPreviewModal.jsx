import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'
import SheetIntro, { ImageHint } from './SheetIntro'
import { useAuth } from '../../context/AuthContext'
import { AlertTriangle, ExternalLink, FileText, Pencil, Printer, X, BookOpen, Check } from 'lucide-react'
import { printSheetUrl, openInNewTab, openOriginalPdf, originalPdfEmbedUrl } from '../../lib/print'

export default function SheetPreviewModal({ sheetId, onClose, onAdd, alreadyAdded, initialView = 'digital' }) {
  const [sheet, setSheet]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(initialView) // 'digital' | 'original'
  const [original, setOriginal] = useState({ url: null, error: '', loading: false })
  const { user } = useAuth()
  const isStaff = user?.role === 'manager' || user?.role === 'tutor'
  const isManager = user?.role === 'manager'

  // Escape closes the preview
  useEffect(() => {
    if (!sheetId) return
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetId, onClose])

  // Load the original scan when that view is chosen
  useEffect(() => {
    if (!sheetId || view !== 'original' || !sheet?.hasOriginal) return
    let revoke = null, cancelled = false
    setOriginal({ url: null, error: '', loading: true })
    originalPdfEmbedUrl(sheetId)
      .then(r => { revoke = r.revoke; if (!cancelled) setOriginal({ url: r.url, error: '', loading: false }) })
      .catch(() => !cancelled && setOriginal({ url: null, error: 'Could not load the original PDF', loading: false }))
    return () => { cancelled = true; revoke?.() }
  }, [sheetId, view, sheet?.hasOriginal])

  useEffect(() => { setView(initialView) }, [sheetId, initialView])
  // Paper-only sheets have no digital version yet: show the scan straight away
  useEffect(() => {
    if (sheet?.id === sheetId && sheet?.contentJson?.printOnly && sheet?.hasOriginal) setView('original')
  }, [sheet, sheetId])

  useEffect(() => {
    if (!sheetId) return
    setLoading(true)
    api.get(`/sheets/${sheetId}`)
      .then(res => setSheet(res.data))
      .finally(() => setLoading(false))
  }, [sheetId])

  if (!sheetId) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-preview-title"
        className={`modal-panel w-full flex flex-col ${view === 'original' ? 'max-w-4xl h-[90vh]' : 'max-w-2xl max-h-[85vh]'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="sheet-preview-title" className="section-title leading-snug break-words">{sheet?.title || 'Loading…'}</h2>
              {sheet && (
                <p className="text-xs text-gray-500 truncate" title={`${sheet.subject} · ${sheet.topic} · ${sheet.sheetType}`}>
                  {sheet.subject} · {sheet.topic} · <span className="capitalize">{sheet.sheetType}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} className="btn-ghost p-1.5 -mr-1 flex-shrink-0" aria-label="Close" title="Close">
              <X className="icon-lg" aria-hidden />
            </button>
          </div>
          {isStaff && sheet && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {sheet.hasOriginal && (
                <div className="tabs text-xs" role="tablist">
                  {[['digital', 'Digital'], ['original', 'Original scan']].map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={view === key}
                      onClick={() => setView(key)}
                      className={`tab text-xs px-2.5 py-1 inline-flex items-center gap-1 ${view === key ? 'tab-active' : ''}`}
                    >
                      {key === 'original' && <FileText className="icon-sm" aria-hidden />}
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {sheet.hasOriginal && view === 'original' && (
                  <button
                    onClick={() => openOriginalPdf(sheet)}
                    className="btn-secondary btn-sm"
                    title="Open the original in a new tab (to print or download)"
                  >
                    <ExternalLink className="icon-sm" aria-hidden /> Open
                  </button>
                )}
                <button
                  onClick={() => openInNewTab(printSheetUrl(sheet.id))}
                  className="btn-secondary btn-sm"
                  title="Printable A4 version (opens in a new tab)"
                >
                  <Printer className="icon-sm" aria-hidden /> Print
                </button>
                {isManager && (
                  <Link
                    to={`/manager/sheets/${sheet.id}/edit`}
                    onClick={() => onClose?.()}
                    className="btn-secondary btn-sm"
                    title="Edit this sheet"
                  >
                    <Pencil className="icon-sm" aria-hidden /> Edit
                  </Link>
                )}
              </div>
            </div>
          )}
          {isStaff && sheet?.needsReview && (
            <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle className="icon-sm mt-0.5" aria-hidden />
              <span>
                This digital copy hasn't been checked yet and may contain mistakes.
                {sheet.hasOriginal ? ' If in doubt, print the original scan instead.' : ''}
              </span>
            </p>
          )}
        </div>

        {view === 'original' && sheet?.hasOriginal ? (
          <div className="flex-1 min-h-0 bg-gray-100 rounded-b-2xl overflow-hidden">
            {original.loading && <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>}
            {original.error && <p className="p-6 text-sm text-red-700">{original.error}</p>}
            {original.url && (
              <iframe src={`${original.url.split('#')[0]}#navpanes=0&view=FitH`} title={`Original: ${sheet.title}`} className="w-full h-full border-0" />
            )}
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <LoadingSpinner /> : (
            <div className="space-y-3">
              <SheetIntro content={sheet?.contentJson} />
              {/* Reading passage (if any) */}
              {sheet?.contentJson?.passage && (
                <div className="rounded-lg border border-gray-200 border-l-4 border-l-redwood-600 bg-cream p-4">
                  <p className="eyebrow text-redwood-700 mb-2 flex items-center gap-1.5">
                    <BookOpen className="icon-sm" aria-hidden /> Reading passage
                  </p>
                  <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">
                    {sheet.contentJson.passage}
                  </div>
                </div>
              )}
              {(sheet?.contentJson?.questions || []).map((q, i) => (
                <div key={q.id || i} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-6 h-6 bg-redwood-50 text-redwood-700 rounded-full text-xs font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-relaxed">{q.prompt}</p>
                      <ImageHint question={q} />
                      {q.options && q.options.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                          {q.options.map((opt, j) => (
                            <li key={j}>
                              <span className="font-mono text-gray-400 mr-1">{String.fromCharCode(97 + j)})</span>
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.correct?.length > 0 && (
                        <p className="text-xs text-forest-700 mt-1.5">
                          <span className="font-medium">Answer:</span> {q.correct.join(' / ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {sheet?.contentJson?.questions?.length === 0 && (
                <p className="text-center text-gray-500 py-8">This sheet has no questions yet.</p>
              )}
            </div>
          )}
        </div>
        )}

        {onAdd && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary">Close</button>
            {alreadyAdded ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-forest-700 font-medium px-3 py-2">
                <Check className="icon" aria-hidden /> Already in plan
              </span>
            ) : (
              <button onClick={() => { onAdd(sheet); onClose() }} className="btn-primary">
                Add to plan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
