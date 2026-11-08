import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { trackIncident } from '../../services/api'

const STEPS = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'RESPONDING', 'ARRIVED', 'CLOSED']

export default function Track() {
  const { id } = useParams()
  const [code, setCode] = useState(id || '')
  const [incident, setIncident] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function lookup(target) {
    if (!target) return
    setLoading(true)
    setError('')
    try {
      const data = await trackIncident(target.trim())
      setIncident(data)
    } catch {
      setIncident(null)
      setError('No incident found for that code.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) lookup(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const currentIndex = incident ? STEPS.indexOf(incident.status) : -1

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
        ← Home
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Track incident</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          lookup(code)
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="LL-2026-0001"
          className="flex-1 rounded-lg border border-navy-700 bg-navy-900 px-3 py-2.5 font-mono uppercase outline-none focus:border-red-500"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-semibold hover:bg-red-500"
        >
          {loading ? <Loader2 className="animate-spin" size={17} /> : <Search size={17} />}
          Track
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {incident && (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-900 p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono font-bold text-emerald-400">
              {incident.public_code}
            </span>
            <span className="text-sm text-slate-400">{incident.incident_type}</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">{incident.description}</p>

          <ol className="mt-6 space-y-3">
            {STEPS.map((step, i) => {
              const done = i <= currentIndex
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? 'bg-emerald-500 text-navy-950'
                        : 'bg-navy-800 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={done ? 'text-slate-100' : 'text-slate-500'}>
                    {step.charAt(0) + step.slice(1).toLowerCase()}
                  </span>
                  {i === currentIndex && (
                    <span className="ml-auto rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                      CURRENT
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
