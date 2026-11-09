import { Radio } from 'lucide-react'

export default function LiveBadge({ connected, label = 'LIVE' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        connected
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-amber-500/15 text-amber-300'
      }`}
      title={connected ? 'Realtime updates connected' : 'Reconnecting…'}
    >
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
      </span>
      {connected ? label : 'SYNCING'}
      <Radio size={12} />
    </span>
  )
}
