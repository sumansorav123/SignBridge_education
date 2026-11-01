import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { buildTimeline, poseAtTime, reviewLabel } from '@/lib/islPose'

/**
 * Procedural Three.js signing avatar.
 *
 * HONESTY NOTES (also shown in the UI):
 *  - This is a procedural rig (primitives, two-bone arm IK, 3-joint fingers),
 *    not a rigged/licensed character model.
 *  - Animations are EXPERIMENTAL: built from handshape/location/movement
 *    descriptions and not reviewed by a qualified ISL interpreter.
 *  - It plays only catalogued glosses. Unknown words stay as text.
 */

const SKIN = 0xe0ac86
const SHIRT = 0x6d4aff
const L_UPPER = 0.3
const L_FORE = 0.28
const SHOULDER_X = 0.27
const SHOULDER_Y = 0.33
const SPEEDS = [0.5, 0.75, 1, 1.5]
const SIZES = { Small: 240, Medium: 340, Large: 460 }
const FINGER_X = [0, -0.027, -0.009, 0.009, 0.027] // thumb handled separately
const FINGER_LEN = [0.04, 0.046, 0.05, 0.046, 0.038]

function makeHand(side, mats, geos) {
  const root = new THREE.Group()
  const palm = new THREE.Mesh(geos.palm, mats.skin)
  palm.position.y = 0.045
  root.add(palm)
  const thumbSide = side === 'right' ? 1 : -1
  const fingers = []
  for (let i = 0; i < 5; i += 1) {
    const base = new THREE.Group()
    const isThumb = i === 0
    // Index finger sits next to the thumb; pinky is on the far side.
    base.position.set(isThumb ? thumbSide * 0.04 : -FINGER_X[i] * thumbSide, isThumb ? 0.025 : 0.092, 0)
    root.add(base)
    const joints = []
    let parent = base
    for (let j = 0; j < 3; j += 1) {
      const joint = new THREE.Group()
      const len = FINGER_LEN[i] * (j === 0 ? 1 : j === 1 ? 0.75 : 0.6)
      const seg = new THREE.Mesh(geos.finger, mats.skin)
      seg.scale.set(isThumb ? 1.2 : 1, len, isThumb ? 1.2 : 1)
      seg.position.y = len / 2
      joint.add(seg)
      joint.userData.len = len
      if (j > 0) joint.position.y = parent.userData.len
      parent.add(joint)
      joints.push(joint)
      parent = joint
    }
    fingers.push({ base, joints, isThumb })
  }
  return { root, fingers, thumbSide }
}

function makeArm(side, mats, geos) {
  const upper = new THREE.Mesh(geos.limb, mats.shirt)
  const fore = new THREE.Mesh(geos.limb, mats.skin)
  const hand = makeHand(side, mats, geos)
  return { upper, fore, hand, side }
}

function buildAvatar(mats, geos) {
  const group = new THREE.Group()
  const torso = new THREE.Mesh(geos.torso, mats.shirt)
  torso.position.set(0, -0.12, 0)
  group.add(torso)
  const neck = new THREE.Mesh(geos.neck, mats.skin)
  neck.position.set(0, 0.42, 0)
  group.add(neck)
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.62, 0)
  group.add(headGroup)
  headGroup.add(new THREE.Mesh(geos.head, mats.skin))
  const face = { eyes: [], brows: [] }
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(geos.eye, mats.dark)
    eye.position.set(x, 0.02, 0.118)
    headGroup.add(eye)
    face.eyes.push(eye)
    const brow = new THREE.Mesh(geos.brow, mats.hair)
    brow.position.set(x, 0.065, 0.12)
    headGroup.add(brow)
    face.brows.push(brow)
  }
  face.mouth = new THREE.Mesh(geos.mouthArc, mats.dark)
  face.mouth.position.set(0, -0.055, 0.12)
  headGroup.add(face.mouth)
  face.mouthOpen = new THREE.Mesh(geos.eye, mats.dark)
  face.mouthOpen.position.set(0, -0.06, 0.12)
  headGroup.add(face.mouthOpen)
  const hair = new THREE.Mesh(geos.hair, mats.hair)
  hair.position.set(0, 0.03, -0.01)
  headGroup.add(hair)
  const arms = { right: makeArm('right', mats, geos), left: makeArm('left', mats, geos) }
  for (const arm of Object.values(arms)) {
    group.add(arm.upper, arm.fore, arm.hand.root)
    const shoulder = new THREE.Mesh(geos.joint, mats.shirt)
    shoulder.position.set(arm.side === 'right' ? -SHOULDER_X : SHOULDER_X, SHOULDER_Y, 0)
    group.add(shoulder)
  }
  return { group, torso, headGroup, face, arms }
}

