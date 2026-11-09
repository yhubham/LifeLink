import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { KeyRound, Loader2, LockKeyhole, Search } from 'lucide-react'
import { accessTicket } from '../../services/api'
import CallButton from '../../components/common/CallButton'

function recentCodes() {
  try {
    return JSON.parse(localStorage.getItem('lifelink-ticket-codes') || '[]')
  } catch {
    return []
  }
}

export default function Track() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [code, setCode] = useState((id || '').toUpperCase())
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const recents = recentCodes()

  async function lookup(event) {
    event.preventDefault()
    if (!code.trim() || pin.length < 4) return
    setLoading(true)
    setError('')
    try {
      const data = await accessTicket(code.trim().toUpperCase(), pin.trim())
      sessionStorage.setItem(
        `lifelink-ticket:${data.ticket.ticket_number}`,
        data.ticket_token
      )
      navigate(`/ticket/${data.ticket.ticket_number}`)
    } catch (e) {
      setError(
        e.response?.data?.detail ||
          'Ticket number or PIN is incorrect. Check the details and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 py-12">
      <CallButton compact />
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
        ← Home
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <LockKeyhole size={20} className="text-amber-300" />
        <h1 className="text-2xl font-bold">Track an incident</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Use the ticket number and PIN you received when the report was submitted.
      </p>

      <form
        onSubmit={lookup}
        className="mt-5 space-y-3 rounded-xl border border-navy-700 bg-navy-900 p-5"
      >
        <label className="block text-sm">
          <span className="font-semibold text-slate-200">Ticket number</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="LL-2026-0001"
            className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 font-mono uppercase text-slate-100 outline-none focus:border-red-500"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-slate-200">Ticket PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="6-digit PIN"
            className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 font-mono tracking-[0.3em] text-slate-100 outline-none focus:border-red-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !code.trim() || pin.length < 4}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-bold hover:bg-red-500 disabled:opacity-60"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          {loading ? 'Checking…' : 'Open ticket'}
        </button>
      </form>

      {recents.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Recent tickets on this device
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {recents.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCode(item)}
                className="flex items-center gap-1.5 rounded-lg border border-navy-700 px-2.5 py-1.5 font-mono text-xs text-slate-300 hover:bg-navy-800"
              >
                <KeyRound size={12} /> {item}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Save the PIN separately. It is never stored in the browser.
          </p>
        </div>
      )}
    </div>
  )
}
