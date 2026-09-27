import { LoaderCircle } from 'lucide-react'

export default function LoadingSpinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`} role="status" aria-live="polite">
      <LoaderCircle className="w-7 h-7 animate-spin text-redwood-600" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  )
}
