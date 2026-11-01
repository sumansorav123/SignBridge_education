export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const configuredWs = (import.meta.env.VITE_WS_URL || '').replace(/\/+$/, '')

function deriveWsBase() {
  if (configuredWs) return configuredWs
  if (API_BASE) return API_BASE.replace(/^http/i, 'ws')
  if (typeof window === 'undefined') return 'ws://localhost:8000'
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
}

export const WS_BASE = deriveWsBase()

export const API_ROOT = `${API_BASE}/api`

export function apiUrl(path) {
  if (!path) return API_ROOT
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/api/')) return `${API_BASE}${path}`
  return `${API_BASE}/api${path.startsWith('/') ? path : `/${path}`}`
}

export function classroomSocketUrl(classroomId, token) {
  const url = `${WS_BASE}/ws/classroom/${classroomId}`
  // The token argument is a legacy compatibility path only. New callers
  // authenticate with an `auth` message so tokens never enter URL logs.
  return token ? `${url}?token=${encodeURIComponent(token)}` : url
}

export function notificationsSocketUrl() {
  return `${WS_BASE}/ws/notifications`
}
