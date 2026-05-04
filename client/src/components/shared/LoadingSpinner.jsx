export default function LoadingSpinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
    </div>
  )
}
