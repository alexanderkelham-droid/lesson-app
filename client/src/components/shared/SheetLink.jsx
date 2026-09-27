import { useState } from 'react'
import SheetPreviewModal from './SheetPreviewModal'

// A sheet title that opens the preview pop-up (digital + original scan).
export default function SheetLink({ sheetId, children, className = '' }) {
  const [open, setOpen] = useState(false)
  if (!sheetId) return <span className={className}>{children}</span>
  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        className={`text-left hover:text-redwood-700 hover:underline underline-offset-2 ${className}`}
        title="Preview this sheet"
      >
        {children}
      </button>
      {open && <SheetPreviewModal sheetId={sheetId} onClose={() => setOpen(false)} />}
    </>
  )
}
