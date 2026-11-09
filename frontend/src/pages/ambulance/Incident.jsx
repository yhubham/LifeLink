import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Navigation,
  Play,
  Square,
  Stethoscope,
} from 'lucide-react'
import {
  getIncident,
  myAssignments,
  simulateStep,
  updateAssignment,
} from '../../services/api'
import {
  ASSIGNMENT_STYLES,
  PRIORITY_STYLES,
  STATUS_STYLES,
  formatTime,
} from '../../lib/status'

export default function AmbulanceIncident() {
  const { id } = useParams()
  const [incident, setIncident] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [sim, setSim] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [inc, mine] = await Promise.all([getIncident(id), myAssignments()])
      setIncident(inc)
      setAssignment(mine.find((a) => a.incident_id === id) || null)
      setError('')
    } catch (e) {
      setError(e.response?.data?.detail || 'Incident not found.')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!simulating || !assignment) return
    const timer = setInterval(async () => {
      try {
        const res = await simulateStep(assignment.id)
        setSim(res)
        setAssignment((a) => (a ? { ...a, assignment_status: res.assignment_status } : a))
        if (res.arrived) {
          setSimulating(false)
          load()
        }
      } catch {
        setSimulating(false)
      }
    }, 1800)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating, assignment?.id, load])

  async function change(status) {
    if (!assignment) return
    setBusy(true)
    try {
      const updated = await updateAssignment(assignment.id, status)
      setAssignment(updated)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function oneStep() {
    if (!assignment) return
    setBusy(true)
    try {
      const res = await simulateStep(assignment.id)
      setSim(res)
      setAssignment((a) => (a ? { ...a, assignment_status: res.assignment_status } : a))
      if (res.arrived) load()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="text-red-400">{error}</p>
  if (!incident) return <p className="text-slate-500">Loading…</p>

  const status = assignment?.assignment_status
  const finished = status === 'COMPLETED' || status === 'CANCELLED'

  return (
    <div>
      <Link to="/ambulance/dashboard" className="text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={14} className="inline" /> Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold">{incident.public_code}</h1>
        <span className={`rounded border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[incident.status]}`}>
          {incident.status}
        </span>
        <span className="text-slate-400">{incident.incident_type}</span>
        <span className="text-xs text-slate-500">{formatTime(incident.reported_at)}</span>
        {assignment && (
          <span className={`ml-auto rounded border px-2.5 py-0.5 text-xs font-bold ${ASSIGNMENT_STYLES[assignment.assignment_status]}`}>
            {assignment.call_sign} · {assignment.assignment_status}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-400">
        📍 {incident.address || `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`}
      </p>
      {incident.description && (
        <p className="mt-2 max-w-2xl rounded-lg border border-navy-800 bg-navy-900 p-3 text-sm text-slate-300">
          {incident.description}
        </p>
      )}

      {!assignment && (
        <p className="mt-6 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-300">
          This incident is not assigned to your unit yet.
        </p>
      )}

      {assignment && !finished && (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-900 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {status === 'ASSIGNED' && (
              <button
                onClick={() => change('ACCEPTED')}
                disabled={busy}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold hover:bg-sky-500 disabled:opacity-60"
              >
                Accept assignment
              </button>
            )}
            {(status === 'ASSIGNED' || status === 'ACCEPTED') && (
              <button
                onClick={() => change('EN_ROUTE')}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-navy-950 hover:bg-amber-400 disabled:opacity-60"
              >
                <Navigation size={15} /> Start en route
              </button>
            )}
            <button
              onClick={oneStep}
              disabled={busy || simulating}
              className="flex items-center gap-1.5 rounded-lg border border-navy-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-navy-800 disabled:opacity-60"
            >
              <Play size={15} /> Simulate GPS step
            </button>
            <button
              onClick={() => setSimulating((s) => !s)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${
                simulating
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'border border-emerald-700 text-emerald-300 hover:bg-emerald-950/40'
              }`}
            >
              {simulating ? <Square size={14} /> : <Play size={14} />}
              {simulating ? 'Stop simulation' : 'Auto-drive'}
            </button>
            {status === 'ARRIVED' && (
              <button
                onClick={() => change('COMPLETED')}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckCircle2 size={15} /> Complete assignment
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-500">Ambulance</span>
            <span className="font-semibold">{assignment.call_sign}</span>
            {sim && (
              <>
                <span className="text-slate-500">Distance</span>
                <span className="font-mono font-bold text-sky-300">
                  {sim.distance_km} km
                </span>
                <span className="text-slate-500">ETA</span>
                <span className="font-mono font-bold text-amber-300">
                  {sim.arrived ? 'arrived' : `${sim.eta_minutes} min`}
                </span>
              </>
            )}
          </div>

          {sim && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-navy-800">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(4, 100 - Math.min(100, sim.distance_km * 12))}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-600">
            GPS positions are simulated. Auto-drive moves the unit 0.8 km towards the
            incident every 1.8 s.
          </p>
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-400">
        Patients ({incident.patients.length})
      </h2>
      <div className="mt-3 space-y-3">
        {incident.patients.map((p) => (
          <div key={p.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold">{p.display_name}</span>
              <span className="text-xs text-slate-500">
                {p.age != null ? `${p.age} y` : 'age unknown'}
              </span>
              <Link
                to={`/emergency/guidance/${p.id}`}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline"
              >
                <Stethoscope size={13} /> First-aid guidance
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[
                ['Consciousness', p.consciousness],
                ['Breathing', p.breathing],
                ['Bleeding', p.bleeding],
              ].map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md border border-navy-700 bg-navy-950 px-2 py-1 text-slate-300"
                >
                  <span className="text-slate-500">{k}:</span> {v || '—'}
                </span>
              ))}
            </div>
            {p.additional_notes && (
              <p className="mt-2 text-sm text-slate-400">{p.additional_notes}</p>
            )}
          </div>
        ))}
        {incident.patients.length === 0 && (
          <p className="text-sm text-slate-500">No patients recorded.</p>
        )}
      </div>
    </div>
  )
}
