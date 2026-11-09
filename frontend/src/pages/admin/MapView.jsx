import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { listIncidents } from '../../services/api'
import { STATUS_DOT, formatTime } from '../../lib/status'

const DELHI = [28.6139, 77.209]

export default function MapView() {
  const [incidents, setIncidents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    listIncidents()
      .then(setIncidents)
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
        </MapContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        {Object.entries(STATUS_DOT).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {status}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Simulated data — ambulance and hospital layers arrive in week 5.
      </p>
    </div>
  )
}
