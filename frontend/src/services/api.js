import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
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
  setToken(data.access_token)
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

export default api
