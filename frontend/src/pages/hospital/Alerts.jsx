import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, RefreshCw, Siren } from 'lucide-react'
import {
  acknowledgeAlert,
  acknowledgeArrival,
  incomingAlerts,
} from '../../services/api'
import { ALERT_STYLES, PRIORITY_STYLES, formatTime } from '../../lib/status'
import { useRealtime } from '../../hooks/useRealtime'
import LiveBadge from '../../components/common/LiveBadge'

export default function HospitalAlerts() {
  const [alerts, setAlerts] = useState([])
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    return incomingAlerts(showAcknowledged)
      .then(setAlerts)
      .catch((e) => setError(e.response?.data?.detail || 'Could not load alerts.'))
  }, [showAcknowledged])

  useEffect(() => {
    load()
  }, [load])

  const connected = useRealtime('hospital', (message) => {
    const type = message.type || ''
    if (
      type === 'hospital.alert' ||
      type === 'hospital.alert_acknowledged' ||
      type === 'hospital.arrival_acknowledged' ||
      type === 'patient.added' ||
      type.startsWith('incident.')
    ) {
      load()
    }
  })

  async function acknowledge(id) {
    setBusyId(id)
    try {
      await acknowledgeAlert(id)
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function confirmArrival(id) {
    setBusyId(id)
    setError('')
    try {
      await acknowledgeArrival(id)
      load()
    } catch (e) {
      setError(
        e.response?.data?.detail || 'Could not confirm patient arrival.'
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Incoming alerts</h1>
        <LiveBadge connected={connected} />
        <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400">
          {alerts.filter((a) => a.alert_status === 'SENT').length} open
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="accent-emerald-500"
          />
          Show acknowledged
        </label>
        <button
          onClick={load}
          className="rounded-lg border border-navy-700 p-2 text-slate-400 hover:bg-navy-800"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-5 space-y-4">
        {alerts.length === 0 && (
          <p className="rounded-xl border border-navy-700 bg-navy-900 p-6 text-sm text-slate-500">
            Inbox empty. Pre-alerts sent by the control room appear here.
          </p>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="rounded-xl border border-navy-700 bg-navy-900 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Siren size={16} className="text-red-400" />
              <span className="font-mono text-sm font-bold">{a.incident?.public_code}</span>
              <span className="font-semibold">{a.incident?.incident_type}</span>
              <span className="text-xs text-slate-500">
                → {a.hospital?.name}
              </span>
              <span
                className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[a.alert_status]}`}
              >
                {a.alert_status}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
              <span>ETA: <span className="font-bold text-amber-300">{a.eta_minutes ?? '—'} min</span></span>
              <span>Sent: {formatTime(a.created_at)}</span>
              {a.acknowledged_at && <span>Acknowledged: {formatTime(a.acknowledged_at)}</span>}
              <span>Location: {a.incident?.address || '—'}</span>
              {a.arrival_acknowledged_at && (
                <span className="text-emerald-400">
                  Patient arrival confirmed: {formatTime(a.arrival_acknowledged_at)}
                </span>
              )}
            </div>
            {a.message && <p className="mt-2 text-sm text-slate-300">{a.message}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {a.patients.map((p) => (
                <Link
                  key={p.id}
                  to={`/hospital/patient/${p.id}`}
                  className="flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs hover:bg-navy-800"
                >
                  {p.priority_level && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLES[p.priority_level]}`}>
                      {p.priority_level}
                    </span>
                  )}
                  <span className="font-semibold">{p.display_name}</span>
                  <span className="text-slate-500">
                    {p.age != null ? `${p.age} y` : ''}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {a.alert_status === 'SENT' && (
                <button
                  onClick={() => acknowledge(a.id)}
                  disabled={busyId === a.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 size={15} />
                  {busyId === a.id ? 'Acknowledging…' : 'Acknowledge pre-alert'}
                </button>
              )}
              {['ARRIVED', 'CLOSED'].includes(a.incident?.status) &&
                !a.arrival_acknowledged_at && (
                  <button
                    onClick={() => confirmArrival(a.id)}
                    disabled={busyId === a.id}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} />
                    {busyId === a.id
                      ? 'Confirming…'
                      : 'Confirm patient arrival'}
                  </button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
