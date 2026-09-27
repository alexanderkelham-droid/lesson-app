// Sheet-level extras produced by digitisation: general instructions, and a
// notice when the reading text lives only on the printed original (e.g.
// copyrighted extracts that can't be reproduced on screen).
import { FileText, Image as ImageIcon } from 'lucide-react'

export default function SheetIntro({ content, print = false }) {
  if (!content) return null
  const { instructions, passageOnOriginal } = content
  if (!instructions && !passageOnOriginal) return null
  if (print) {
    return (
      <div className="sheet-intro">
        {instructions && <p><strong>Instructions:</strong> {instructions}</p>}
        {passageOnOriginal && <p><em>Use the reading text on the original worksheet.</em></p>}
      </div>
    )
  }
  return (
    <div className="space-y-2 mb-3">
      {instructions && (
        <div className="rounded-lg bg-white border border-gray-200 px-4 py-3 text-base text-gray-700">
          <span className="font-semibold text-gray-900">Instructions: </span>{instructions}
        </div>
      )}
      {passageOnOriginal && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-base text-amber-800 flex items-start gap-2">
          <FileText className="icon-lg mt-0.5" aria-hidden />
          <span>The reading text for this sheet is on your printed worksheet. Read it before you answer.</span>
        </div>
      )}
    </div>
  )
}

// Small hint under a question that depends on a picture/diagram
export function ImageHint({ question, print = false }) {
  if (!question?.requiresImage) return null
  return print
    ? <p className="image-hint"><em>(Look at the picture on the original worksheet.)</em></p>
    : (
      <p className="text-sm text-amber-800 mt-1.5 flex items-center gap-1.5">
        <ImageIcon className="icon" aria-hidden />
        This question uses a picture. Look at your printed worksheet.
      </p>
    )
}
