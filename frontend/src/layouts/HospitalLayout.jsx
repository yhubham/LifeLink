import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  Activity,
  LayoutDashboard,
  BellRing,
  BedDouble,
  LogOut,
  HeartPulse,
} from 'lucide-react'
import { useAuthStore } from '../context/authStore'

const NAV = [
  ['/hospital/dashboard', 'Dashboard', LayoutDashboard],
  ['/hospital/alerts', 'Incoming alerts', BellRing],
  ['/hospital/capacity', 'Capacity', BedDouble],
]

export default function HospitalLayout() {
  const { fullName, role, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900 p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <Activity className="text-red-500" size={20} />
          <span className="font-bold">LifeLink</span>
        </Link>
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
          <HeartPulse size={14} /> HOSPITAL DESK
        </div>

        <nav className="space-y-1">
          {NAV.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-navy-800 pt-4">
          <div className="px-3 text-sm font-semibold">{fullName}</div>
          <div className="px-3 text-xs text-slate-500">{role}</div>
          <button
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-navy-800"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center gap-3 border-b border-navy-800 bg-navy-950/80 px-6 py-4">
          <span className="text-sm font-semibold text-slate-300">Hospital coordination</span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
            SIMULATION LIVE
          </span>
          <span className="ml-auto text-xs text-slate-500">
            Capacity and pre-alerts are simulated
          </span>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
