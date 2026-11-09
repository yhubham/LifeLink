import { useEffect, useState } from 'react'
import { BedDouble, Save } from 'lucide-react'
import { listHospitals, updateCapacity } from '../../services/api'

export default function HospitalCapacity() {
  const [hospitals, setHospitals] = useState([])
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
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
  }, [])

  async function save(hospital) {
    const d = draft[hospital.id]
    setBusyId(hospital.id)
    setError('')
    try {
      const updated = await updateCapacity(hospital.id, {
        total_beds: Number(d.total),
        available_beds: Number(d.available),
      })
      setHospitals((rows) => rows.map((h) => (h.id === updated.id ? updated : h)))
      setSavedId(hospital.id)
      setTimeout(() => setSavedId(null), 2000)
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
        <BedDouble size={20} className="text-emerald-400" />
        <h1 className="text-xl font-bold">Bed capacity</h1>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
          simulated data
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Update the mock bed counts shown to the control room and ambulance crews.
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 space-y-3">
        {hospitals.map((h) => {
          const d = draft[h.id] || { total: h.total_beds, available: h.available_beds }
          return (
            <div key={h.id} className="rounded-xl border border-navy-700 bg-navy-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="font-bold">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.address}</div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
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
                  <button
                    onClick={() => save(h)}
                    disabled={busyId === h.id}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500 disabled:opacity-60"
                  >
                    <Save size={13} />
                    {busyId === h.id ? 'Saving…' : savedId === h.id ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(h.specialties || []).map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-navy-700 bg-navy-950 px-2 py-0.5 text-[10px] text-slate-400"
                  >
                    {s}
                  </span>
                ))}
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
