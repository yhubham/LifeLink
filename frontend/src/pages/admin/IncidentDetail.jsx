import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Stethoscope } from 'lucide-react'
import {
  closeIncident,
  getIncident,
  getTriageHistory,
  submitTriage,
  verifyIncident,
} from '../../services/api'
import { PRIORITY_STYLES, STATUS_STYLES, formatTime } from '../../lib/status'

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

  function load() {
    getIncident(id)
      .then((i) => {
        setIncident(i)
        setError('')
      })
      .catch((e) => setError(e.response?.data?.detail || 'Incident not found.'))
  }

  useEffect(load, [id])

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
