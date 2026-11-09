import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Stethoscope } from 'lucide-react'
import { getPatient } from '../../services/api'
import { PRIORITY_STYLES, STATUS_STYLES } from '../../lib/status'

export default function HospitalPatient() {
  const { id } = useParams()
  const [patient, setPatient] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPatient(id)
      .then(setPatient)
      .catch((e) => setError(e.response?.data?.detail || 'Patient not found.'))
  }, [id])

  if (error) return <p className="text-red-400">{error}</p>
  if (!patient) return <p className="text-slate-500">Loading…</p>

  const triage = patient.latest_triage

  return (
    <div className="max-w-2xl">
      <Link to="/hospital/alerts" className="text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={14} className="inline" /> Alerts
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{patient.display_name}</h1>
        <span className="text-sm text-slate-500">
          {patient.age != null ? `${patient.age} years` : 'age unknown'}
        </span>
        {triage && (
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLES[triage.priority_level]}`}>
            {triage.priority_level}
          </span>
        )}
      </div>

      {patient.incident && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-navy-700 bg-navy-900 p-4">
          <span className="font-mono text-xs text-slate-400">
            {patient.incident.public_code}
          </span>
          <span className="font-semibold">{patient.incident.incident_type}</span>
          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[patient.incident.status]}`}>
            {patient.incident.status}
          </span>
          <span className="text-xs text-slate-400">{patient.incident.address}</span>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Consciousness', patient.consciousness],
          ['Breathing', patient.breathing],
          ['Bleeding', patient.bleeding],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 font-semibold text-slate-200">{value || '—'}</div>
          </div>
        ))}
      </div>

      {patient.additional_notes && (
        <p className="mt-3 rounded-lg border border-navy-800 bg-navy-900 p-3 text-sm text-slate-300">
          {patient.additional_notes}
        </p>
      )}

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-400">
        Demo triage
      </h2>
      <div className="mt-2 rounded-xl border border-navy-700 bg-navy-900 p-4">
        {triage ? (
          <>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLES[triage.priority_level]}`}>
                {triage.priority_level}
              </span>
              <span className="text-xs text-slate-500">
                protocol {triage.protocol} · simulated
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{triage.reason}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No triage assessment recorded yet.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-600">
          Educational simulation only — not a medical device.
        </p>
      </div>

      <Link
        to={`/emergency/guidance/${patient.id}`}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/40"
      >
        <Stethoscope size={15} /> Open first-aid guidance
      </Link>
    </div>
  )
}
