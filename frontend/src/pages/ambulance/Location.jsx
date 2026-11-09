import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { getIncident, listAmbulances, myAssignments } from '../../services/api'
import { AMBULANCE_STYLES, formatTime } from '../../lib/status'

const DELHI = [28.6139, 77.209]

export default function AmbulanceLocation() {
  const [ambulances, setAmbulances] = useState([])
  const [incidents, setIncidents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listAmbulances(), myAssignments()])
      .then(async ([amb, asg]) => {
        setAmbulances(amb)
        const ids = [...new Set(asg.map((a) => a.incident_id))]
        const incs = await Promise.all(ids.map((id) => getIncident(id).catch(() => null)))
        setIncidents(incs.filter(Boolean))
      })
      .catch((e) => setError(e.response?.data?.detail || 'Could not load positions.'))
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Unit location</h1>
        <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-300">
          simulated GPS
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 h-[60vh] overflow-hidden rounded-xl border border-navy-700">
        <MapContainer center={DELHI} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {incidents.map((inc) => (
            <CircleMarker
              key={inc.id}
              center={[inc.latitude, inc.longitude]}
              radius={11}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{inc.public_code}</div>
                  <div>{inc.incident_type}</div>
                  <div>{inc.status}</div>
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
                radius={8}
                pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.85 }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">{a.call_sign}</div>
                    <div>{a.status}</div>
                    <div>
                      {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-navy-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {ambulances.map((a) => (
              <tr key={a.id} className="border-t border-navy-800 bg-navy-950/40">
                <td className="px-4 py-3 font-semibold">{a.call_sign}</td>
                <td className="px-4 py-3">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${AMBULANCE_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {a.latitude != null ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatTime(a.last_location_update)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Need to test tracking? Open an assignment and use “Simulate GPS step” or “Auto-drive”.
        <Link to="/ambulance/dashboard" className="ml-1 text-sky-300 hover:underline">
          Back to dashboard →
        </Link>
      </p>
    </div>
  )
}
