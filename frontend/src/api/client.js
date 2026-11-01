import axios from 'axios'
import { API_ROOT } from './config'
import { tokenStore } from './tokenStore'

const api = axios.create({
  baseURL: API_ROOT,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise = null

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export async function refreshSession() {
  if (!refreshPromise) {
    const refresh = tokenStore.refresh
    if (!refresh) return null
    refreshPromise = axios
      .post(`${API_ROOT}/auth/refresh`, { refresh_token: refresh }, { timeout: 20000 })
      .then((response) => {
        tokenStore.set(response.data)
        window.dispatchEvent(new CustomEvent('signbridge:session', { detail: response.data.user }))
        return response.data
      })
      .catch((error) => {
        tokenStore.clear()
        window.dispatchEvent(new CustomEvent('signbridge:logout', { detail: { expired: true } }))
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const isAuthCall = /\/auth\/(login|register|refresh)/.test(original?.url || '')
    if (status === 401 && original && !original._retried && !isAuthCall && tokenStore.refresh) {
      original._retried = true
      try {
        const session = await refreshSession()
        if (session?.access_token) {
          original.headers = original.headers || {}
          original.headers.Authorization = `Bearer ${session.access_token}`
          return api(original)
        }
      } catch {
        /* fall through to the original failure */
      }
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join(' ')
  }
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail)
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (error?.message === 'Network Error') {
    return 'Cannot reach the SignBridge API. Is the backend running on port 8000?'
  }
  return error?.message || fallback
}

export default api
