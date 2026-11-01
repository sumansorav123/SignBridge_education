/**
 * ICE (STUN/TURN) configuration built from Vite env variables.
 *
 *   VITE_STUN_URLS        optional, comma/space separated stun: URLs
 *   VITE_TURN_URLS        comma/space separated turn:/turns: URLs
 *   VITE_TURN_USERNAME    TURN username
 *   VITE_TURN_CREDENTIAL  TURN credential
 *
 * IMPORTANT: anything prefixed VITE_ is bundled into public JavaScript. A static
 * TURN username/password is therefore visible to every visitor. It is fine for
 * local testing; in production issue short-lived credentials (coturn
 * `use-auth-secret` / TURN REST API) from the backend instead.
 */

export const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

const STUN_RE = /^stuns?:/i
const TURN_RE = /^turns?:/i

export function splitUrls(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Returns the RTCConfiguration.iceServers array. Invalid URLs are dropped. */
export function buildIceServers(env = {}) {
  const stun = splitUrls(env.VITE_STUN_URLS).filter((url) => STUN_RE.test(url))
  const turn = splitUrls(env.VITE_TURN_URLS).filter((url) => TURN_RE.test(url))
  const servers = [{ urls: stun.length ? stun : DEFAULT_STUN_URLS }]
  if (turn.length) {
    const username = (env.VITE_TURN_USERNAME || '').trim()
    const credential = (env.VITE_TURN_CREDENTIAL || '').trim()
    if (username && credential) {
      servers.push({ urls: turn, username, credential })
    }
    // TURN URLs without credentials would be rejected by every TURN server, so
    // they are skipped rather than silently producing a broken relay config.
  }
  return servers
}

/** True when a relay (TURN) server is configured. Never implies it was tested. */
export function hasTurn(servers) {
  return servers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => TURN_RE.test(url)),
  )
}

export function iceServersFromViteEnv() {
  // eslint-disable-next-line no-undef
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
  return buildIceServers(env)
}
