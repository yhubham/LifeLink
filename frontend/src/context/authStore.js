import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DASHBOARD_META = {
  admin: { label: 'Admin / Control Room', short: 'Control room', home: '/admin/dashboard' },
  ambulance: { label: 'Ambulance / Responder', short: 'Ambulance', home: '/ambulance/dashboard' },
  hospital: { label: 'Hospital', short: 'Hospital', home: '/hospital/dashboard' },
}

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      userId: null,
      role: null,
      fullName: null,
      dashboards: [],
      defaultDashboard: null,
      setAuth: ({
        access_token,
        user_id,
        role,
        full_name,
        dashboards,
        default_dashboard,
      }) =>
        set({
          token: access_token,
          userId: user_id ?? null,
          role,
          fullName: full_name,
          dashboards: dashboards ?? [],
          defaultDashboard: default_dashboard ?? null,
        }),
      logout: () =>
        set({
          token: null,
          userId: null,
          role: null,
          fullName: null,
          dashboards: [],
          defaultDashboard: null,
        }),
    }),
    { name: 'lifelink-auth' }
  )
)

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem('lifelink-auth')
    return raw ? JSON.parse(raw)?.state ?? null : null
  } catch {
    return null
  }
}

export function getStoredToken() {
  return getStoredAuth()?.token ?? null
}

export function homeForRole(role) {
  if (role === 'AMBULANCE') return '/ambulance/dashboard'
  if (role === 'HOSPITAL') return '/hospital/dashboard'
  if (role === 'ADMIN' || role === 'POLICE' || role === 'RESCUE') {
    return '/admin/dashboard'
  }
  return '/admin/login'
}

export function homeForDashboard(dashboard) {
  return DASHBOARD_META[dashboard]?.home ?? '/admin/login'
}

export function defaultHomeForAuth(auth) {
  if (!auth) return '/admin/login'
  if (auth.defaultDashboard) return homeForDashboard(auth.defaultDashboard)
  if (auth.dashboards?.length) return homeForDashboard(auth.dashboards[0])
  return homeForRole(auth.role)
}

export function dashboardForPath(pathname) {
  if (pathname.startsWith('/ambulance')) return 'ambulance'
  if (pathname.startsWith('/hospital')) return 'hospital'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}
