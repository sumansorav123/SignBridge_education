/** Pure helpers for the MediaPipe hand-tracking demo (no browser APIs). */

// The 21-landmark hand skeleton used by MediaPipe Hands / HandLandmarker.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export const LANDMARK_COUNT = 21

export const DEFAULT_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
export const DEFAULT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * Normalise a HandLandmarkerResult into a plain, UI-friendly list.
 * NOTE: MediaPipe reports handedness as seen in the (un-mirrored) image; for a
 * mirrored selfie preview the labels are swapped, so callers pass `mirrored`.
 */
export function summarizeHands(result, { mirrored = true } = {}) {
  const landmarks = result?.landmarks || []
  const handedness = result?.handedness || result?.handednesses || []
  return landmarks.map((points, index) => {
    const top = handedness[index]?.[0]
    let label = top?.categoryName || 'Unknown'
    if (mirrored && (label === 'Left' || label === 'Right')) label = label === 'Left' ? 'Right' : 'Left'
    return {
      index,
      label,
      confidence: typeof top?.score === 'number' ? top.score : null,
      landmarkCount: points.length,
      landmarks: points,
    }
  })
}

export function formatConfidence(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a'
}

/** Map a getUserMedia / model-load error to a message a student can act on. */
export function describeTrackingError(error) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied. Allow camera access in your browser settings and try again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is already in use by another app.'
  if (name === 'ModelLoadError') {
    return 'The hand-tracking model could not be loaded. Check your internet connection or the model URL configuration.'
  }
  return error?.message ? `Hand tracking could not start: ${error.message}` : 'Hand tracking could not start.'
}

export function cameraSupported(nav = typeof navigator === 'undefined' ? null : navigator) {
  return Boolean(nav?.mediaDevices?.getUserMedia)
}
