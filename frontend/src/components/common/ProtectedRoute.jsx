import { Navigate } from 'react-router-dom'
import { homeForRole, useAuthStore } from '../../context/authStore'

export default function ProtectedRoute({ children, roles }) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.role)
  if (!token) return <Navigate to="/admin/login" replace />
  if (roles && !roles.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />
  }
  return children
}
