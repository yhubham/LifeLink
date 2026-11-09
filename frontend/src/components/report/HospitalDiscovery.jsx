import { useCallback, useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BedDouble,
  Building2,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { discoverHospitals } from '../../services/api'

const RADIUS_OPTIONS = [5000, 10000, 20000]
const EXPAND_PROMPT_THRESHOLD = 3

function MapFocus({ latitude, longitude }) {
  const map = useMap()
  useEffect(() => {
    if (latitude == null || longitude == null) return
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15), {
      animate: false,
    })
  }, [latitude, longitude, map])
  return null
}

export default function HospitalDiscovery({
  latitude,
  longitude,
  selected,
  onSelect,
}) {
  const [rows, setRows] = useState([])
  const [radius, setRadius] = useState(RADIUS_OPTIONS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    if (latitude == null || longitude == null) {
      setRows([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await discoverHospitals({
        latitude,
        longitude,
        radius,
        limit: 50,
      })
      setRows(data.results || [])
      setNote(data.availability_note || '')
    } catch (e) {
      setRows([])
      setError(
        e.response?.data?.detail ||
          'Could not search nearby hospitals right now. You can still submit the report.'
      )
    } finally {
      setLoading(false)
    }
  }, [latitude, longitude, radius])

  useEffect(() => {
    if (latitude == null || longitude == null) return undefined
    const timer = setTimeout(load, 350)
    return () => clearTimeout(timer)
  }, [load, latitude, longitude, reloadKey])

  const nextRadius = RADIUS_OPTIONS.find((value) => value > radius)
  const canExpand =
    !loading && !error && rows.length < EXPAND_PROMPT_THRESHOLD && Boolean(nextRadius)

  if (latitude == null || longitude == null) {
    return (
      <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Building2 size={17} className="text-emerald-400" /> Nearby hospitals
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Add your location above to search for hospitals near you.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 size={17} className="text-emerald-400" />
        <h2 className="font-bold">Nearby hospitals</h2>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
          GEOAPIFY
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-1.5 text-xs text-slate-200"
          >
            {RADIUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                Within {value / 1000} km
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReloadKey((n) => n + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-navy-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-navy-800 disabled:opacity-60"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Hospitals are found with the Geoapify Places API near your location and
        sorted by distance. Their bed availability is not verified; choosing one
        only records your preference.
      </p>

      {error && (
        <p className="mt-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          {error}
        </p>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              Searching nearby hospitals…
            </p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              <MapPin size={14} className="mr-1 inline" />
              No hospitals found within {radius / 1000} km.
            </p>
          )}
          {rows.map((h) => {
            const isSelected = selected?.place_id === h.place_id
            return (
              <button
                type="button"
                key={h.place_id}
                onClick={() => onSelect(isSelected ? null : h)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-navy-700 bg-navy-950/60 hover:border-navy-600'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-100">{h.name}</span>
                  {isSelected && (
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  )}
                  <span className="ml-auto flex items-center gap-1 text-xs font-bold text-sky-300">
                    <Navigation size={11} /> {h.distance_km?.toFixed(1)} km
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>{h.address || 'Address not listed'}</span>
                  {h.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={10} /> {h.phone}
                    </span>
                  )}
                  {h.website && (
                    <a
                      href={h.website}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-sky-400 hover:underline"
                    >
                      Website
                    </a>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  {Number(h.latitude).toFixed(5)}, {Number(h.longitude).toFixed(5)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {h.availability_verified ? (
                    <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      <BedDouble size={10} /> {h.available_beds} beds available
                      (verified)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      <ShieldAlert size={10} /> Availability not verified
                    </span>
                  )}
                  <span className="rounded bg-navy-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {h.discovery_source}
                  </span>
                </div>
              </button>
            )
          })}

          {canExpand && (
            <button
              type="button"
              onClick={() => setRadius(nextRadius)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-900/30"
            >
              <Navigation size={12} /> Only {rows.length} found — expand to{' '}
              {nextRadius / 1000} km
            </button>
          )}
        </div>

        <div className="h-80 overflow-hidden rounded-lg border border-navy-700">
          <MapContainer
            center={[latitude, longitude]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFocus
              latitude={selected?.latitude}
              longitude={selected?.longitude}
            />
            <CircleMarker
              center={[latitude, longitude]}
              radius={8}
              pathOptions={{
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>Your reported location</Popup>
            </CircleMarker>
            {rows.map((h) => (
              <CircleMarker
                key={h.place_id}
                center={[h.latitude, h.longitude]}
                radius={selected?.place_id === h.place_id ? 9 : 6}
                pathOptions={{
                  color:
                    selected?.place_id === h.place_id ? '#34d399' : '#38bdf8',
                  fillColor:
                    selected?.place_id === h.place_id ? '#34d399' : '#38bdf8',
                  fillOpacity: 0.8,
                  weight: 2,
                }}
                eventHandlers={{ click: () => onSelect(h) }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">{h.name}</div>
                    <div>{h.distance_km} km away</div>
                    <div>{h.address || 'Address not listed'}</div>
                    <div className="text-slate-500">
                      {Number(h.latitude).toFixed(5)},{' '}
                      {Number(h.longitude).toFixed(5)}
                    </div>
                    <div className="text-slate-500">
                      {h.availability_verified
                        ? `${h.available_beds} verified beds`
                        : 'Availability not verified'}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
          <CheckCircle2 size={14} />
          Selected: <span className="font-bold">{selected.name}</span>
          <span className="text-emerald-400/70">
            {selected.address || 'Address not listed'} ·{' '}
            {Number(selected.latitude).toFixed(5)},{' '}
            {Number(selected.longitude).toFixed(5)} (preference only — not a
            confirmed bed reservation)
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-auto text-emerald-400 hover:underline"
          >
            Clear
          </button>
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-slate-600">{note}</p>}
    </section>
  )
}
