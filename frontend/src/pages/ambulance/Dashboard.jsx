import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navigation, Clock, CheckCircle2, Ambulance as AmbulanceIcon } from 'lucide-react'
import { listAmbulances, myAssignments } from '../../services/api'
import { AMBULANCE_STYLES, ASSIGNMENT_STYLES, formatTime } from '../../lib/status'

export default function AmbulanceDashboard() {
  const [assignments, setAssignments] = useState([])
  const [fleet, setFleet] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([myAssignments(), listAmbulances()])
      .then(([asg, amb]) => {
        setAssignments(asg)
        setFleet(amb)
      })
      .catch((e) =>
        setError(e.response?.data?.detail || 'Could not load ambulance data.')
      )
  }, [])

  if (error) return <p className="text-red-400">{error}</p>

  const available = fleet.filter((a) => a.status === 'AVAILABLE').length
  const enRoute = assignments.filter((a) => a.assignment_status === 'EN_ROUTE').length
  const arrived = assignments.filter((a) => a.assignment_status === 'ARRIVED').length

  const cards = [
    ['Active assignments', assignments.length, Navigation, 'text-sky-300'],
    ['En route', enRoute, Clock, 'text-amber-300'],
    ['On scene', arrived, CheckCircle2, 'text-teal-300'],
    ['Fleet available', available, AmbulanceIcon, 'text-emerald-400'],
  ]

  return (
    <div>
      <h1 className="text-xl font-bold">Crew dashboard</h1>
      <p className="text-sm text-slate-500">
        Simulated assignments dispatched by the control room.
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

      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
        My active assignments
      </h2>
      <div className="overflow-hidden rounded-xl border border-navy-700">
        {assignments.length === 0 && (
          <p className="bg-navy-900 p-6 text-sm text-slate-500">
            No active assignments. The control room will dispatch you from the incident
            detail page.
          </p>
        )}
        {assignments.map((a) => (
          <Link
            key={a.id}
            to={`/ambulance/incident/${a.incident_id}`}
            className="flex flex-wrap items-center gap-3 border-b border-navy-800 bg-navy-900 px-4 py-3 last:border-0 hover:bg-navy-800"
          >
            <span className="font-mono text-xs text-slate-400">
              {a.incident_public_code}
            </span>
            <span className="text-sm font-semibold">{a.incident_type}</span>
            <span className="text-xs text-slate-500">{a.call_sign}</span>
            <span className="ml-auto text-xs text-slate-500">
              {formatTime(a.assigned_at)}
            </span>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${ASSIGNMENT_STYLES[a.assignment_status]}`}
            >
              {a.assignment_status}
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
        Fleet status
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fleet.map((a) => (
          <div key={a.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="flex items-center gap-2">
              <span className="font-bold">{a.call_sign}</span>
              <span className="text-xs text-slate-500">{a.vehicle_number}</span>
              <span
                className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-bold ${AMBULANCE_STYLES[a.status]}`}
              >
                {a.status}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {a.latitude != null
                ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`
                : 'No GPS position'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
