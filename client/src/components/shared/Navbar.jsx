import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { CircleHelp, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import RedwoodLogo from './RedwoodLogo'

const homeRoute = { student: '/student', tutor: '/tutor', manager: '/manager' }

// Role-aware primary links (only routes that exist in App.jsx)
const roleLinks = {
  manager: [
    { to: '/manager', label: 'Dashboard', end: true },
    { to: '/manager/sheets', label: 'Sheet library' },
  ],
  tutor: [
    { to: '/tutor', label: 'Dashboard', end: true },
  ],
  student: [
    { to: '/student', label: 'My learning', end: true },
  ],
}

function linkClass({ isActive }) {
  return `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-redwood-50 text-redwood-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  }`
}

export default function Navbar({ title, onShowTour }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = roleLinks[user?.role] || []

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={homeRoute[user?.role] || '/'}
            className="flex items-center flex-shrink-0 rounded-md hover:opacity-80 transition-opacity"
          >
            <RedwoodLogo variant="wordmark" size="sm" />
          </Link>
          {title && (
            <>
              <span className="h-5 w-px bg-gray-200 hidden sm:block" aria-hidden="true" />
              <span className="text-sm text-gray-700 font-medium truncate hidden sm:block">{title}</span>
            </>
          )}
          {links.length > 1 && (
            <nav className="hidden md:flex items-center gap-1 ml-3" aria-label="Portal">
              {links.map(l => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>{l.label}</NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {user && (
            <div className="hidden md:flex items-center gap-2 mr-1">
              <span className="text-sm text-gray-800 font-medium">{user.name}</span>
              <span className="badge capitalize">{user.role}</span>
            </div>
          )}
          {onShowTour && (
            <button
              type="button"
              onClick={onShowTour}
              className="btn-ghost"
              title="Show tour"
              aria-label="Show tour"
            >
              <CircleHelp className="icon-lg" aria-hidden />
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="btn-ghost hidden sm:inline-flex"
            >
              <LogOut className="icon" aria-hidden />
              Sign out
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              className="btn-ghost sm:hidden"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              title={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="icon-lg" aria-hidden /> : <Menu className="icon-lg" aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {user && menuOpen && (
        <div className="sm:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium text-gray-900 truncate">{user.name}</span>
              <span className="badge capitalize">{user.role}</span>
            </div>
            {title && <p className="eyebrow pb-1">{title}</p>}
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMenuOpen(false)}
                className={p => `block ${linkClass(p)}`}
              >
                {l.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            >
              <LogOut className="icon" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}
      {links.length > 1 && (
        <nav className="hidden sm:flex md:hidden items-center gap-1 px-4 sm:px-6 pb-2 -mt-1" aria-label="Portal">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>{l.label}</NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
