import { useEffect } from 'react'
import { notificationsSocketUrl } from '@/api/config'
import { refreshSession } from '@/api/client'
import { tokenStore } from '@/api/tokenStore'

export default function useJoinRequestNotifications(userId) {
  useEffect(() => {
    if (!userId) return undefined

    let active = true
    let socket = null
    let retryTimer = null
    let attempts = 0
    let refreshAttempted = false

    function scheduleReconnect() {
      if (!active || retryTimer !== null) return
      attempts += 1
      const delay = Math.min(30000, 800 * 2 ** Math.min(attempts - 1, 5))
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        connect()
      }, delay)
    }

    function connect() {
      if (!active || socket) return
      if (!tokenStore.access) {
        scheduleReconnect()
        return
      }

      try {
        socket = new WebSocket(notificationsSocketUrl())
      } catch {
        socket = null
        scheduleReconnect()
        return
      }

      const currentSocket = socket
      currentSocket.onopen = () => {
        currentSocket.send(JSON.stringify({ type: 'auth', token: tokenStore.access }))
      }
      currentSocket.onmessage = (message) => {
        let event
        try {
          event = JSON.parse(message.data)
        } catch {
          return
        }
        if (event.type === 'ready') {
          attempts = 0
          refreshAttempted = false
          return
        }
        window.dispatchEvent(new CustomEvent('signbridge:join-request', { detail: event }))
      }
      currentSocket.onclose = async (event) => {
        if (socket === currentSocket) socket = null
        if (!active) return
        if (event.code === 4403) return
        if (event.code === 4401 && !refreshAttempted && tokenStore.refresh) {
          refreshAttempted = true
          try {
            await refreshSession()
            if (active) {
              connect()
              return
            }
          } catch {
            return
          }
        }
        scheduleReconnect()
      }
    }

    connect()
    return () => {
      active = false
      window.clearTimeout(retryTimer)
      retryTimer = null
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, 'Leaving notifications')
      }
      socket = null
    }
  }, [userId])
}
