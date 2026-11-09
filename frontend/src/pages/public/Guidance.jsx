import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ShieldAlert, CheckCircle2 } from 'lucide-react'
import api from '../../services/api'

const PRIORITY_STYLES = {
  L1: 'bg-red-600 text-white',
  L2: 'bg-amber-400 text-navy-950',
  L3: 'bg-emerald-500 text-navy-950',
  L4: 'bg-sky-400 text-navy-950',
}

export default function Guidance() {
  const { id } = useParams()
  const [guide, setGuide] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [done, setDone] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api
      .get(`/patients/${id}/guidance`)
      .then((r) => setGuide(r.data))
      .catch(() => setError('Guidance not found for this patient.'))
  }, [id])

  const startSession = useCallback(async () => {
    if (!id || sessionId) return
    try {
      const { data } = await api.post(`/patients/${id}/guidance/sessions`)
      setSessionId(data.id)
    } catch {
      /* session is optional for the demo */
    }
  }, [id, sessionId])

  async function toggleStep(step) {
    const next = done.includes(step) ? done.filter((s) => s !== step) : [...done, step]
    setDone(next)
    if (sessionId) {
      try {
        await api.patch(`/guidance/sessions/${sessionId}`, {
          completed_steps: next,
          completed: guide && next.length === guide.steps.length,
        })
      } catch {
        /* ignore in demo */
      }
    } else if (next.length === 1) {
      startSession()
    }
  }

  if (!id) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          <ChevronLeft size={14} className="inline" /> Home
        </Link>
        <h1 className="mt-3 text-2xl font-bold">First-aid guidance</h1>
        <p className="mt-3 text-slate-400">
          Report an incident to receive step-by-step guidance for the patient, matched
          to their triage priority.
        </p>
        <div className="mt-6 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-300">
          <ShieldAlert size={15} className="mr-1 inline" />
          Educational simulation — not real medical advice. In a real emergency call
          your local emergency number.
        </div>
        <Link
          to="/emergency"
          className="mt-6 inline-block rounded-xl bg-red-600 px-6 py-3 font-bold hover:bg-red-500"
        >
          Report an emergency
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
        <p className="text-red-400">{error}</p>
        <Link to="/" className="text-sm text-slate-500 underline">
          Home
        </Link>
      </div>
    )
  }

  if (!guide) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading guidance…
      </div>
    )
  }

  const allDone = done.length === guide.steps.length

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <Link to="/emergency/report" className="text-sm text-slate-500 hover:text-slate-300">
        <ChevronLeft size={14} className="inline" /> Report
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-bold">First-aid guidance</h1>
        <span
          className={`rounded-md px-2.5 py-1 text-sm font-bold ${PRIORITY_STYLES[guide.priority]}`}
        >
          {guide.priority}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Patient: <span className="text-slate-200">{guide.display_name}</span> —{' '}
        {guide.label}
      </p>

      <div className="mt-4 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-300">
        <ShieldAlert size={15} className="mr-1 inline" />
        {guide.incident_hint}
      </div>

      <div className="mt-6 space-y-3">
        {guide.steps.map((s) => {
          const checked = done.includes(s.step)
          return (
            <button
              key={s.step}
              onClick={() => toggleStep(s.step)}
              className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition ${
                checked
                  ? 'border-emerald-700 bg-emerald-950/30'
                  : 'border-navy-700 bg-navy-900 hover:bg-navy-800'
              }`}
            >
              <CheckCircle2
                size={20}
                className={checked ? 'mt-0.5 text-emerald-400' : 'mt-0.5 text-slate-600'}
              />
              <span>
                <span className="font-semibold">
                  {s.step}. {s.title}
                </span>
                <span className="mt-1 block text-sm text-slate-400">{s.detail}</span>
              </span>
            </button>
          )
        })}
      </div>

      {allDone && (
        <p className="mt-6 rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-center font-semibold text-emerald-400">
          All steps completed — keep monitoring the patient until help arrives.
        </p>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">{guide.disclaimer}</p>
    </div>
  )
}
