import { Phone } from 'lucide-react'

// Demo hotline — change this single constant to update the number everywhere.
export const EMERGENCY_CALL_NUMBER = '859505879'

export default function CallButton({ compact = false }) {
  return (
    <a
      href={`tel:${EMERGENCY_CALL_NUMBER}`}
      aria-label={`Call ${EMERGENCY_CALL_NUMBER}`}
      className={`fixed bottom-5 right-5 z-[1200] flex items-center gap-2 rounded-full bg-emerald-600 font-bold text-white shadow-xl shadow-black/40 transition hover:bg-emerald-500 active:scale-95 ${
        compact ? 'px-4 py-3 text-sm' : 'px-5 py-3.5'
      }`}
    >
      <Phone size={18} />
      <span className="hidden sm:inline">Call {EMERGENCY_CALL_NUMBER}</span>
      <span className="sm:hidden">Call</span>
    </a>
  )
}
