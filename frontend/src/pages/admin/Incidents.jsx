import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { listIncidents } from '../../services/api'
import { STATUS_STYLES, formatTime } from '../../lib/status'

const STATUSES = ['', 'REPORTED', 'VERIFIED', 'ASSIGNED', 'RESPONDING', 'ARRIVED', 'CLOSED', 'CANCELLED']

export default function Incidents() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    listIncidents(status ? { incident_status: status } : {})
      .then(setIncidents)
      .catch((e) => setError(e.response?.data?.detail || 'Could not load incidents.'))
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Incidents</h1>
        <select
          value={status}
          onChange={(e) => {
            const v = e.target.value
            setParams(v ? { status: v } : {})
          }}
          className="ml-auto rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setLoading(true)
            listIncidents(status ? { incident_status: status } : {})
              .then(setIncidents)
              .finally(() => setLoading(false))
          }}
          className="rounded-lg border border-navy-700 p-2 text-slate-400 hover:bg-navy-800"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Reported</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} className="border-t border-navy-800 bg-navy-950/40 hover:bg-navy-900">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to={`/admin/incidents/${inc.id}`} className="text-sky-300 hover:underline">
                      {inc.public_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold">{inc.incident_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[inc.status]}`}
                    >
                      {inc.status}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-400">
                    {inc.address || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatTime(inc.reported_at)}</td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No incidents match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
