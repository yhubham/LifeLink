import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, LayoutDashboard, ShieldCheck } from 'lucide-react'
import {
  DASHBOARD_META,
  dashboardForPath,
  useAuthStore,
} from '../../context/authStore'

/**
 * Shows the active dashboard and lets a user switch only to dashboards they
 * are explicitly authorized to use. The backend still enforces every API role.
 */
export default function DashboardSwitcher() {
  const location = useLocation()
  const dashboards = useAuthStore((s) => s.dashboards)
  const fallback = useAuthStore((s) => s.defaultDashboard)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current =
    dashboardForPath(location.pathname) || fallback || dashboards?.[0] || 'admin'
  const available = dashboards?.length ? dashboards : [current]
  const meta = DASHBOARD_META[current] || DASHBOARD_META.admin

  useEffect(() => {
    function onPointer(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  if (available.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300">
        <LayoutDashboard size={13} className="text-slate-500" />
        {meta.short}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-navy-800"
      >
        <ShieldCheck size={13} className="text-emerald-400" />
        <span className="hidden sm:inline text-slate-500">Dashboard:</span>
        <span>{meta.short}</span>
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-navy-700 bg-navy-900 shadow-xl shadow-black/40"
        >
          <div className="border-b border-navy-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Switch dashboard
          </div>
          {available.map((dashboard) => {
            const item = DASHBOARD_META[dashboard]
            if (!item) return null
            const active = dashboard === current
            return (
              <Link
                key={dashboard}
                to={item.home}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'text-slate-300 hover:bg-navy-800'
                }`}
              >
                <span>{item.label}</span>
                {active && <span className="text-[10px] font-bold">ACTIVE</span>}
              </Link>
            )
          })}
          <div className="border-t border-navy-800 px-3 py-2 text-[10px] text-slate-600">
            Visibility follows your account permissions.
          </div>
        </div>
      )}
    </div>
  )
}
