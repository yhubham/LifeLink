import { useEffect, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { createAmbulance, listAmbulances } from '../../services/api'
import { AMBULANCE_STYLES, formatTime } from '../../lib/status'

const BLANK = { call_sign: '', vehicle_number: '', latitude: '28.6139', longitude: '77.209' }

export default function Ambulances() {
  const [fleet, setFleet] = useState([])
  const [form, setForm] = useState(BLANK)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    listAmbulances()
      .then(setFleet)
      .catch((e) => setError(e.response?.data?.detail || 'Could not load fleet.'))
  }

  useEffect(load, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createAmbulance({
        call_sign: form.call_sign.trim().toUpperCase(),
        vehicle_number: form.vehicle_number || null,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
      })
      setForm(BLANK)
      setShowForm(false)
      load()
    } catch (e2) {
      setError(e2.response?.data?.detail || 'Could not register ambulance.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Truck size={20} className="text-sky-300" />
        <h1 className="text-xl font-bold">Ambulance fleet</h1>
        <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-300">
          {fleet.length} units
        </span>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold hover:bg-sky-500"
        >
          <Plus size={15} /> Register unit
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {showForm && (
        <form
          onSubmit={submit}
          className="mt-4 grid gap-3 rounded-xl border border-navy-700 bg-navy-900 p-4 sm:grid-cols-4"
        >
          <input
            required
            placeholder="Call sign (AMB-06)"
            value={form.call_sign}
            onChange={(e) => setForm({ ...form, call_sign: e.target.value })}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <input
            placeholder="Vehicle number"
            value={form.vehicle_number}
            onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-60 sm:col-span-4"
          >
            {busy ? 'Saving…' : 'Save ambulance'}
          </button>
        </form>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-navy-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Last GPS</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((a) => (
              <tr key={a.id} className="border-t border-navy-800 bg-navy-950/40">
                <td className="px-4 py-3 font-bold">{a.call_sign}</td>
                <td className="px-4 py-3 text-slate-400">{a.vehicle_number || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${AMBULANCE_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {a.latitude != null
                    ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatTime(a.last_location_update)}
                </td>
              </tr>
            ))}
            {fleet.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No ambulances registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
