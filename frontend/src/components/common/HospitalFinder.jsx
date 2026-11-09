import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Building2,
  Crosshair,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Siren,
} from 'lucide-react'
import { searchHospitals } from '../../services/api'

const SPECIALTIES = [
  'Trauma',
  'Cardiology',
  'Emergency',
  'General',
  'Pediatrics',
  'Orthopedics',
]

const RADIUS_OPTIONS = [
  { label: 'Any distance', value: '' },
  { label: 'Within 2 km', value: '2' },
  { label: 'Within 5 km', value: '5' },
  { label: 'Within 10 km', value: '10' },
]

/**
 * Real-time nearest-hospital finder.
 *
 * Filters are debounced and the list refreshes on an interval and whenever the
 * caller bumps `refreshKey` (e.g. from a hospital/capacity websocket event).
 */
export default function HospitalFinder({
  origin = null,
  refreshKey = 0,
  title = 'Nearest hospitals',
  onSelect,
}) {
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [minBeds, setMinBeds] = useState('')
  const [radius, setRadius] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  const [localOrigin, setLocalOrigin] = useState(null)

  const point = localOrigin || origin
  const debounceRef = useRef(null)

  const load = useCallback(() => {
    const params = {}
    if (query.trim()) params.q = query.trim()
    if (specialty) params.specialty = specialty
    if (minBeds) params.min_beds = Number(minBeds)
    if (radius) params.max_distance_km = Number(radius)
    if (point) {
      params.latitude = point.latitude
      params.longitude = point.longitude
    }
    return searchHospitals(params)
      .then((data) => {
        setRows(data)
        setError('')
      })
      .catch((e) =>
        setError(e.response?.data?.detail || 'Could not load hospitals.')
      )
      .finally(() => setLoading(false))
  }, [query, specialty, minBeds, radius, point])

  useEffect(() => {
    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(load, 250)
    return () => clearTimeout(debounceRef.current)
  }, [load])

  useEffect(() => {
    if (!refreshKey) return
    load()
  }, [refreshKey, load])

  useEffect(() => {
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser does not support geolocation.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalOrigin({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        setLocating(false)
      },
      () => {
        setError('Location permission denied — showing all hospitals instead.')
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }

  return (
    <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 size={18} className="text-emerald-400" />
        <h2 className="font-bold">{title}</h2>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
          REAL-TIME
        </span>
        <button
          onClick={() => {
            setLoading(true)
            load()
          }}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-navy-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-navy-800"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={useMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
        >
          <Crosshair size={13} />
          {locating ? 'Locating…' : point ? 'Near me ✓' : 'Sort by distance'}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hospital name…"
            className="w-full rounded-lg border border-navy-700 bg-navy-950 py-2 pl-8 pr-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
          />
        </label>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-2 text-sm text-slate-200 focus:border-emerald-600 focus:outline-none"
        >
          <option value="">All specialties</option>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-950 px-2 text-sm text-slate-400">
          <span className="text-xs">Beds ≥</span>
          <input
            type="number"
            min="0"
            value={minBeds}
            onChange={(e) => setMinBeds(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent py-2 text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
        </label>
        <select
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          disabled={!point}
          className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-2 text-sm text-slate-200 disabled:opacity-50 focus:border-emerald-600 focus:outline-none"
        >
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!point && (
        <p className="mt-2 text-xs text-slate-500">
          Tip: click “Sort by distance” to rank hospitals from your current location.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <ul className="mt-3 divide-y divide-navy-800">
        {rows.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => onSelect?.(h)}
              className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-navy-800/40"
            >
              <div className="min-w-44 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  {h.name}
                  {h.open_alerts > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                      <Siren size={10} /> {h.open_alerts} inbound
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {(h.specialties || []).slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="rounded border border-navy-700 bg-navy-950 px-1.5 py-0.5 text-[10px] text-slate-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {h.distance_km != null && (
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-sm font-bold text-sky-300">
                    <Navigation size={12} /> {h.distance_km.toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ~{h.eta_minutes} min ETA
                  </div>
                </div>
              )}

              <div className="w-24 text-right">
                <div
                  className={`text-sm font-bold ${
                    h.available_beds > 20
                      ? 'text-emerald-400'
                      : h.available_beds > 0
                        ? 'text-amber-300'
                        : 'text-red-400'
                  }`}
                >
                  {h.available_beds} beds
                </div>
                <div className="text-[11px] text-slate-500">
                  of {h.total_beds}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {!loading && rows.length === 0 && !error && (
        <p className="py-4 text-center text-sm text-slate-500">
          <MapPin size={14} className="mr-1 inline" /> No hospitals match these filters.
        </p>
      )}
      {loading && rows.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-500">Loading hospitals…</p>
      )}
    </section>
  )
}