const _v = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function placeBone(mesh, from, to, radius) {
  _v.copy(to).sub(from)
  const len = Math.max(1e-4, _v.length())
  mesh.position.copy(from).addScaledVector(_v, 0.5)
  mesh.quaternion.setFromUnitVectors(_up, _v.normalize())
  mesh.scale.set(radius, len, radius)
}

function applyArm(arm, pose) {
  const s = arm.side === 'right' ? -1 : 1
  const shoulder = new THREE.Vector3(s * SHOULDER_X, SHOULDER_Y, 0)
  const wrist = new THREE.Vector3(...pose.target)
  const toWrist = wrist.clone().sub(shoulder)
  const maxReach = L_UPPER + L_FORE - 0.01
  const d = Math.min(maxReach, Math.max(Math.abs(L_UPPER - L_FORE) + 0.02, toWrist.length()))
  const dir = toWrist.normalize()
  const wristClamped = shoulder.clone().addScaledVector(dir, d)
  const a = (L_UPPER * L_UPPER - L_FORE * L_FORE + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, L_UPPER * L_UPPER - a * a))
  const pole = new THREE.Vector3(s * 0.5, -1, -0.25)
  const n = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize()
  const elbow = shoulder.clone().addScaledVector(dir, a).addScaledVector(n, h)
  placeBone(arm.upper, shoulder, elbow, 0.035)
  placeBone(arm.fore, elbow, wristClamped, 0.03)

  const hand = arm.hand
  hand.root.position.copy(wristClamped)
  const fingerDir = new THREE.Vector3(...pose.palm.fingerDir)
  const normal = new THREE.Vector3(...pose.palm.normal)
  const x = new THREE.Vector3().crossVectors(fingerDir, normal).normalize()
  const m = new THREE.Matrix4().makeBasis(x, fingerDir, normal)
  const q = new THREE.Quaternion().setFromRotationMatrix(m)
  const roll = new THREE.Quaternion().setFromAxisAngle(_up, pose.roll || 0)
  q.multiply(roll)
  if (pose.invert) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI))
  hand.root.quaternion.copy(q)

  hand.fingers.forEach((finger, i) => {
    const curl = pose.curl[i]
    if (finger.isThumb) {
      finger.base.rotation.set(0, 0, -hand.thumbSide * pose.thumbAngle)
      finger.joints[0].rotation.x = curl * 0.6
      finger.joints[1].rotation.x = curl * 0.9
      finger.joints[2].rotation.x = curl * 0.6
    } else {
      finger.base.rotation.set(0, 0, hand.thumbSide * (i - 2.5) * pose.spread * 0.6)
      finger.joints[0].rotation.x = curl * 1.25
      finger.joints[1].rotation.x = curl * 1.5
      finger.joints[2].rotation.x = curl * 1.0
    }
  })
}

function applyFace(rig, face) {
  rig.face.mouth.rotation.z = face.smile >= 0 ? Math.PI : 0
  rig.face.mouth.scale.set(1, 0.25 + 0.75 * Math.abs(face.smile), 1)
  rig.face.mouthOpen.scale.set(1.4, Math.max(0.01, face.mouthOpen * 1.4), 0.6)
  rig.face.eyes.forEach((eye) => eye.scale.set(1, Math.max(0.1, face.eyeOpen), 1))
  rig.face.brows.forEach((brow, i) => {
    brow.position.y = 0.065 + face.brow * 0.025
    brow.rotation.z = (i === 0 ? 1 : -1) * face.furrow * 0.3
  })
}

