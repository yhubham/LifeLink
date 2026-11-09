import { useEffect, useState } from 'react'
import { Building2, Save } from 'lucide-react'
import { listHospitals, updateCapacity } from '../../services/api'

export default function Hospitals() {
  const [hospitals, setHospitals] = useState([])
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  function load() {
    listHospitals()
      .then((rows) => {
        setHospitals(rows)
        setDraft(
          Object.fromEntries(
            rows.map((h) => [h.id, { total: h.total_beds, available: h.available_beds }])
          )
        )
      })
      .catch((e) => setError(e.response?.data?.detail || 'Could not load hospitals.'))
  }

  useEffect(load, [])

  async function save(h) {
    const d = draft[h.id]
    setBusyId(h.id)
    setError('')
    try {
      await updateCapacity(h.id, {
        total_beds: Number(d.total),
        available_beds: Number(d.available),
      })
      load()
    } catch (e) {
      setError(
        e.response?.data?.detail?.[0]?.msg ||
          e.response?.data?.detail ||
          'Could not update capacity.'
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-emerald-400" />
        <h1 className="text-xl font-bold">Hospitals</h1>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
          mock capacity
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Facilities the control room can pre-alert. Capacity is simulated for the demo.
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 space-y-3">
        {hospitals.map((h) => {
          const d = draft[h.id] || { total: h.total_beds, available: h.available_beds }
          const pct = Math.round((Number(d.available) / Math.max(1, Number(d.total))) * 100)
          return (
            <div key={h.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-48">
                  <div className="font-bold">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.address}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(h.specialties || []).map((s) => (
                    <span
                      key={s}
                      className="rounded-md border border-navy-700 bg-navy-950 px-2 py-0.5 text-[10px] text-slate-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    Total
                    <input
                      type="number"
                      min="0"
                      value={d.total}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [h.id]: { ...d, total: e.target.value },
                        }))
                      }
                      className="w-20 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 text-slate-200"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    Available
                    <input
                      type="number"
                      min="0"
                      value={d.available}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [h.id]: { ...d, available: e.target.value },
                        }))
                      }
                      className="w-20 rounded-md border border-navy-700 bg-navy-950 px-2 py-1 text-slate-200"
                    />
                  </label>
                  <span className="text-xs font-bold text-emerald-400">{pct}% free</span>
                  <button
                    onClick={() => save(h)}
                    disabled={busyId === h.id}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500 disabled:opacity-60"
                  >
                    <Save size={13} /> {busyId === h.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {hospitals.length === 0 && !error && (
          <p className="text-sm text-slate-500">Loading hospitals…</p>
        )}
      </div>
    </div>
  )
}
