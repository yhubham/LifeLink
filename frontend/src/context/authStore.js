import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      role: null,
      fullName: null,
      setAuth: ({ access_token, role, full_name }) =>
        set({ token: access_token, role, fullName: full_name }),
      logout: () => set({ token: null, role: null, fullName: null }),
    }),
    { name: 'lifelink-auth' }
  )
)

export function getStoredToken() {
  try {
    const raw = localStorage.getItem('lifelink-auth')
    return raw ? JSON.parse(raw)?.state?.token ?? null : null
  } catch {
    return null
  }
}

export function homeForRole(role) {
  if (role === 'AMBULANCE') return '/ambulance/dashboard'
  if (role === 'HOSPITAL') return '/hospital/dashboard'
  if (role === 'ADMIN' || role === 'POLICE' || role === 'RESCUE') {
    return '/admin/dashboard'
  }
  return '/admin/login'
}
