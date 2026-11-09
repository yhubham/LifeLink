import { Navigate } from 'react-router-dom'
import {
  defaultHomeForAuth,
  useAuthStore,
} from '../../context/authStore'

const ROLE_DASHBOARD = {
  ADMIN: 'admin',
  POLICE: 'admin',
  RESCUE: 'admin',
  AMBULANCE: 'ambulance',
  HOSPITAL: 'hospital',
}

export default function ProtectedRoute({ children, roles, dashboard }) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.role)
  const dashboards = useAuthStore((s) => s.dashboards)
  const defaultDashboard = useAuthStore((s) => s.defaultDashboard)

  if (!token) return <Navigate to="/admin/login" replace />

  const fallbackHome = () =>
    defaultHomeForAuth({ defaultDashboard, dashboards, role })

  if (roles && !roles.includes(role)) {
    return <Navigate to={fallbackHome()} replace />
  }

  if (dashboard) {
    const allowed = dashboards?.length
      ? dashboards.includes(dashboard)
      : ROLE_DASHBOARD[role] === dashboard
    if (!allowed) return <Navigate to={fallbackHome()} replace />
  }

  return children
}
