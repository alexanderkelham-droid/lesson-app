import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RedwoodLogo from './shared/RedwoodLogo'

export default function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Already logged in → redirect
  if (user) {
    navigate(`/${user.role}`, { replace: true })
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const u = await login(email.trim(), password)
      navigate(`/${u.role}`, { replace: true })
    } catch (err) {
      const e = err.response?.data?.error
      const msg = typeof e === 'string'
        ? e
        : (e?.message || err.message || 'Login failed')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream relative overflow-hidden flex items-center justify-center p-4 font-sans">
      {/* Decorative background blobs */}
      <div className="absolute -top-32 -left-32 w-[450px] h-[450px] bg-forest-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-redwood-200/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Back to home link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-forest-700 hover:text-redwood-600 transition-colors mb-4"
        >
          ← Back to home
        </Link>

        <div className="bg-white rounded-2xl shadow-xl border-t-4 border-redwood-600 p-8">
          <div className="text-center mb-8">
            <RedwoodLogo variant="stacked" size="lg" className="mb-2" />
            <p className="text-forest-700 text-sm mt-3">Sign in to the lesson portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-forest-800 mb-1">Email address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-forest-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-redwood-500 focus:border-transparent"
                placeholder="you@example.com" required autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-forest-800 mb-1">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-forest-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-redwood-500 focus:border-transparent"
                placeholder="••••••••" required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-redwood-600 hover:bg-redwood-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <details className="mt-6 p-3 bg-cream rounded-lg text-xs text-forest-600 space-y-1 border border-forest-100">
              <summary className="font-semibold text-forest-700 cursor-pointer">Demo accounts (dev only)</summary>
              <div className="pt-2 space-y-1">
                <p>manager@lessonapp.com — Manager</p>
                <p>tutor1@lessonapp.com — Tutor</p>
                <p>alice@lessonapp.com — Student</p>
                <p>bob@lessonapp.com — Student</p>
                <p className="text-forest-500 italic mt-1">Password: password123</p>
              </div>
            </details>
          )}
        </div>

        <p className="text-center text-xs text-forest-600 mt-6">
          Need help? Call us on{' '}
          <a href="tel:03330507765" className="text-redwood-600 hover:text-redwood-700 font-semibold">
            0333 050 7765
          </a>
        </p>
      </div>
    </div>
  )
}
