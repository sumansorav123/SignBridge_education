import test from 'node:test'
import assert from 'node:assert/strict'
import { HAND_CONNECTIONS, LANDMARK_COUNT, summarizeHands, describeTrackingError, cameraSupported, formatConfidence } from '../handTracking.js'

test('skeleton has 21 landmarks and valid connections', () => {
  assert.equal(LANDMARK_COUNT, 21)
  assert.equal(HAND_CONNECTIONS.length, 21)
  for (const [a, b] of HAND_CONNECTIONS) assert.ok(a >= 0 && b <= 20 && a !== b)
})

test('summarizeHands handles two hands, mirroring and empty results', () => {
  const pts = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0 }))
  const result = { landmarks: [pts, pts], handedness: [[{ categoryName: 'Left', score: 0.93 }], [{ categoryName: 'Right', score: 0.8 }]] }
  const mirrored = summarizeHands(result)
  assert.equal(mirrored.length, 2)
  assert.equal(mirrored[0].label, 'Right')
  assert.equal(mirrored[0].landmarkCount, 21)
  assert.equal(summarizeHands(result, { mirrored: false })[0].label, 'Left')
  assert.deepEqual(summarizeHands(null), [])
  assert.equal(formatConfidence(0.934), '93%')
  assert.equal(formatConfidence(undefined), 'n/a')
})

test('error messages and camera support detection', () => {
  assert.match(describeTrackingError({ name: 'NotAllowedError' }), /permission/i)
  assert.match(describeTrackingError({ name: 'NotFoundError' }), /No camera/)
  assert.match(describeTrackingError({ name: 'ModelLoadError' }), /model/)
  assert.equal(cameraSupported({}), false)
  assert.equal(cameraSupported({ mediaDevices: { getUserMedia() {} } }), true)
})
