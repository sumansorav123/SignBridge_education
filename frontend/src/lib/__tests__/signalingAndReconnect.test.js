import test from 'node:test'
import assert from 'node:assert/strict'
import { nextPeerRetryDelay, shouldRetryPeer, deriveConnectionState, canApplyAnswer, enqueueCandidate, isDuplicateOffer, parseCandidate } from '../webrtcSignaling.js'
import { computeReconnectDelay, shouldReconnect, classifySocketClose } from '../reconnect.js'

test('peer retry is bounded with exponential backoff', () => {
  assert.equal(nextPeerRetryDelay(1), 1000)
  assert.equal(nextPeerRetryDelay(3), 4000)
  assert.equal(nextPeerRetryDelay(20), 15000)
  assert.equal(shouldRetryPeer(4), true)
  assert.equal(shouldRetryPeer(5), false)
})

test('connection state derivation', () => {
  assert.equal(deriveConnectionState({}), 'idle')
  assert.equal(deriveConnectionState({ a: 'failed', b: 'connected' }), 'connected')
  assert.equal(deriveConnectionState({ a: 'disconnected' }), 'reconnecting')
  assert.equal(deriveConnectionState({ a: 'failed' }), 'failed')
})

test('signalling guards', () => {
  assert.equal(canApplyAnswer('have-local-offer'), true)
  assert.equal(canApplyAnswer('stable'), false)
  assert.equal(isDuplicateOffer({ remoteSdp: 'x' }, 'x'), true)
  const c = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }
  assert.equal(enqueueCandidate(enqueueCandidate([], c), c).length, 1)
  assert.equal(parseCandidate(JSON.stringify(c)).candidate, 'candidate:1')
  assert.equal(parseCandidate(''), null)
})

test('websocket reconnect policy never retries auth/forbidden closes', () => {
  const noJitter = { random: () => 0.5 }
  assert.equal(computeReconnectDelay(1, noJitter), 800)
  assert.ok(computeReconnectDelay(30, noJitter) <= 30000)
  assert.equal(shouldReconnect(8), false)
  assert.equal(classifySocketClose(4403).action, 'stop')
  assert.equal(classifySocketClose(4401).action, 'refresh-or-stop')
  assert.equal(classifySocketClose(1006, { online: false }).action, 'wait-for-online')
  assert.equal(classifySocketClose(1006).action, 'retry')
})
