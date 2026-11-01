export function createRecordingCapture(
  sourceVideo,
  audioTracks = [],
  {
    width = 1280,
    height = 720,
    frameRate = 24,
    documentRef = globalThis.document,
    MediaStreamCtor = globalThis.MediaStream,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    onFrameError = (error) => console.error('Recording frame capture failed.', error),
  } = {},
) {
  if (!sourceVideo) throw new Error('A video element is required for recording.')
  if (!documentRef?.createElement || !MediaStreamCtor || !requestFrame || !cancelFrame) {
    throw new Error('Dynamic video recording is not supported in this browser.')
  }

  const canvas = documentRef.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context || typeof canvas.captureStream !== 'function') {
    throw new Error('Canvas-based video capture is not supported in this browser.')
  }

  let disposed = false
  let frameErrorReported = false
  let frameHandle = null
  context.fillStyle = '#000'
  context.fillRect(0, 0, width, height)

  const drawFrame = () => {
    if (disposed) return
    if (sourceVideo.readyState >= 2 && sourceVideo.videoWidth && sourceVideo.videoHeight) {
      try {
        const scale = Math.min(width / sourceVideo.videoWidth, height / sourceVideo.videoHeight)
        const frameWidth = sourceVideo.videoWidth * scale
        const frameHeight = sourceVideo.videoHeight * scale
        context.drawImage(
          sourceVideo,
          (width - frameWidth) / 2,
          (height - frameHeight) / 2,
          frameWidth,
          frameHeight,
        )
      } catch (error) {
        context.fillStyle = '#000'
        context.fillRect(0, 0, width, height)
        if (!frameErrorReported) {
          frameErrorReported = true
          onFrameError(error)
        }
      }
    } else {
      context.fillStyle = '#000'
      context.fillRect(0, 0, width, height)
    }
    frameHandle = requestFrame(drawFrame)
  }

  const canvasStream = canvas.captureStream(frameRate)
  const videoTrack = canvasStream.getVideoTracks()[0]
  if (!videoTrack) throw new Error('Canvas video capture did not produce a video track.')

  const liveAudioTracks = audioTracks.filter(
    (track) => track.kind === 'audio' && track.readyState !== 'ended',
  )
  let stream
  try {
    stream = new MediaStreamCtor([videoTrack, ...liveAudioTracks])
  } catch (error) {
    canvasStream.getTracks().forEach((track) => track.stop())
    throw error
  }

  frameHandle = requestFrame(drawFrame)
  return {
    stream,
    dispose() {
      if (disposed) return
      disposed = true
      if (frameHandle !== null) cancelFrame(frameHandle)
      canvasStream.getTracks().forEach((track) => track.stop())
    },
  }
}
