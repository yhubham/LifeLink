import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
})

// Attach the staff JWT (persisted by the auth store) to every request.
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('lifelink-auth')
    const token = raw ? JSON.parse(raw)?.state?.token : null
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {
    /* ignore malformed storage */
  }
  return config
})

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export async function createIncident(payload) {
  const { data } = await api.post('/incidents', payload)
  return data
}

export async function trackIncident(publicCode) {
  const { data } = await api.get(`/incidents/track/${publicCode}`)
  return data
}

export async function listIncidents(params = {}) {
  const { data } = await api.get('/incidents', { params })
  return data
}

export async function getIncident(id) {
  const { data } = await api.get(`/incidents/${id}`)
  return data
}

export async function getStats() {
  const { data } = await api.get('/incidents/stats')
  return data
}

export async function verifyIncident(id) {
  const { data } = await api.post(`/incidents/${id}/verify`)
  return data
}

export async function closeIncident(id) {
  const { data } = await api.post(`/incidents/${id}/close`)
  return data
}

export async function submitTriage(patientId, answers) {
  const { data } = await api.post(`/patients/${patientId}/triage`, { answers })
  return data
}

export async function getTriageHistory(patientId) {
  const { data } = await api.get(`/patients/${patientId}/triage`)
  return data
}

export default api
