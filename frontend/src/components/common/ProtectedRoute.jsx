import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../context/authStore'

export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/admin/login" replace />
  return children
}
