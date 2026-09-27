import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './shared/LoadingSpinner'

// `role` = one allowed role; `roles` = several (e.g. ['manager', 'tutor'])
export default function ProtectedRoute({ children, role, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role}`} replace />

  return children
}
