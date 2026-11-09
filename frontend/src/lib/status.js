export const STATUS_STYLES = {
  REPORTED: 'bg-red-500/15 text-red-400 border-red-500/40',
  VERIFIED: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  ASSIGNED: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  RESPONDING: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  ARRIVED: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
  CANCELLED: 'bg-slate-700/40 text-slate-500 border-slate-600/40',
}

export const PRIORITY_STYLES = {
  L1: 'bg-red-600 text-white',
  L2: 'bg-amber-400 text-navy-950',
  L3: 'bg-emerald-500 text-navy-950',
  L4: 'bg-sky-400 text-navy-950',
}

export const STATUS_DOT = {
  REPORTED: '#ef4444',
  VERIFIED: '#f59e0b',
  ASSIGNED: '#0ea5e9',
  RESPONDING: '#6366f1',
  ARRIVED: '#14b8a6',
  CLOSED: '#64748b',
  CANCELLED: '#475569',
}

export function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
