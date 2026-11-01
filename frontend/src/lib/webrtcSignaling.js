/**
 * Pure WebRTC signalling helpers. These are intentionally browser-free so the
 * duplicate-offer, duplicate-ICE and retry-limit rules can be unit tested.
 */

export const MAX_QUEUED_ICE = 100
export const DEFAULT_PEER_RETRY = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 15000 }

export function parseCandidate(value) {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed?.candidate) return null
    return parsed
  } catch {
    // Some browsers/clients send a bare candidate string.
    return String(value).trim() ? { candidate: String(value) } : null
  }
}

export function candidateKey(candidate) {
  if (!candidate?.candidate) return ''
  return `${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}|${candidate.candidate}`
}

export function enqueueCandidate(queue, candidate, limit = MAX_QUEUED_ICE) {
  const current = Array.isArray(queue) ? queue : []
  if (!candidate?.candidate) return current
  const key = candidateKey(candidate)
  if (current.some((item) => candidateKey(item) === key)) return current
  const next = [...current, candidate]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function isDuplicateOffer(existing, sdp) {
  return Boolean(existing?.remoteSdp && sdp && existing.remoteSdp === sdp)
}

export function canApplyAnswer(signalingState) {
  return signalingState === 'have-local-offer'
}

export function canApplyRemoteOffer(signalingState) {
  return signalingState === 'stable' || signalingState === 'have-local-offer'
}

export function nextPeerRetryDelay(attempt, options = {}) {
  const config = { ...DEFAULT_PEER_RETRY, ...options }
  const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1))
  return Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** Math.min(safeAttempt - 1, 8))
}

export function shouldRetryPeer(attempt, maxAttempts = DEFAULT_PEER_RETRY.maxAttempts) {
  return Number(attempt) < Number(maxAttempts)
}

/**
 * Collapse individual peer states into one label for the classroom header.
 * A single connected peer wins, then connecting, then failed.
 */
export function deriveConnectionState(peerStates = {}) {
  const states = Object.values(peerStates || {})
  if (!states.length) return 'idle'
  if (states.some((state) => state === 'connected')) return 'connected'
  if (states.some((state) => state === 'connecting' || state === 'new')) return 'connecting'
  if (states.some((state) => state === 'failed')) return 'failed'
  if (states.some((state) => state === 'disconnected')) return 'reconnecting'
  return states[0] || 'idle'
}

export function isPeerDead(state) {
  return state === 'failed' || state === 'closed'
}
