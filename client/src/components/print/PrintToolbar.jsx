import { openOriginalPdf } from '../../lib/print'
import { FileText, Printer } from 'lucide-react'

// Screen-only toolbar for the print views (hidden when printing).
export function PrintToolbar({ title, children }) {
  return (
    <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 shadow-card mb-4">
      <div className="max-w-[210mm] mx-auto px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <p className="font-semibold text-gray-900 text-sm leading-snug break-words flex-1 min-w-[10rem]">{title}</p>
        {children}
        <button onClick={() => window.print()} className="btn-primary btn-sm">
          <Printer className="icon-sm" aria-hidden /> Print / Save as PDF
        </button>
      </div>
    </div>
  )
}

export function ToggleChip({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 px-2 py-1 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-redwood-600" />
      {label}
    </label>
  )
}

export function OriginalPdfButton({ sheet }) {
  if (!sheet?.hasOriginal) return null
  return (
    <button
      onClick={() => openOriginalPdf(sheet)}
      className="btn-secondary btn-sm whitespace-nowrap"
      title="Open the original scanned worksheet"
    >
      <FileText className="icon-sm" aria-hidden /> Original PDF
    </button>
  )
}

export function PrintMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="card text-center max-w-md">{children}</div>
    </div>
  )
}
