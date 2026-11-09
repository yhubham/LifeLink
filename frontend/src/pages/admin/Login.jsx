import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Activity, LogIn } from 'lucide-react'
import { login } from '../../services/api'
import { homeForRole, useAuthStore } from '../../context/authStore'

const DEMO_ACCOUNTS = [
  ['Admin', 'admin@lifelink.demo'],
  ['Ambulance', 'crew1@lifelink.demo'],
  ['Hospital', 'hospital@lifelink.demo'],
  ['Police', 'police@lifelink.demo'],
]

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('admin@lifelink.demo')
  const [password, setPassword] = useState('Demo@1234')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await login(email, password)
      setAuth(data)
      navigate(homeForRole(data.role))
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed — is the API running?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Activity className="text-red-500" />
          <span className="text-xl font-bold">LifeLink</span>
          <span className="rounded bg-navy-800 px-2 py-0.5 text-xs text-slate-400">
            CONTROL ROOM
          </span>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-navy-700 bg-navy-900 p-6"
        >
          <h1 className="text-lg font-bold">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-400">
            Admin, ambulance, hospital and police accounts.
          </p>

          <label className="mt-5 block text-sm font-semibold text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 outline-none focus:border-red-500"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 outline-none focus:border-red-500"
          />

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-bold hover:bg-red-500 disabled:opacity-60"
          >
            <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map(([label, mail]) => (
            <button
              key={mail}
              onClick={() => {
                setEmail(mail)
                setPassword('Demo@1234')
              }}
              className="rounded-lg border border-navy-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-navy-800"
            >
              {label} demo
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
