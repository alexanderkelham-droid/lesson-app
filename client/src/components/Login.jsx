import { useState } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, CircleAlert, LoaderCircle } from 'lucide-react'
import RedwoodLogo from './shared/RedwoodLogo'

export default function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Already logged in: redirect (declarative — calling navigate() during
  // render causes an infinite re-render loop).
  if (user) {
    return <Navigate to={`/${user.role}`} replace />
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
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="icon" aria-hidden />
          Back to home
        </Link>

        <div className="modal-panel p-7 sm:p-8">
          <div className="flex flex-col items-center text-center mb-7">
            <RedwoodLogo variant="mark" size="lg" />
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-gray-900 mt-4">
              Welcome back
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">Sign in to the Redwood Scholars lesson portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="label">Email address</label>
              <input
                id="login-email"
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input py-2.5"
                placeholder="you@example.com" autoComplete="email" required autoFocus
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <input
                id="login-password"
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input py-2.5"
                placeholder="Your password" autoComplete="current-password" required
                aria-invalid={error ? true : undefined}
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg border border-red-200">
                <CircleAlert className="icon mt-0.5" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {loading && <LoaderCircle className="icon animate-spin" aria-hidden />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Need help signing in? Call us on{' '}
          <a href="tel:03330507765" className="link font-medium whitespace-nowrap">
            0333 050 7765
          </a>
        </p>
      </div>
    </div>
  )
}
