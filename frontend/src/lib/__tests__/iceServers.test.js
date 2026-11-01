import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIceServers, hasTurn, splitUrls, DEFAULT_STUN_URLS } from '../iceServers.js'

test('defaults to public STUN only and no TURN', () => {
  const s = buildIceServers({})
  assert.deepEqual(s, [{ urls: DEFAULT_STUN_URLS }])
  assert.equal(hasTurn(s), false)
})

test('adds TURN with credentials, multiple urls, comma or space separated', () => {
  const s = buildIceServers({
    VITE_TURN_URLS: 'turn:t.example.com:3478?transport=udp, turns:t.example.com:5349 turn:t.example.com:3478?transport=tcp',
    VITE_TURN_USERNAME: 'user', VITE_TURN_CREDENTIAL: 'secret',
  })
  assert.equal(s.length, 2)
  assert.equal(s[1].urls.length, 3)
  assert.equal(s[1].username, 'user')
  assert.equal(hasTurn(s), true)
})

test('TURN without credentials is skipped, not emitted half-configured', () => {
  const s = buildIceServers({ VITE_TURN_URLS: 'turn:t.example.com:3478' })
  assert.equal(hasTurn(s), false)
})

test('custom STUN replaces defaults and invalid schemes are dropped', () => {
  const s = buildIceServers({ VITE_STUN_URLS: 'stun:a.example.com:3478,http://bad', VITE_TURN_URLS: 'http://nope', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'c' })
  assert.deepEqual(s, [{ urls: ['stun:a.example.com:3478'] }])
  assert.deepEqual(splitUrls(undefined), [])
})
