import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import RedwoodLogo from './RedwoodLogo'

const roleBadge = {
  student: 'bg-forest-100 text-forest-700',
  tutor:   'bg-redwood-100 text-redwood-700',
  manager: 'bg-forest-700 text-white',
}
const homeRoute = { student: '/student', tutor: '/tutor', manager: '/manager' }

export default function Navbar({ title, onShowTour }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="bg-white border-b-2 border-redwood-100 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={homeRoute[user?.role] || '/'}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <RedwoodLogo variant="wordmark" size="sm" />
          </Link>
          {title && (
            <>
              <span className="text-forest-200 hidden sm:block">/</span>
              <span className="text-forest-700 hidden sm:block font-medium truncate">{title}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize hidden sm:inline-flex ${roleBadge[user.role]}`}>
                {user.role}
              </span>
              <span className="text-sm text-forest-800 font-medium hidden md:block">{user.name}</span>
            </>
          )}
          {onShowTour && (
            <button
              onClick={onShowTour}
              className="w-8 h-8 flex items-center justify-center text-forest-700 hover:text-redwood-600 hover:bg-redwood-50 rounded-full font-semibold transition-colors"
              title="Show tour"
              aria-label="Show tour"
            >
              ?
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-forest-700 hover:text-redwood-600 hover:bg-redwood-50 transition-colors px-3 py-1.5 rounded-md font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
