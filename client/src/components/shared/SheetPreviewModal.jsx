import { useState, useEffect } from 'react'
import api from '../../lib/api'
import LoadingSpinner from './LoadingSpinner'

export default function SheetPreviewModal({ sheetId, onClose, onAdd, alreadyAdded }) {
  const [sheet, setSheet]   = useState(null)
  const [loading, setLoading] = useState(true)

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">{sheet?.title || 'Loading...'}</h2>
            {sheet && (
              <p className="text-xs text-gray-500">{sheet.subject} · {sheet.topic} · {sheet.sheetType}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <LoadingSpinner /> : (
            <div className="space-y-3">
              {(sheet?.contentJson?.questions || []).map((q, i) => (
                <div key={q.id || i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-brand-600 text-white rounded-full text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-relaxed">{q.prompt}</p>
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
                        <p className="text-xs text-green-600 mt-1.5">
                          <span className="font-medium">Answer:</span> {q.correct.join(' / ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {sheet?.contentJson?.questions?.length === 0 && (
                <p className="text-center text-gray-400 py-8">This sheet has no questions yet.</p>
              )}
            </div>
          )}
        </div>

        {onAdd && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary text-sm">Close</button>
            {alreadyAdded ? (
              <span className="text-sm text-green-600 font-medium px-3 py-2">Already in plan</span>
            ) : (
              <button onClick={() => { onAdd(sheet); onClose() }} className="btn-primary text-sm">
                Add to Plan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
