import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecordingCapture } from '../recordingCapture.js'

function createHarness() {
  const frames = new Map()
  const draws = []
  const stopped = []
  let nextFrame = 0
  let drawFailure = null
  const videoTrack = { kind: 'video', readyState: 'live', stop: () => stopped.push('video') }
  const canvasStream = {
    getVideoTracks: () => [videoTrack],
    getTracks: () => [videoTrack],
  }
  const sourceVideo = { readyState: 2, videoWidth: 1280, videoHeight: 720, srcObject: null }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillRect() {},
      drawImage: (...args) => {
        if (drawFailure) throw drawFailure
        draws.push(args)
      },
    }),
    captureStream: (rate) => {
      assert.equal(rate, 24)
      return canvasStream
    },
  }
  const documentRef = {
    createElement: (tag) => {
      assert.equal(tag, 'canvas')
      return canvas
    },
  }
  class TestMediaStream {
    constructor(tracks) {
      this.tracks = tracks
    }
  }
  const requestFrame = (callback) => {
    const handle = ++nextFrame
    frames.set(handle, callback)
    return handle
  }
  const cancelFrame = (handle) => frames.delete(handle)
  const runFrame = () => {
    const [handle, callback] = frames.entries().next().value
    frames.delete(handle)
    callback()
  }
  return {
    sourceVideo,
    draws,
    frames,
    runFrame,
    setDrawFailure: (error) => { drawFailure = error },
    stopped,
    options: { documentRef, MediaStreamCtor: TestMediaStream, requestFrame, cancelFrame },
  }
}

test('recording keeps a stable video track while the displayed source changes', () => {
  const harness = createHarness()
  const audioTrack = { kind: 'audio', readyState: 'live', stop() {} }
  const capture = createRecordingCapture(harness.sourceVideo, [audioTrack], harness.options)
  const videoOutputTrack = capture.stream.tracks[0]
  harness.runFrame()

  harness.sourceVideo.srcObject = { id: 'screen-share-stream' }
  harness.runFrame()

  assert.equal(capture.stream.tracks[0], videoOutputTrack)
  assert.equal(capture.stream.tracks[1], audioTrack)
  assert.equal(harness.draws.length, 2)
  assert.equal(harness.draws[0][0], harness.sourceVideo)
  assert.equal(harness.draws[1][0].srcObject.id, 'screen-share-stream')

  capture.dispose()
  assert.deepEqual(harness.stopped, ['video'])
  assert.equal(harness.frames.size, 0)
  assert.equal(audioTrack.readyState, 'live')
})

test('recording outputs black frames until source video is ready', () => {
  const harness = createHarness()
  harness.sourceVideo.readyState = 0
  const capture = createRecordingCapture(harness.sourceVideo, [], harness.options)
  harness.runFrame()
  assert.equal(harness.draws.length, 0)
  capture.dispose()
})

test('recording preserves the source aspect ratio inside the fixed output frame', () => {
  const harness = createHarness()
  harness.sourceVideo.videoWidth = 720
  harness.sourceVideo.videoHeight = 1280
  const capture = createRecordingCapture(harness.sourceVideo, [], harness.options)
  harness.runFrame()
  assert.deepEqual(harness.draws[0].slice(1), [437.5, 0, 405, 720])
  capture.dispose()
})

test('recording reports a frame-capture failure once and keeps the loop alive', () => {
  const harness = createHarness()
  const error = new Error('source frame unavailable')
  const reported = []
  harness.setDrawFailure(error)
  const capture = createRecordingCapture(harness.sourceVideo, [], {
    ...harness.options,
    onFrameError: (frameError) => reported.push(frameError),
  })

  harness.runFrame()
  harness.runFrame()

  assert.deepEqual(reported, [error])
  assert.equal(harness.frames.size, 1)
  capture.dispose()
})

test('recording rejects unsupported canvas capture', () => {
  const harness = createHarness()
  const documentRef = {
    createElement: () => ({
      getContext: () => null,
      captureStream: () => ({ getVideoTracks: () => [], getTracks: () => [] }),
    }),
  }
  assert.throws(
    () => createRecordingCapture(harness.sourceVideo, [], { ...harness.options, documentRef }),
    /Canvas-based video capture is not supported/,
  )
})
