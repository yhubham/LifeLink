import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Building2, BedDouble, Users } from 'lucide-react'
import { incomingAlerts, listHospitals } from '../../services/api'
import { ALERT_STYLES, PRIORITY_STYLES, formatTime } from '../../lib/status'
import { useRealtime } from '../../hooks/useRealtime'
import LiveBadge from '../../components/common/LiveBadge'
import HospitalFinder from '../../components/common/HospitalFinder'

export default function HospitalDashboard() {
  const [alerts, setAlerts] = useState([])
  const [hospitals, setHospitals] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    return Promise.all([incomingAlerts(), listHospitals()])
      .then(([a, h]) => {
        setAlerts(a)
        setHospitals(h)
        setError('')
      })
      .catch((e) =>
        setError(e.response?.data?.detail || 'Could not load hospital data.')
      )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const connected = useRealtime('hospital', (message) => {
    const type = message.type || ''
    if (
      type.startsWith('hospital.') ||
      type === 'patient.added' ||
      type.startsWith('incident.')
    ) {
      load()
    }
  })

  if (error && hospitals.length === 0) return <p className="text-red-400">{error}</p>

  const beds = hospitals.reduce((sum, h) => sum + h.available_beds, 0)
  const inbound = alerts.reduce((sum, a) => sum + a.patient_count, 0)

  const cards = [
    ['Waiting pre-alerts', alerts.length, BellRing, 'text-red-400'],
    ['Hospitals online', hospitals.length, Building2, 'text-emerald-400'],
    ['Free beds (mock)', beds, BedDouble, 'text-sky-300'],
    ['Patients inbound', inbound, Users, 'text-amber-300'],
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Hospital dashboard</h1>
        <LiveBadge connected={connected} />
      </div>
      <p className="text-sm text-slate-500">
        Pre-alerts and capacity for the simulated city network.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, color]) => (
          <div key={label} className="rounded-xl border border-navy-700 bg-navy-900 p-5">
            <Icon size={18} className={color} />
            <div className="mt-2 text-3xl font-extrabold">{value}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <HospitalFinder title="Hospital network" />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Waiting pre-alerts
        </h2>
        <Link to="/hospital/alerts" className="text-xs font-bold text-emerald-400 hover:underline">
          View all →
        </Link>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-navy-700">
        {alerts.length === 0 && (
          <p className="bg-navy-900 p-6 text-sm text-slate-500">
            No open pre-alerts. The control room will send one when an ambulance is
            transporting patients.
          </p>
        )}
        {alerts.slice(0, 5).map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 border-b border-navy-800 bg-navy-900 px-4 py-3 last:border-0"
          >
            <span className="font-mono text-xs text-slate-400">
              {a.incident?.public_code}
            </span>
            <span className="text-sm font-semibold">{a.incident?.incident_type}</span>
            <span className="text-xs text-slate-500">ETA {a.eta_minutes ?? '—'} min</span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {a.patients.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    p.priority_level ? PRIORITY_STYLES[p.priority_level] : 'bg-navy-800 text-slate-300'
                  }`}
                  title={p.display_name}
                >
                  {p.priority_level || p.display_name}
                </span>
              ))}
              <span className={`ml-1 rounded border px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[a.alert_status]}`}>
                {a.alert_status}
              </span>
            </div>
            <span className="text-xs text-slate-500">{formatTime(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