function disposeTree(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    const mat = obj.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
  })
}

export default function IslAvatar({ signs, captionKey, className = '' }) {
  const hostRef = useRef(null)
  const wrapRef = useRef(null)
  const stateRef = useRef({ timeline: null, playhead: 0, playing: false, queue: [], speed: 1, lastIndex: -2 })
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [size, setSize] = useState('Medium')
  const [timeline, setTimeline] = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [webglError, setWebglError] = useState('')

  const startTimeline = useCallback((glosses, autoplay) => {
    const st = stateRef.current
    st.timeline = buildTimeline(glosses, { speed: st.speed })
    st.glosses = glosses
    st.playhead = 0
    st.playing = autoplay
    setTimeline(st.timeline)
    setPlaying(autoplay)
  }, [])

  // New caption: never overlap — queue it behind the sequence that is playing.
  useEffect(() => {
    const glosses = signs?.glosses
    if (!glosses?.length) return
    const st = stateRef.current
    if (st.playing && st.timeline) {
      st.queue = [...st.queue, glosses].slice(-3)
    } else {
      startTimeline(glosses, !reducedMotion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionKey])

  useEffect(() => {
    stateRef.current.speed = speed
    const st = stateRef.current
    if (st.glosses && st.timeline) {
      const ratio = st.timeline.totalMs ? st.playhead / st.timeline.totalMs : 0
      st.timeline = buildTimeline(st.glosses, { speed })
      st.playhead = ratio * st.timeline.totalMs
      setTimeline(st.timeline)
    }
  }, [speed])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setWebglError('3D graphics (WebGL) is not available in this browser. Sign names are shown as text instead.')
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
    camera.position.set(0, 0.2, 3.1)
    camera.lookAt(0, 0.2, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(1.5, 2, 3)
    scene.add(key)

    const mats = {
      skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1f1b24, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.9 }),
    }
    const geos = {
      head: new THREE.SphereGeometry(0.13, 32, 24),
      hair: new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      eye: new THREE.SphereGeometry(0.012, 12, 8),
      brow: new THREE.BoxGeometry(0.05, 0.008, 0.008),
      mouthArc: new THREE.TorusGeometry(0.03, 0.005, 6, 16, Math.PI),
      torso: new THREE.CapsuleGeometry(0.2, 0.5, 6, 16),
      neck: new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12),
      limb: new THREE.CylinderGeometry(1, 1, 1, 12),
      joint: new THREE.SphereGeometry(0.04, 12, 10),
      palm: new THREE.BoxGeometry(0.085, 0.09, 0.022),
      finger: new THREE.CylinderGeometry(0.0085, 0.0085, 1, 8),
    }
    const rig = buildAvatar(mats, geos)
    scene.add(rig.group)
    rig.group.position.y = -0.05

    const resize = () => {
      const w = host.clientWidth || 300
      const h = host.clientHeight || 300
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(host)

    let raf = 0
    let last = performance.now()
    const onLost = (event) => {
      event.preventDefault()
      setWebglError('The 3D view was interrupted by the browser. Reload the page to restore the avatar.')
    }
    renderer.domElement.addEventListener('webglcontextlost', onLost)

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last)
      last = now
      const st = stateRef.current
      if (st.timeline && st.playing) {
        st.playhead += dt
        if (st.playhead >= st.timeline.totalMs) {
          const next = st.queue.shift()
          if (next) {
            st.glosses = next
            st.timeline = buildTimeline(next, { speed: st.speed })
            st.playhead = 0
            setTimeline(st.timeline)
          } else {
            st.playing = false
            st.playhead = st.timeline.totalMs
            setPlaying(false)
          }
        }
      }
      const pose = poseAtTime(st.timeline || { segments: [], totalMs: 0 }, st.timeline ? st.playhead : 0)
      applyArm(rig.arms.right, pose.hands.right)
      applyArm(rig.arms.left, pose.hands.left)
      applyFace(rig, pose.face)
      const motion = reducedMotion ? 0.4 : 1
      rig.headGroup.rotation.set(pose.head.x * motion, pose.head.y * motion, pose.head.z * motion)
      rig.group.rotation.set(pose.body.x * motion, 0, pose.body.z * motion)
      if (pose.activeIndex !== st.lastIndex) {
        st.lastIndex = pose.activeIndex
        setActiveIndex(pose.activeIndex)
      }
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      disposeTree(rig.group)
      Object.values(geos).forEach((g) => g.dispose())
      Object.values(mats).forEach((m) => m.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [reducedMotion])

  function togglePlay() {
    const st = stateRef.current
    if (!st.timeline) return
    if (!st.playing && st.playhead >= st.timeline.totalMs) st.playhead = 0
    st.playing = !st.playing
    setPlaying(st.playing)
  }

  function replay() {
    const st = stateRef.current
    if (!st.timeline) return
    st.queue = []
    st.playhead = 0
    st.playing = true
    setPlaying(true)
  }

  function fullscreen() {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.()
  }

  const segments = timeline?.segments || []
  const active = activeIndex >= 0 ? segments[activeIndex] : null
  const hasExperimental = segments.some((s) => s.reviewStatus === 'experimental')

  return (
    <div ref={wrapRef} className={`rounded-2xl bg-ink-50 p-3 dark:bg-ink-950/70 ${className}`}>
      <div
        className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl bg-gradient-to-b from-violet-100 to-white dark:from-violet-950/40 dark:to-ink-900"
        style={{ height: SIZES[size] }}
      >
        <div
          ref={hostRef}
          role="img"
          aria-label={active ? `Signing avatar showing ${active.label}` : 'Signing avatar, waiting for a caption'}
          className="h-full w-full"
        />
        {webglError ? (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-amber-800 dark:text-amber-200">{webglError}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Avatar controls">
        <button type="button" onClick={togglePlay} disabled={!timeline} className="btn-ghost min-h-11 min-w-11 rounded-xl px-3" aria-label={playing ? 'Pause signing' : 'Play signing'}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button type="button" onClick={replay} disabled={!timeline} className="btn-ghost min-h-11 min-w-11 rounded-xl px-3" aria-label="Replay sign sequence">
          <RotateCcw className="h-5 w-5" />
        </button>
        <label className="flex items-center gap-1 text-xs">
          Speed
          <select className="select w-20" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Signing speed">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          Size
          <select className="select w-24" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Avatar size">
            {Object.keys(SIZES).map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" onClick={fullscreen} className="btn-ghost min-h-11 min-w-11 rounded-xl px-3" aria-label="Toggle fullscreen avatar">
          <Maximize2 className="h-5 w-5" />
        </button>
      </div>
      {reducedMotion ? <p className="mt-2 text-center text-xs text-ink-500">Reduced motion is on: signing starts only when you press Play.</p> : null}

      <ol className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Sign sequence">
        {segments.map((seg) => {
          const isActive = seg.index === activeIndex
          const tone = seg.animated
            ? 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100'
            : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
          return (
            <li
              key={`${seg.gloss}-${seg.index}`}
              aria-current={isActive ? 'step' : undefined}
              title={reviewLabel(seg.reviewStatus)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${tone} ${isActive ? 'ring-2 ring-violet-500 ring-offset-1' : 'opacity-80'}`}
            >
              {seg.label}
              {!seg.animated ? <span className="ml-1 text-[10px] font-bold uppercase">text only</span> : null}
            </li>
          )
        })}
      </ol>
      {!segments.length ? <p className="mt-3 text-center text-sm text-ink-500">The avatar signs catalogued words from each new caption. Words without a sign stay as text.</p> : null}
      {hasExperimental ? (
        <p className="mt-3 text-center text-xs text-amber-700 dark:text-amber-300">
          Experimental procedural avatar. Signs are not reviewed by an ISL interpreter and this is not complete ISL
          translation. Rely on the captions for exact meaning.
        </p>
      ) : null}
    </div>
  )
}
