import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classroomSocketUrl } from '@/api/config'
import { refreshSession } from '@/api/client'
import { tokenStore } from '@/api/tokenStore'
import {
  classifySocketClose,
  computeReconnectDelay,
  nextAttempt,
  shouldReconnect,
} from '@/lib/reconnect'

const AUTH_TIMEOUT_MS = 12000

export default function useClassroomSocket({ classroomId, enabled = true }) {
  const [status, setStatus] = useState(enabled ? 'connecting' : 'idle')
  const [error, setError] = useState('')
  const [connectionId, setConnectionId] = useState(null)
  const [attempts, setAttempts] = useState(0)
  const socketRef = useRef(null)
  const handlersRef = useRef(new Set())
  const attemptsRef = useRef(0)
  const timerRef = useRef(null)
  const authTimerRef = useRef(null)
  const aliveRef = useRef(true)
  const manualCloseRef = useRef(false)
  const refreshTriedRef = useRef(false)

  const subscribe = useCallback((handler) => {
    handlersRef.current.add(handler)
    return () => handlersRef.current.delete(handler)
  }, [])

  const send = useCallback((payload) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    try {
      socket.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }, [])

  const clearTimers = useCallback(() => {
    window.clearTimeout(timerRef.current)
    window.clearTimeout(authTimerRef.current)
    timerRef.current = null
    authTimerRef.current = null
  }, [])

  const scheduleConnect = useCallback((delay) => {
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      if (aliveRef.current) connectRef.current?.()
    }, Math.max(0, delay))
  }, [])

  const connect = useCallback(() => {
    if (!classroomId || !enabled) return
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return
    const token = tokenStore.access
    if (!token) {
      setStatus('error')
      setError('Your session is missing. Sign in again to join the classroom.')
      return
    }
    manualCloseRef.current = false
    setStatus(attemptsRef.current ? 'reconnecting' : 'connecting')
    setError('')
    let socket
    try {
      // No token in the URL: the first message authenticates the socket.
      socket = new WebSocket(classroomSocketUrl(classroomId))
    } catch {
      setStatus('error')
      setError('The live classroom connection could not be created.')
      return
    }
    socketRef.current = socket

    const failAuthentication = (message) => {
      window.clearTimeout(authTimerRef.current)
      setStatus('unauthorized')
      setError(message)
      try {
        socket.close(4401, 'Authentication failed')
      } catch {
        /* already closed */
      }
    }

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: 'auth', token: tokenStore.access }))
      } catch {
        failAuthentication('The live connection could not authenticate. Refresh and sign in again.')
        return
      }
      setStatus('authenticating')
      window.clearTimeout(authTimerRef.current)
      authTimerRef.current = window.setTimeout(() => {
        if (socketRef.current === socket && socket.readyState === WebSocket.OPEN) {
          failAuthentication('The classroom did not confirm your session in time. Please reconnect.')
        }
      }, AUTH_TIMEOUT_MS)
    }

    socket.onmessage = (event) => {
      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload?.type === 'ready') {
        window.clearTimeout(authTimerRef.current)
        refreshTriedRef.current = false
        attemptsRef.current = 0
        setAttempts(0)
        setConnectionId(payload.connection_id || null)
        setStatus('open')
        setError('')
      }
      if (payload?.type === 'error' && payload?.code === 'unauthenticated') {
        failAuthentication(payload.message || 'Your session expired. Sign in again.')
        return
      }
      handlersRef.current.forEach((handler) => {
        try {
          handler(payload)
        } catch {
          /* a page handler must not break the socket pipeline */
        }
      })
    }

    socket.onerror = () => {
      if (aliveRef.current) setError('The live connection encountered a network error.')
    }

    socket.onclose = async (event) => {
      window.clearTimeout(authTimerRef.current)
      const isCurrent = socketRef.current === socket
      if (isCurrent) socketRef.current = null
      if (!isCurrent) return
      if (!aliveRef.current || manualCloseRef.current) {
        setStatus('closed')
        return
      }
      const decision = classifySocketClose(event.code, {
        manual: manualCloseRef.current,
        online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      })
      if (decision.action === 'refresh-or-stop' && !refreshTriedRef.current) {
        refreshTriedRef.current = true
        setStatus('reconnecting')
        setError('Your session expired. Refreshing it before reconnecting…')
        try {
          await refreshSession()
          attemptsRef.current = 0
          setAttempts(0)
          scheduleConnect(250)
          return
        } catch {
          setStatus('unauthorized')
          setError('Your session expired. Sign in again to rejoin the classroom.')
          return
        }
      }
      if (decision.action === 'stop' || decision.action === 'refresh-or-stop') {
        setStatus(decision.status)
        setError(decision.message || event.reason || 'The live connection was closed.')
        return
      }
      if (decision.action === 'wait-for-online') {
        setStatus('offline')
        setError(decision.message)
        return
      }
      const attempt = nextAttempt(attemptsRef.current)
      attemptsRef.current = attempt
      setAttempts(attempt)
      if (!shouldReconnect(attempt)) {
        setStatus('offline')
        setError(
          'The classroom could not reconnect after several attempts. Check your network, then press Reconnect.',
        )
        return
      }
      setStatus('reconnecting')
      setError(decision.message)
      scheduleConnect(computeReconnectDelay(attempt))
    }
  }, [classroomId, enabled, scheduleConnect])

  // Keep a stable reference so the retry timer can call the latest connect.
  const connectRef = useRef(connect)
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    aliveRef.current = true
    attemptsRef.current = 0
    setAttempts(0)
    if (!enabled) {
      setStatus('idle')
      return undefined
    }
    connect()
    const handleOnline = () => {
      if (!aliveRef.current) return
      if (socketRef.current) return
      attemptsRef.current = 0
      setAttempts(0)
      scheduleConnect(250)
    }
    const handleOffline = () => {
      if (!aliveRef.current) return
      setStatus('offline')
      setError('You are offline. The classroom will reconnect when the network returns.')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      aliveRef.current = false
      manualCloseRef.current = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimers()
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Leaving classroom')
      setStatus('closed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, enabled])

  const reconnect = useCallback(() => {
    clearTimers()
    attemptsRef.current = 0
    setAttempts(0)
    refreshTriedRef.current = false
    const socket = socketRef.current
    if (socket) {
      manualCloseRef.current = true
      socketRef.current = null
      try {
        socket.close(1000, 'Manual reconnect')
      } catch {
        /* ignore */
      }
    }
    setStatus('reconnecting')
    setError('')
    window.setTimeout(() => {
      if (aliveRef.current) connect()
    }, 200)
  }, [clearTimers, connect])

  return useMemo(
    () => ({ status, error, connectionId, attempts, send, subscribe, reconnect }),
    [status, error, connectionId, attempts, send, subscribe, reconnect],
  )
}
