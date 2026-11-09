import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin } from 'lucide-react'

function ClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function Recenter({ latitude, longitude }) {
  const map = useMap()
  useEffect(() => {
    if (latitude != null && longitude != null) {
      map.setView([latitude, longitude], map.getZoom(), { animate: false })
    }
  }, [latitude, longitude, map])
  return null
}

export default function LocationPicker({ latitude, longitude, onPick }) {
  if (latitude == null || longitude == null) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-navy-700 bg-navy-950/60 text-sm text-slate-500">
        <MapPin size={20} />
        Enter coordinates or use your location to pick a point on the map.
      </div>
    )
  }

  return (
    <div className="h-56 overflow-hidden rounded-lg border border-navy-700">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter latitude={latitude} longitude={longitude} />
        <ClickHandler onPick={onPick} />
        <CircleMarker
          center={[latitude, longitude]}
          radius={9}
          pathOptions={{
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.85,
            weight: 2,
          }}
        />
      </MapContainer>
    </div>
  )
}
