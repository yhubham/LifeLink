import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { listAmbulances, listHospitals, listIncidents } from '../../services/api'
import { STATUS_DOT, formatTime } from '../../lib/status'

const DELHI = [28.6139, 77.209]

export default function MapView() {
  const [incidents, setIncidents] = useState([])
  const [ambulances, setAmbulances] = useState([])
  const [hospitals, setHospitals] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listIncidents(), listAmbulances(), listHospitals()])
      .then(([inc, amb, hosp]) => {
        setIncidents(inc)
        setAmbulances(amb)
        setHospitals(hosp)
      })
      .catch((e) => setError(e.response?.data?.detail || 'Could not load map data.'))
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Live emergency map</h1>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
          {incidents.length} incidents
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 h-[65vh] overflow-hidden rounded-xl border border-navy-700">
        <MapContainer center={DELHI} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {incidents.map((inc) => (
            <CircleMarker
              key={inc.id}
              center={[inc.latitude, inc.longitude]}
              radius={10}
              pathOptions={{
                color: STATUS_DOT[inc.status] || '#64748b',
                fillColor: STATUS_DOT[inc.status] || '#64748b',
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{inc.public_code}</div>
                  <div>{inc.incident_type}</div>
                  <div>{inc.status}</div>
                  <div className="text-slate-500">{formatTime(inc.reported_at)}</div>
                  <Link to={`/admin/incidents/${inc.id}`}>Open incident →</Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          {ambulances
            .filter((a) => a.latitude != null)
            .map((a) => (
              <CircleMarker
                key={a.id}
                center={[a.latitude, a.longitude]}
                radius={7}
                pathOptions={{
                  color: '#38bdf8',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">{a.call_sign}</div>
                    <div>{a.status}</div>
                    <div className="text-slate-500">simulated GPS</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          {hospitals.map((h) => (
            <CircleMarker
              key={h.id}
              center={[h.latitude, h.longitude]}
              radius={9}
              pathOptions={{
                color: '#34d399',
                fillColor: '#34d399',
                fillOpacity: 0.5,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{h.name}</div>
                  <div>{h.available_beds} / {h.total_beds} beds free</div>
                  <div className="text-slate-500">mock capacity</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        {Object.entries(STATUS_DOT).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {status}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> AMBULANCE
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> HOSPITAL
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Incidents are live from the database; ambulance GPS and hospital capacity are
        simulated.
      </p>
    </div>
  )
}
