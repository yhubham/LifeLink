import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Siren, Loader2 } from 'lucide-react'
import CallButton from '../../components/common/CallButton'
import { useReportStore } from '../../context/reportStore'

export default function Emergency() {
  const navigate = useNavigate()
  const setLocation = useReportStore((s) => s.setLocation)
  const [status, setStatus] = useState('idle') // idle | locating | denied

  function handleSOS() {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(pos.coords.latitude, pos.coords.longitude)
        navigate('/emergency/report')
      },
      () => {
        // Fallback: Delhi centre so the demo still works without GPS permission
        setLocation(28.6139, 77.209, 'Location permission denied — default (New Delhi)')
        navigate('/emergency/report')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <CallButton />
      <p className="text-sm uppercase tracking-widest text-slate-400">
        Emergency SOS
      </p>
      <button
        onClick={handleSOS}
        disabled={status === 'locating'}
        className="mt-8 flex h-64 w-64 items-center justify-center rounded-full bg-red-600 text-3xl font-extrabold text-white shadow-[0_0_80px_rgba(225,29,72,0.5)] transition active:scale-95 disabled:opacity-70 sm:h-72 sm:w-72"
      >
        {status === 'locating' ? (
          <span className="flex flex-col items-center gap-3 text-lg">
            <Loader2 className="animate-spin" /> Locating…
          </span>
        ) : (
          'SOS'
        )}
      </button>
      <p className="mt-8 max-w-sm text-slate-400">
        Press to share your GPS location and continue to the incident report.
        This is a simulated demo — no real dispatch services are contacted.
      </p>
      {status === 'denied' && (
        <p className="mt-3 text-sm text-amber-400">
          Using default location (New Delhi).
        </p>
      )}
      <button
        onClick={() => navigate('/')}
        className="mt-8 text-sm text-slate-500 underline hover:text-slate-300"
      >
        Cancel
      </button>
    </div>
  )
}
