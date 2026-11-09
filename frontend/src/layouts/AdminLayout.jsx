import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  Activity,
  LayoutDashboard,
  List,
  Map,
  LogOut,
  Ambulance,
  Building2,
} from 'lucide-react'
import { useAuthStore } from '../context/authStore'
import MobileNav from '../components/common/MobileNav'
import DashboardSwitcher from '../components/common/DashboardSwitcher'
import CallCenter from '../components/calls/CallCenter'

const NAV = [
  ['/admin/dashboard', 'Overview', LayoutDashboard],
  ['/admin/incidents', 'Incidents', List],
  ['/admin/map', 'Live map', Map],
  ['/admin/ambulances', 'Ambulances', Ambulance],
  ['/admin/hospitals', 'Hospitals', Building2],
]

export default function AdminLayout() {
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

        <nav className="space-y-1">
          {NAV.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-red-600/15 text-red-400'
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
        <header className="flex items-center gap-3 border-b border-navy-800 bg-navy-950/80 px-4 py-4 md:px-6">
          <span className="text-sm font-semibold text-slate-300">Control room</span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
            SIMULATION LIVE
          </span>
          <div className="ml-auto">
            <DashboardSwitcher />
          </div>
        </header>
        <main className="p-4 pb-24 md:p-6">
          <Outlet />
        </main>
      </div>

      <MobileNav items={NAV} activeClass="text-red-400" />
      <CallCenter />
    </div>
  )
}
