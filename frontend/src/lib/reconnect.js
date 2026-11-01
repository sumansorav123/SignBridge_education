/**
 * Pure reconnect policy used by the classroom WebSocket.
 *
 * Keeping this out of the React hook makes the limits and backoff directly
 * testable without a browser or a live socket.
 */

export const DEFAULT_RECONNECT = {
  baseDelayMs: 800,
  maxDelayMs: 30000,
  maxAttempts: 8,
  jitterRatio: 0.2,
}

export function computeReconnectDelay(attempt, options = {}) {
  const config = { ...DEFAULT_RECONNECT, ...options }
  const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1))
  const exponential = Math.min(
    config.maxDelayMs,
    config.baseDelayMs * 2 ** Math.min(safeAttempt - 1, 10),
  )
  const random = typeof options.random === 'function' ? options.random : Math.random
  const jitter = exponential * config.jitterRatio * (random() * 2 - 1)
  return Math.max(0, Math.round(exponential + jitter))
}

export function shouldReconnect(attempt, maxAttempts = DEFAULT_RECONNECT.maxAttempts) {
  return Number(attempt) < Number(maxAttempts)
}

export function nextAttempt(attempt) {
  return Math.max(0, Math.floor(Number(attempt) || 0)) + 1
}

/**
 * Close codes that must never trigger an automatic retry.
 * 1000 = normal closure, 4401 = unauthenticated, 4403 = forbidden.
 */
export function classifySocketClose(code, { manual = false, online = true } = {}) {
  if (manual || code === 1000) return { action: 'stop', status: 'closed', retry: false }
  if (code === 4401) {
    return {
      action: 'refresh-or-stop',
      status: 'unauthorized',
      retry: false,
      message: 'Your session expired. Sign in again to rejoin the classroom.',
    }
  }
  if (code === 4403) {
    return {
      action: 'stop',
      status: 'denied',
      retry: false,
      message: 'You do not have access to this classroom.',
    }
  }
  if (!online) {
    return {
      action: 'wait-for-online',
      status: 'offline',
      retry: true,
      message: 'You are offline. The classroom will reconnect when the network returns.',
    }
  }
  return { action: 'retry', status: 'reconnecting', retry: true, message: 'Live connection lost. Reconnecting…' }
}
