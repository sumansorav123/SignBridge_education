import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2 } from 'lucide-react'
import {
  DEFAULT_MODEL_URL,
  DEFAULT_WASM_URL,
  HAND_CONNECTIONS,
  cameraSupported,
  describeTrackingError,
  formatConfidence,
  summarizeHands,
} from '@/lib/handTracking'

/**
 * MediaPipe HandLandmarker demonstration.
 *
 * SCOPE: this only detects hands and draws 21 landmarks per hand. It does NOT
 * recognise signs or translate sign language.
 *
 * The model (~7.5 MB) and the WASM runtime are fetched from the URLs below.
 * Override them with VITE_HAND_MODEL_URL / VITE_MEDIAPIPE_WASM_URL to
 * self-host (recommended for offline classrooms and production).
 */
const MODEL_URL = import.meta.env?.VITE_HAND_MODEL_URL || DEFAULT_MODEL_URL
const WASM_URL = import.meta.env?.VITE_MEDIAPIPE_WASM_URL || DEFAULT_WASM_URL
const HAND_COLORS = { Left: '#22c55e', Right: '#38bdf8', Unknown: '#f59e0b' }

function drawHands(ctx, hands, width, height) {
  ctx.clearRect(0, 0, width, height)
  for (const hand of hands) {
    const color = HAND_COLORS[hand.label] || HAND_COLORS.Unknown
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand.landmarks[a]
      const q = hand.landmarks[b]
      if (!p || !q) continue
      ctx.moveTo(p.x * width, p.y * height)
      ctx.lineTo(q.x * width, q.y * height)
    }
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    for (const point of hand.landmarks) {
      ctx.beginPath()
      ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
}

export default function HandTrackingDemo() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState('idle') // idle | loading | running | error
  const [error, setError] = useState('')
  const [hands, setHands] = useState([])
  const supported = cameraSupported()

  const stop = useCallback(() => {
    runIdRef.current += 1 // cancels any start() still awaiting the model/camera
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    try {
      landmarkerRef.current?.close()
    } catch {
      /* already closed */
    }
    landmarkerRef.current = null
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHands([])
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!supported) {
      setStatus('error')
      setError('This browser does not support camera access. Use a current browser over HTTPS or localhost.')
      return
    }
    const runId = (runIdRef.current += 1)
    setStatus('loading')
    setError('')
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
      let landmarker
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      } catch (cause) {
        const failure = new Error(cause?.message || 'model load failed')
        failure.name = 'ModelLoadError'
        throw failure
      }
      if (runId !== runIdRef.current) {
        landmarker.close()
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
        audio: false,
      })
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        landmarker.close()
        return
      }
      landmarkerRef.current = landmarker
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await video.play()
      setStatus('running')

      const loop = () => {
        const v = videoRef.current
        const canvas = canvasRef.current
        if (!v || !canvas || !landmarkerRef.current) return
        if (v.readyState >= 2 && v.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = v.currentTime
          if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth
          if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight
          const result = landmarkerRef.current.detectForVideo(v, performance.now())
          const summary = summarizeHands(result, { mirrored: true })
          drawHands(canvas.getContext('2d'), summary, canvas.width, canvas.height)
          setHands(summary.map(({ landmarks, ...rest }) => rest))
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (cause) {
      if (runId !== runIdRef.current) return
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setError(describeTrackingError(cause))
      setStatus('error')
    }
  }, [supported])

  useEffect(() => stop, [stop])

  const running = status === 'running'
  return (
    <section className="card space-y-4 p-5" aria-labelledby="hand-demo-title">
      <div>
        <h2 id="hand-demo-title" className="font-display text-lg font-semibold">Hand tracking demo (MediaPipe)</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Detects up to two hands and draws 21 landmarks on each. This is a tracking demonstration only — it does not
          recognise or translate sign language. Video stays on your device.
        </p>
      </div>
      <div className="relative mx-auto aspect-video w-full max-w-2xl overflow-hidden rounded-xl bg-ink-950">
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-contain" aria-label="Live camera preview" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain" aria-hidden="true" />
        {!running ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
            {status === 'loading' ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /> : <Camera className="h-8 w-8 text-white/60" aria-hidden="true" />}
            <p className="text-sm font-semibold">{status === 'loading' ? 'Loading the hand-tracking model…' : 'Camera is off'}</p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!running ? (
          <button type="button" className="btn-brand min-h-11 rounded-xl px-4" onClick={start} disabled={status === 'loading' || !supported}>
            <Camera className="mr-2 inline h-4 w-4" aria-hidden="true" />Start camera
          </button>
        ) : (
          <button type="button" className="btn-ghost min-h-11 rounded-xl px-4" onClick={stop}>
            <CameraOff className="mr-2 inline h-4 w-4" aria-hidden="true" />Stop camera
          </button>
        )}
      </div>
      {!supported ? <p role="alert" className="text-center text-sm text-amber-700 dark:text-amber-300">This browser has no camera API (getUserMedia).</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p> : null}
      <div aria-live="polite" className="text-center text-sm">
        {running ? (
          hands.length ? (
            <ul className="flex flex-wrap justify-center gap-3">
              {hands.map((hand) => (
                <li key={hand.index} className="rounded-full border border-ink-200 px-3 py-1 dark:border-ink-700">
                  {hand.label} hand · {hand.landmarkCount} landmarks · confidence {formatConfidence(hand.confidence)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-500">No hands detected. Hold a hand in view.</span>
          )
        ) : null}
      </div>
    </section>
  )
}
