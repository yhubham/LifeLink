import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Stethoscope } from 'lucide-react'
import {
  closeIncident,
  createAssignment,
  getIncident,
  getTriageHistory,
  incomingAlerts,
  listAmbulances,
  listAssignments,
  matchHospitals,
  sendHospitalAlert,
  simulateStep,
  submitTriage,
  verifyIncident,
} from '../../services/api'
import {
  ALERT_STYLES,
  ASSIGNMENT_STYLES,
  PRIORITY_STYLES,
  STATUS_STYLES,
  formatTime,
} from '../../lib/status'
import { useRealtime } from '../../hooks/useRealtime'
import LiveBadge from '../../components/common/LiveBadge'

const ANSWER_FIELDS = [
  ['airway', 'Airway', ['clear', 'obstructed']],
  ['breathing_rate', 'Breathing rate', ['normal', 'fast', 'absent']],
  ['circulation', 'Circulation', ['normal', 'weak', 'absent']],
  ['ambulatory', 'Ambulatory', ['yes', 'no']],
]

function PatientCard({ patient }) {
  const [answers, setAnswers] = useState({
    airway: 'clear',
    breathing_rate: 'normal',
    circulation: 'normal',
    ambulatory: 'no',
  })
  const [history, setHistory] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  function loadHistory() {
    getTriageHistory(patient.id).then(setHistory).catch(() => {})
  }

  useEffect(loadHistory, [patient.id])

  async function runTriage() {
    setBusy(true)
    try {
      const res = await submitTriage(patient.id, answers)
      setResult(res)
      loadHistory()
    } finally {
      setBusy(false)
    }
  }

  const latest = history[0]

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-900 p-5">
      <div className="flex items-center gap-3">
        <div className="font-bold">{patient.display_name}</div>
        <div className="text-sm text-slate-500">
          {patient.age != null ? `${patient.age} y` : 'age unknown'}
        </div>
        {latest && (
          <span className={`ml-auto rounded px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLES[latest.priority_level]}`}>
            {latest.priority_level}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {[
          ['Consciousness', patient.consciousness],
          ['Breathing', patient.breathing],
          ['Bleeding', patient.bleeding],
        ].map(([k, v]) => (
          <span key={k} className="rounded-md border border-navy-700 bg-navy-950 px-2 py-1 text-slate-300">
            <span className="text-slate-500">{k}:</span> {v || '—'}
          </span>
        ))}
      </div>
      {patient.additional_notes && (
        <p className="mt-2 text-sm text-slate-400">{patient.additional_notes}</p>
      )}

      <div className="mt-4 rounded-lg border border-navy-800 bg-navy-950/60 p-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          <Stethoscope size={14} /> Demo triage (demo-sim-v1)
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {ANSWER_FIELDS.map(([key, label, options]) => (
            <label key={key} className="text-[11px] text-slate-500">
              {label}
              <select
                value={answers[key]}
                onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-navy-700 bg-navy-900 px-2 py-1.5 text-xs text-slate-200"
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          onClick={runTriage}
          disabled={busy}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-500 disabled:opacity-60"
        >
          {busy ? 'Assessing…' : 'Run triage'}
        </button>

        {result && (
          <div className="mt-3 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLES[result.priority_level]}`}>
              {result.priority_level} · {result.label}
            </span>
            <p className="mt-1 text-slate-400">{result.reason}</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3 border-t border-navy-800 pt-2 text-xs text-slate-500">
            {history.length} assessment{history.length > 1 ? 's' : ''} on record · latest{' '}
            {formatTime(history[0].created_at)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function IncidentDetail() {
  const { id } = useParams()
  const [incident, setIncident] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  function load() {
    getIncident(id)
      .then((i) => {
        setIncident(i)
        setError('')
      })
      .catch((e) => setError(e.response?.data?.detail || 'Incident not found.'))
  }

  useEffect(load, [id])

  const connected = useRealtime(`incidents/${id}`, (message) => {
    const type = message.type || ''
    if (
      type.startsWith('incident.') ||
      type.startsWith('assignment.') ||
      type.startsWith('hospital.') ||
      type === 'ambulance.moved' ||
      type === 'patient.added'
    ) {
      load()
      setTick((n) => n + 1)
    }
  })

  async function act(fn) {
    setBusy(true)
    try {
      await fn(id)
      load()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="text-red-400">{error}</p>
  if (!incident) return <p className="text-slate-500">Loading…</p>

  const canVerify = incident.status === 'REPORTED'
  const canClose = !['CLOSED', 'CANCELLED'].includes(incident.status)

  return (
    <div>
      <Link to="/admin/incidents" className="text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={14} className="inline" /> Incidents
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold">{incident.public_code}</h1>
        <span className={`rounded border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[incident.status]}`}>
          {incident.status}
        </span>
        <LiveBadge connected={connected} />
        <span className="text-slate-400">{incident.incident_type}</span>
        <span className="text-xs text-slate-500">{formatTime(incident.reported_at)}</span>
        <div className="ml-auto flex gap-2">
          {canVerify && (
            <button
              onClick={() => act(verifyIncident)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-navy-950 hover:bg-amber-400 disabled:opacity-60"
            >
              <CheckCircle2 size={15} /> Verify
            </button>
          )}
          {canClose && (
            <button
              onClick={() => act(closeIncident)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-navy-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-navy-800 disabled:opacity-60"
            >
              <XCircle size={15} /> Close incident
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-400">
        📍 {incident.address || `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`}
      </p>
      {incident.description && (
        <p className="mt-2 max-w-2xl rounded-lg border border-navy-800 bg-navy-900 p-3 text-sm text-slate-300">
          {incident.description}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AssignmentPanel incident={incident} tick={tick} />
        <PreAlertPanel incident={incident} tick={tick} />
      </div>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-400">
        Patients ({incident.patients.length})
      </h2>
      <div className="mt-3 space-y-4">
        {incident.patients.map((p) => (
          <PatientCard key={p.id} patient={p} />
        ))}
        {incident.patients.length === 0 && (
          <p className="text-sm text-slate-500">No patients were reported.</p>
        )}
      </div>
    </div>
  )
}

function AssignmentPanel({ incident, tick }) {
  const [assignments, setAssignments] = useState([])
  const [fleet, setFleet] = useState([])
  const [ambulanceId, setAmbulanceId] = useState('')
  const [sim, setSim] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load() {
    return Promise.all([
      listAssignments({ incident_id: incident.id }),
      listAmbulances(),
    ])
      .then(([asg, amb]) => {
        setAssignments(asg)
        setFleet(amb)
        setAmbulanceId((prev) => {
          if (prev) return prev
          const free = amb.find((a) => a.status === 'AVAILABLE')
          return free ? free.id : ''
        })
      })
      .catch((e) => setError(e.response?.data?.detail || 'Could not load dispatch data.'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident.id, tick])

  const active = assignments.find(
    (a) => !['COMPLETED', 'CANCELLED'].includes(a.assignment_status)
  )

  useEffect(() => {
    if (!simulating || !active) return
    const timer = setInterval(async () => {
      try {
        const res = await simulateStep(active.id)
        setSim(res)
        if (res.arrived) setSimulating(false)
        load()
      } catch {
        setSimulating(false)
      }
    }, 1800)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating, active?.id])

  async function assign() {
    setBusy(true)
    setError('')
    try {
      await createAssignment({ incident_id: incident.id, ambulance_id: ambulanceId })
      setSim(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not assign ambulance.')
    } finally {
      setBusy(false)
    }
  }

  async function step() {
    if (!active) return
    setBusy(true)
    try {
      const res = await simulateStep(active.id)
      setSim(res)
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not move the ambulance.')
    } finally {
      setBusy(false)
    }
  }

  const available = fleet.filter((a) => a.status === 'AVAILABLE')

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        Ambulance dispatch
      </div>

      {active ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{active.call_sign}</span>
            <span className="text-xs text-slate-500">{active.vehicle_number}</span>
            <span
              className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-bold ${ASSIGNMENT_STYLES[active.assignment_status]}`}
            >
              {active.assignment_status}
            </span>
          </div>
          {sim && (
            <div className="mt-2 flex gap-4 text-xs text-slate-400">
              <span>
                Distance{' '}
                <span className="font-mono font-bold text-sky-300">{sim.distance_km} km</span>
              </span>
              <span>
                ETA{' '}
                <span className="font-mono font-bold text-amber-300">
                  {sim.arrived ? 'arrived' : `${sim.eta_minutes} min`}
                </span>
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={step}
              disabled={busy || simulating}
              className="rounded-lg border border-navy-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-navy-800 disabled:opacity-60"
            >
              Simulate GPS step
            </button>
            <button
              onClick={() => setSimulating((s) => !s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                simulating
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'border border-emerald-700 text-emerald-300 hover:bg-emerald-950/40'
              }`}
            >
              {simulating ? 'Stop auto-drive' : 'Auto-drive'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Simulated GPS movement — 0.8 km per step.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={ambulanceId}
              onChange={(e) => setAmbulanceId(e.target.value)}
              className="min-w-40 flex-1 rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm"
            >
              {available.length === 0 && <option value="">No available units</option>}
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.call_sign} — {a.vehicle_number}
                </option>
              ))}
            </select>
            <button
              onClick={assign}
              disabled={busy || !ambulanceId}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold hover:bg-sky-500 disabled:opacity-60"
            >
              Assign
            </button>
          </div>
          {assignments.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Last assignment: {assignments[0].call_sign} ·{' '}
              {assignments[0].assignment_status}
            </p>
          )}
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

function PreAlertPanel({ incident, tick }) {
  const [hospitals, setHospitals] = useState([])
  const [hospitalId, setHospitalId] = useState('')
  const [alerts, setAlerts] = useState([])
  const [message, setMessage] = useState(
    'Pre-alert: incoming patient from LifeLink control room'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function loadAlerts() {
    incomingAlerts(true)
      .then((all) =>
        setAlerts(all.filter((a) => a.incident?.id === incident.id))
      )
      .catch(() => {})
  }

  useEffect(() => {
    matchHospitals(incident.latitude, incident.longitude)
      .then((list) => {
        setHospitals(list)
        setHospitalId((prev) => prev || list[0]?.id || '')
      })
      .catch((e) => setError(e.response?.data?.detail || 'Could not load hospitals.'))
    loadAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident.id, tick])

  const selected = hospitals.find((h) => h.id === hospitalId)

  async function send() {
    if (!hospitalId) return
    setBusy(true)
    setError('')
    try {
      await sendHospitalAlert({
        incident_id: incident.id,
        hospital_id: hospitalId,
        eta_minutes: selected?.eta_minutes ?? null,
        message,
      })
      loadAlerts()
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not send pre-alert.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        Hospital pre-alert
      </div>

      <div className="mt-3 space-y-2">
        <select
          value={hospitalId}
          onChange={(e) => setHospitalId(e.target.value)}
          className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm"
        >
          {hospitals.length === 0 && <option value="">No hospital matches</option>}
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} — {h.distance_km} km · ETA {h.eta_minutes} min ·{' '}
              {h.available_beds} beds
            </option>
          ))}
        </select>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={busy || !hospitalId}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send pre-alert'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {alerts.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-navy-800 pt-3">
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-300">{a.hospital?.name}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">ETA {a.eta_minutes ?? '—'} min</span>
              <span
                className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[a.alert_status]}`}
              >
                {a.alert_status}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-600">
        Only the hospital dashboard can acknowledge a pre-alert.
      </p>
    </div>
  )
}
