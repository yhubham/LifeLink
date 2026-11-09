import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Users, AlertTriangle, Clock } from 'lucide-react'
import { getStats, listIncidents } from '../../services/api'
import { STATUS_STYLES, formatTime } from '../../lib/status'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getStats(), listIncidents()])
      .then(([s, incidents]) => {
        setStats(s)
        setRecent(incidents.slice(0, 6))
      })
      .catch((e) =>
        setError(e.response?.data?.detail || 'Could not load control-room data.')
      )
  }, [])

  if (error) return <p className="text-red-400">{error}</p>
  if (!stats) return <p className="text-slate-500">Loading…</p>

  const cards = [
    ['Active incidents', stats.active, AlertTriangle, 'text-red-400'],
    ['Reported today', stats.today, Clock, 'text-amber-300'],
    ['Total incidents', stats.total, Activity, 'text-sky-300'],
    ['Patients tracked', stats.patients, Users, 'text-emerald-400'],
  ]

  return (
    <div>
      <h1 className="text-xl font-bold">Overview</h1>
      <p className="text-sm text-slate-500">Live picture of the simulated response network.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, color]) => (
          <div key={label} className="rounded-xl border border-navy-700 bg-navy-900 p-5">
            <Icon size={18} className={color} />
            <div className="mt-2 text-3xl font-extrabold">{value}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(stats.by_status).map(([status, count]) => (
          <Link
            key={status}
            to={`/admin/incidents?status=${status}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${STATUS_STYLES[status]}`}
          >
            {status} · {count}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
            Recent incidents
          </h2>
          <div className="overflow-hidden rounded-xl border border-navy-700">
            {recent.length === 0 && (
              <p className="p-6 text-sm text-slate-500">
                No incidents yet — report one from the public SOS page.
              </p>
            )}
            {recent.map((inc) => (
              <Link
                key={inc.id}
                to={`/admin/incidents/${inc.id}`}
                className="flex items-center gap-3 border-b border-navy-800 bg-navy-900 px-4 py-3 last:border-0 hover:bg-navy-800"
              >
                <span className="font-mono text-xs text-slate-400">{inc.public_code}</span>
                <span className="text-sm font-semibold">{inc.incident_type}</span>
                <span className="ml-auto text-xs text-slate-500">{formatTime(inc.reported_at)}</span>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[inc.status]}`}
                >
                  {inc.status}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
            By type
          </h2>
          <div className="space-y-2 rounded-xl border border-navy-700 bg-navy-900 p-4">
            {Object.entries(stats.by_type).map(([type, count]) => {
              const max = Math.max(...Object.values(stats.by_type))
              return (
                <div key={type}>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{type}</span>
                    <span>{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-navy-800">
                    <div
                      className="h-1.5 rounded-full bg-red-500"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {Object.keys(stats.by_type).length === 0 && (
              <p className="text-sm text-slate-500">No data yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
