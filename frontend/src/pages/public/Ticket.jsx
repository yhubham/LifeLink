import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Ambulance as AmbulanceIcon,
  ArrowLeft,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  MapPin,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { accessTicket, getTicket } from '../../services/api'
import { useRealtime } from '../../hooks/useRealtime'
import { STATUS_STYLES, formatTime } from '../../lib/status'
import CallButton from '../../components/common/CallButton'

const STEPS = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'RESPONDING', 'ARRIVED', 'CLOSED']

const STORAGE_PREFIX = 'lifelink-ticket:'

function statusLabel(status) {
  return status
    ? status.charAt(0) + status.slice(1).toLowerCase()
    : 'Unknown'
}

export default function Ticket() {
  const { code: routeCode } = useParams()
  const code = (routeCode || '').toUpperCase()
  const [ticket, setTicket] = useState(null)
  const [ticketToken, setTicketToken] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const tokenRef = useRef('')

  useEffect(() => {
    tokenRef.current = ticketToken
  }, [ticketToken])

  const load = useCallback(
    async (token = tokenRef.current) => {
      if (!code || !token) {
        setLoading(false)
        return
      }
      try {
        const data = await getTicket(code, token)
        setTicket(data)
        setError('')
        setAuthError('')
      } catch (e) {
        if ([401, 403].includes(e.response?.status)) {
          sessionStorage.removeItem(STORAGE_PREFIX + code)
          setTicketToken('')
          tokenRef.current = ''
          setTicket(null)
          setAuthError('Your ticket session expired. Enter the ticket number and PIN again.')
        } else {
          setError(e.response?.data?.detail || 'Could not load this ticket.')
        }
      } finally {
        setLoading(false)
      }
    },
    [code]
  )

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_PREFIX + code)
    if (saved) {
      setTicketToken(saved)
      tokenRef.current = saved
      load(saved)
    } else {
      setLoading(false)
    }
  }, [code, load])

  const realtimeChannel = ticket ? `tickets/${ticket.incident_id}` : null
  const connected = useRealtime(
    realtimeChannel,
    (message) => {
      const type = message.type || ''
      if (
        type.startsWith('incident.') ||
        type.startsWith('assignment.') ||
        type.startsWith('hospital.') ||
        type === 'ambulance.moved' ||
        type === 'patient.added' ||
        type === 'incident.media_added'
      ) {
        load()
      }
    },
    ticketToken ? { token: ticketToken, path: realtimeChannel } : {}
  )

  useEffect(() => {
    if (!ticket || !ticketToken) return undefined
    const timer = setInterval(() => load(ticketToken), 20000)
    return () => clearInterval(timer)
  }, [ticket, ticketToken, load])

  async function unlock(event) {
    event.preventDefault()
    setBusy(true)
    setAuthError('')
    try {
      const data = await accessTicket(code, pin.trim())
      sessionStorage.setItem(STORAGE_PREFIX + code, data.ticket_token)
      setTicketToken(data.ticket_token)
      tokenRef.current = data.ticket_token
      setTicket(data.ticket)
    } catch (e) {
      setAuthError(
        e.response?.data?.detail ||
          'Ticket number or PIN is incorrect. Check and try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  if (loading && !ticket) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-5">
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Loading ticket…
        </p>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="mx-auto min-h-screen max-w-xl px-5 py-12">
        <CallButton compact />
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} className="inline" /> Home
        </Link>
        <div className="mt-4 rounded-xl border border-navy-700 bg-navy-900 p-5">
          <div className="flex items-center gap-2">
            <LockKeyhole size={18} className="text-amber-300" />
            <h1 className="text-xl font-bold">Open your ticket</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Enter the ticket number and the 6-digit PIN shown when the report was
            submitted. Patient details are never shown on this public page.
          </p>

          <form onSubmit={unlock} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-semibold text-slate-200">Ticket number</span>
              <input
                value={code}
                readOnly
                className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 font-mono uppercase text-slate-200"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-slate-200">Ticket PIN</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit PIN"
                className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 font-mono tracking-[0.3em] text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            {(authError || error) && (
              <p className="text-sm text-red-400">{authError || error}</p>
            )}
            <button
              type="submit"
              disabled={busy || pin.length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {busy ? 'Checking…' : 'Open ticket'}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">
            Lost your PIN? The PIN is only shown once at submission for privacy.
            Contact the control room with your ticket number.
          </p>
        </div>
      </div>
    )
  }

  const currentIndex = STEPS.indexOf(ticket.status)
  const ambulance = ticket.ambulance
  const hospital = ticket.hospital

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-5">
      <CallButton compact />
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} className="inline" /> Home
        </Link>
        <button
          type="button"
          onClick={() => load()}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <span className="text-[11px] text-slate-600">
          {connected ? 'Live updates on' : 'Live updates reconnecting…'}
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-navy-700 bg-navy-900 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xl font-extrabold text-emerald-300">
            {ticket.ticket_number}
          </span>
          <span
            className={`rounded border px-2.5 py-0.5 text-xs font-bold ${
              STATUS_STYLES[ticket.status] || STATUS_STYLES.CANCELLED
            }`}
          >
            {ticket.status}
          </span>
          <span className="ml-auto text-xs text-slate-500">
            Reported {formatTime(ticket.reported_at)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info icon={PhoneCall} label="Incident type" value={ticket.incident_type} />
          <Info
            icon={Users}
            label="People injured"
            value={`${ticket.injured_count} reported${
              ticket.patient_count !== ticket.injured_count
                ? ` · ${ticket.patient_count} patient record${ticket.patient_count === 1 ? '' : 's'}`
                : ''
            }`}
          />
          <Info
            icon={MapPin}
            label="Location"
            value={
              ticket.address ||
              `${ticket.latitude.toFixed(5)}, ${ticket.longitude.toFixed(5)}`
            }
          />
          <Info
            icon={Clock3}
            label="Reported at"
            value={new Date(ticket.reported_at).toLocaleString()}
          />
          {ticket.landmark && (
            <Info icon={MapPin} label="Landmark" value={ticket.landmark} />
          )}
          {ticket.preferred_hospital?.name && (
            <Info
              icon={Building2}
              label="Preferred hospital"
              value={`${ticket.preferred_hospital.name} (availability not verified)`}
            />
          )}
        </div>

        {ticket.description && (
          <p className="mt-4 rounded-lg border border-navy-800 bg-navy-950/60 p-3 text-sm text-slate-300">
            {ticket.description}
          </p>
        )}
      </div>

      <section className="mt-4 rounded-xl border border-navy-700 bg-navy-900 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Progress
        </h2>
        {ticket.status === 'CANCELLED' ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-700/20 px-3 py-2 text-sm text-slate-300">
            <CheckCircle2 size={15} /> This incident was cancelled.
          </div>
        ) : (
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const done = index <= currentIndex
              const current = index === currentIndex
              return (
                <li key={step} className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done
                        ? 'bg-emerald-500 text-navy-950'
                        : 'bg-navy-800 text-slate-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      current
                        ? 'font-bold text-slate-100'
                        : done
                          ? 'text-slate-300'
                          : 'text-slate-500'
                    }`}
                  >
                    {statusLabel(step)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-navy-700 bg-navy-900 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            <AmbulanceIcon size={15} /> Ambulance
          </h2>
          {ambulance ? (
            <div className="mt-3">
              <div className="text-lg font-bold">{ambulance.call_sign}</div>
              <div className="text-xs text-slate-500">
                {ambulance.vehicle_number || 'Vehicle number unavailable'}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Status: <span className="font-semibold">{ambulance.assignment_status}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Assigned {formatTime(ambulance.assigned_at)}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No ambulance has been assigned yet. This page updates automatically.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-navy-700 bg-navy-900 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            <Building2 size={15} /> Hospital
          </h2>
          {hospital ? (
            <div className="mt-3">
              <div className="text-lg font-bold">{hospital.name}</div>
              <div className="text-xs text-slate-500">
                {hospital.address || 'Address unavailable'}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Pre-alert: <span className="font-semibold">{hospital.alert_status}</span>
                {hospital.eta_minutes != null && ` · ETA ${hospital.eta_minutes} min`}
              </div>
              {hospital.arrival_acknowledged_at ? (
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <BedDouble size={13} /> Arrival confirmed by hospital
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500">
                  Arrival not yet confirmed by the hospital.
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No hospital pre-alert has been sent yet.
            </p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-navy-700 bg-navy-900 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Timeline
        </h2>
        {ticket.timeline?.length ? (
          <ol className="mt-3 space-y-3 border-l border-navy-700 pl-4">
            {ticket.timeline.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <div className="text-sm text-slate-200">{event.message}</div>
                <div className="text-[11px] text-slate-500">
                  {formatTime(event.created_at)}
                  {event.status ? ` · ${event.status}` : ''}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Timeline entries appear as the control room processes the report.
          </p>
        )}
      </section>

      <p className="mt-4 text-center text-[11px] text-slate-600">
        This ticket shows operational status only. Patient medical details are
        visible only to authorized responders and hospital staff.
      </p>
    </div>
  )
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <Icon size={11} /> {label}
      </div>
      <div className="mt-0.5 text-sm text-slate-200">{value}</div>
    </div>
  )
}
