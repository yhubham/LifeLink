import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Building2, BedDouble, Users } from 'lucide-react'
import { incomingAlerts, listHospitals } from '../../services/api'
import { ALERT_STYLES, PRIORITY_STYLES, formatTime } from '../../lib/status'

export default function HospitalDashboard() {
  const [alerts, setAlerts] = useState([])
  const [hospitals, setHospitals] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([incomingAlerts(), listHospitals()])
      .then(([a, h]) => {
        setAlerts(a)
        setHospitals(h)
      })
      .catch((e) =>
        setError(e.response?.data?.detail || 'Could not load hospital data.')
      )
  }, [])

  if (error) return <p className="text-red-400">{error}</p>

  const beds = hospitals.reduce((sum, h) => sum + h.available_beds, 0)
  const inbound = alerts.reduce((sum, a) => sum + a.patient_count, 0)

  const cards = [
    ['Waiting pre-alerts', alerts.length, BellRing, 'text-red-400'],
    ['Hospitals online', hospitals.filter((h) => h.is_active).length, Building2, 'text-sky-300'],
    ['Beds available (sim)', beds, BedDouble, 'text-emerald-400'],
    ['Patients inbound', inbound, Users, 'text-amber-300'],
  ]

  return (
    <div>
      <h1 className="text-xl font-bold">Hospital dashboard</h1>
      <p className="text-sm text-slate-500">
        Simulated pre-alerts and mock bed capacity.
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

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Incoming pre-alerts
        </h2>
        <Link to="/hospital/alerts" className="text-xs font-semibold text-emerald-400 hover:underline">
          Open inbox →
        </Link>
      </div>
      <div className="space-y-3">
        {alerts.length === 0 && (
          <p className="rounded-xl border border-navy-700 bg-navy-900 p-6 text-sm text-slate-500">
            No open pre-alerts. Dispatch one from the admin incident detail page.
          </p>
        )}
        {alerts.slice(0, 4).map((a) => (
          <div key={a.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-slate-400">
                {a.incident?.public_code}
              </span>
              <span className="font-semibold">{a.incident?.incident_type}</span>
              <span className="text-xs text-slate-500">
                {a.hospital?.name} · ETA {a.eta_minutes ?? '—'} min
              </span>
              <span
                className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[a.alert_status]}`}
              >
                {a.alert_status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.patients.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 text-xs"
                >
                  {p.priority_level && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLES[p.priority_level]}`}
                    >
                      {p.priority_level}
                    </span>
                  )}
                  {p.display_name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{formatTime(a.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
