import { Link } from 'react-router-dom'
import { Siren, MapPin, ShieldCheck, Activity } from 'lucide-react'

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center gap-3 py-6">
        <Activity className="text-red-500" />
        <span className="text-lg font-bold tracking-wide">LifeLink</span>
        <span className="ml-auto text-xs text-slate-400">
          Educational demo · simulated response
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
          Every second counts.
          <br />
          <span className="text-red-500">Report an emergency now.</span>
        </h1>
        <p className="mt-4 max-w-xl text-slate-400">
          Share your location, describe the incident and patient condition.
          The control room is alerted instantly with everything they need.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            to="/emergency"
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500"
          >
            <Siren /> SOS — Report Emergency
          </Link>
          <Link
            to="/track"
            className="flex items-center justify-center gap-2 rounded-xl border border-navy-700 bg-navy-900 px-8 py-4 text-lg font-semibold text-slate-200 transition hover:bg-navy-800"
          >
            <MapPin /> Track an incident
          </Link>
        </div>

        <div className="mt-14 grid gap-4 text-left sm:grid-cols-3">
          {[
            [ShieldCheck, 'Instant alert', 'Control room sees your incident live.'],
            [MapPin, 'GPS location', 'One tap shares your exact position.'],
            [Activity, 'Patient triage', 'Guided observations for responders.'],
          ].map(([Icon, title, body], i) => (
            <div key={i} className="rounded-xl border border-navy-700 bg-navy-900 p-5">
              <Icon className="mb-2 text-red-500" size={20} />
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-slate-400">{body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
