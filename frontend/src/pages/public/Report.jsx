import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { MapPin, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { createIncident } from '../../services/api'
import { useReportStore } from '../../context/reportStore'

const blankPatient = () => ({
  display_name: '',
  age: '',
  consciousness: 'Responsive',
  breathing: 'Normal',
  bleeding: 'None',
  additional_notes: '',
})

export default function Report() {
  const navigate = useNavigate()
  const { latitude, longitude, address } = useReportStore()
  const [incidentType, setIncidentType] = useState('Road Accident')
  const [description, setDescription] = useState('')
  const [patients, setPatients] = useState([blankPatient()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  if (!created && latitude === null) return <Navigate to="/emergency" replace />

  function updatePatient(i, field, value) {
    setPatients((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        incident_type: incidentType,
        description: description || null,
        latitude,
        longitude,
        address: address || null,
        patients: patients
          .filter((p) => p.display_name.trim() !== '')
          .map((p) => ({
            ...p,
            display_name: p.display_name.trim() || 'Unknown',
            age: p.age === '' ? null : Number(p.age),
          })),
      }
      const incident = await createIncident(payload)
      setCreated(incident)
    } catch (err) {
      setError(
        err.response?.data?.detail
          ? JSON.stringify(err.response.data.detail)
          : 'Could not reach the LifeLink API. Is the backend running?'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 className="text-green-500" size={56} />
        <h1 className="mt-4 text-2xl font-bold">Incident reported</h1>
        <p className="mt-2 text-slate-400">Your public code (share for tracking):</p>
        <div className="mt-3 rounded-xl border border-navy-700 bg-navy-900 px-6 py-3 font-mono text-2xl font-bold text-emerald-400">
          {created.public_code}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Status: <span className="font-semibold text-amber-400">{created.status}</span> — the
          control room has been alerted.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            to={`/track/${created.public_code}`}
            className="rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-500"
          >
            Track incident
          </Link>
          <Link
            to="/emergency/guidance"
            className="rounded-lg border border-navy-700 px-5 py-3 font-semibold hover:bg-navy-800"
          >
            First-aid guidance
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-8">
      <Link to="/emergency" className="text-sm text-slate-500 hover:text-slate-300">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Incident report</h1>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-900 px-4 py-3 text-sm text-slate-300">
        <MapPin className="text-red-500" size={16} />
        {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
        {address ? ` — ${address}` : ''}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-300">
            Incident type
          </label>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2.5 outline-none focus:border-red-500"
          >
            {['Road Accident', 'Fire', 'Medical', 'Building Collapse', 'Other'].map(
              (t) => (
                <option key={t}>{t}</option>
              )
            )}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-300">
            What happened?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Two-car collision near the flyover, vehicles blocking one lane…"
            className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2.5 outline-none focus:border-red-500"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300">Patients</label>
            <button
              type="button"
              onClick={() => setPatients((p) => [...p, blankPatient()])}
              className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
            >
              <Plus size={15} /> Add patient
            </button>
          </div>

          <div className="space-y-4">
            {patients.map((p, i) => (
              <div key={i} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Patient {i + 1}
                  </span>
                  {patients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPatients((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-500 hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    value={p.display_name}
                    onChange={(e) => updatePatient(i, 'display_name', e.target.value)}
                    placeholder="Name (or 'Unknown')"
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 outline-none focus:border-red-500"
                  />
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={p.age}
                    onChange={(e) => updatePatient(i, 'age', e.target.value)}
                    placeholder="Age"
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 outline-none focus:border-red-500"
                  />
                  <select
                    value={p.consciousness}
                    onChange={(e) => updatePatient(i, 'consciousness', e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2"
                  >
                    {['Responsive', 'Confused', 'Unresponsive'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    value={p.breathing}
                    onChange={(e) => updatePatient(i, 'breathing', e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2"
                  >
                    {['Normal', 'Laboured', 'Not breathing'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <select
                    value={p.bleeding}
                    onChange={(e) => updatePatient(i, 'bleeding', e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2"
                  >
                    {['None', 'Minor', 'Heavy', 'Uncontrolled'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    value={p.additional_notes}
                    onChange={(e) => updatePatient(i, 'additional_notes', e.target.value)}
                    placeholder="Notes (optional)"
                    className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 outline-none focus:border-red-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send emergency report'}
        </button>
        <p className="pb-6 text-center text-xs text-slate-500">
          Educational simulation — no real emergency services are contacted.
        </p>
      </form>
    </div>
  )
}
