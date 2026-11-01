import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { errorMessage } from '@/api/client'
import { cacheUser, readCachedUser, tokenStore } from '@/api/tokenStore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readCachedUser())
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const applyUser = useCallback((nextUser) => {
    setUser(nextUser)
    cacheUser(nextUser)
  }, [])

  const clearSession = useCallback(() => {
    tokenStore.clear()
    cacheUser(null)
    setUser(null)
  }, [])

  useEffect(() => {
    let alive = true
    async function bootstrap() {
      try {
        if (!tokenStore.access && tokenStore.refresh) {
          const { data } = await api.post('/auth/refresh', { refresh_token: tokenStore.refresh })
          tokenStore.set(data)
          if (alive) applyUser(data.user)
        } else if (tokenStore.access) {
          const { data } = await api.get('/auth/me')
          if (alive) applyUser(data)
        } else {
          clearSession()
        }
      } catch (error) {
        if (alive) {
          setAuthError(errorMessage(error, 'Your session has expired. Please sign in again.'))
          clearSession()
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    bootstrap()
    return () => {
      alive = false
    }
  }, [applyUser, clearSession])

  useEffect(() => {
    function onLogout() {
      clearSession()
    }
    function onSession(event) {
      if (event.detail) applyUser(event.detail)
    }
    window.addEventListener('signbridge:logout', onLogout)
    window.addEventListener('signbridge:session', onSession)
    return () => {
      window.removeEventListener('signbridge:logout', onLogout)
      window.removeEventListener('signbridge:session', onSession)
    }
  }, [applyUser, clearSession])

  const login = useCallback(
    async ({ email, password, role }) => {
      setAuthError('')
      const { data } = await api.post('/auth/login', { email, password, role })
      tokenStore.set(data)
      applyUser(data.user)
      return data.user
    },
    [applyUser],
  )

  const register = useCallback(
    async (payload) => {
      setAuthError('')
      const { data } = await api.post('/auth/register', payload)
      tokenStore.set(data)
      applyUser(data.user)
      return data.user
    },
    [applyUser],
  )

  const logout = useCallback(async () => {
    try {
      if (tokenStore.access) await api.post('/auth/logout')
    } catch {
      /* clearing locally is still correct */
    } finally {
      clearSession()
    }
  }, [clearSession])

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      applyUser(data)
      return data
    } catch {
      return null
    }
  }, [applyUser])

  const updateProfile = useCallback(
    async (payload) => {
      const { data } = await api.patch('/auth/me', payload)
      applyUser(data)
      return data
    },
    [applyUser],
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      isAuthenticated: Boolean(user),
      role: user?.role || null,
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
      setUser: applyUser,
    }),
    [user, loading, authError, login, register, logout, refreshUser, updateProfile, applyUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
