/**
 * Pure ISL pose mapping: lexicon animation spec -> avatar pose parameters.
 *
 * No Three.js import here so everything is unit-testable in Node.
 *
 * Coordinates (avatar faces the viewer): +x is the avatar's LEFT, so the
 * avatar's right hand has side = -1. +y up, +z toward the viewer.
 *
 * LIMITATIONS (be honest in the UI): this maps *described* handshape, location,
 * palm, movement and non-manual values to a procedural rig. It does not encode
 * finger-level detail, contact points, two-hand symmetry rules or ISL grammar,
 * and nothing here has been reviewed by a qualified ISL interpreter.
 */

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']

// curl: 0 straight .. 1 fully curled. thumbAngle: radians away from the palm
// plane. spread: radians between fingers.
export const HANDSHAPES = {
  open: { curl: [0, 0, 0, 0, 0], spread: 0.22, thumbAngle: 0.9 },
  five: { curl: [0, 0, 0, 0, 0], spread: 0.28, thumbAngle: 1.0 },
  flat: { curl: [0.05, 0, 0, 0, 0], spread: 0.02, thumbAngle: 0.15 },
  fist: { curl: [0.75, 1, 1, 1, 1], spread: 0, thumbAngle: 0.1 },
  point: { curl: [0.7, 0, 1, 1, 1], spread: 0, thumbAngle: 0.2 },
  one: { curl: [0.7, 0, 1, 1, 1], spread: 0, thumbAngle: 0.2 },
  peace: { curl: [0.7, 0, 0, 1, 1], spread: 0.3, thumbAngle: 0.2 },
  two: { curl: [0.7, 0, 0, 1, 1], spread: 0.3, thumbAngle: 0.2 },
  three: { curl: [0, 0, 0, 1, 1], spread: 0.25, thumbAngle: 1.0 },
  four: { curl: [0.8, 0, 0, 0, 0], spread: 0.15, thumbAngle: 0.1 },
  thumbs_up: { curl: [0, 1, 1, 1, 1], spread: 0, thumbAngle: 0.25 },
  thumbs_down: { curl: [0, 1, 1, 1, 1], spread: 0, thumbAngle: 0.25, invert: true },
  cup: { curl: [0.3, 0.35, 0.35, 0.35, 0.35], spread: 0.2, thumbAngle: 0.6 },
  pinch: { curl: [0.5, 0.55, 0.3, 0.3, 0.3], spread: 0.05, thumbAngle: 0.5 },
  claw: { curl: [0.4, 0.5, 0.5, 0.5, 0.5], spread: 0.35, thumbAngle: 0.7 },
  l_shape: { curl: [0, 0, 1, 1, 1], spread: 0, thumbAngle: 1.4 },
  y_shape: { curl: [0, 1, 1, 1, 0], spread: 0, thumbAngle: 1.3 },
  hooked: { curl: [0.7, 0.55, 1, 1, 1], spread: 0, thumbAngle: 0.2 },
}

// Target wrist position for the avatar's RIGHT hand (side = -1). The left hand
// mirrors x. Units are scene units (avatar ~1.7 tall, head centre y = 0.62).
export const LOCATIONS = {
  chest: [-0.12, 0.12, 0.3],
  forehead: [-0.1, 0.7, 0.3],
  head_top: [-0.1, 0.86, 0.2],
  chin: [-0.08, 0.44, 0.3],
  mouth: [-0.07, 0.5, 0.3],
  ear: [-0.24, 0.62, 0.2],
  shoulder: [-0.3, 0.32, 0.25],
  right_side: [-0.5, 0.1, 0.2],
  left_side: [0.35, 0.1, 0.25],
  waist: [-0.15, -0.2, 0.3],
  neutral: [-0.28, -0.1, 0.2],
  forward: [-0.15, 0.2, 0.55],
}

export const REST_TARGET = [-0.3, -0.45, 0.05]

export const PALMS = {
  forward: { normal: [0, 0, 1], fingerDir: [0, 1, 0] },
  inward: { normal: [0, 0, -1], fingerDir: [0, 1, 0] },
  self: { normal: [0, 0, -1], fingerDir: [0, 1, 0] },
  down: { normal: [0, -1, 0], fingerDir: [0, 0, 1] },
  up: { normal: [0, 1, 0], fingerDir: [0, 0, 1] },
  left: { normal: [1, 0, 0], fingerDir: [0, 1, 0] },
  right: { normal: [-1, 0, 0], fingerDir: [0, 1, 0] },
}

export const FACES = {
  neutral: { smile: 0, brow: 0, furrow: 0, mouthOpen: 0.05, eyeOpen: 1 },
  smile: { smile: 1, brow: 0.1, furrow: 0, mouthOpen: 0.1, eyeOpen: 0.9 },
  sad: { smile: -0.8, brow: 0.35, furrow: 0.3, mouthOpen: 0, eyeOpen: 0.8 },
  question: { smile: 0, brow: 0.9, furrow: 0, mouthOpen: 0.05, eyeOpen: 1.1 },
  surprise: { smile: 0.1, brow: 1, furrow: 0, mouthOpen: 0.7, eyeOpen: 1.3 },
  focus: { smile: 0, brow: -0.1, furrow: 0.7, mouthOpen: 0, eyeOpen: 0.8 },
  frown: { smile: -0.6, brow: -0.2, furrow: 0.9, mouthOpen: 0, eyeOpen: 0.85 },
}

export const HEADS = ['neutral', 'nod', 'shake', 'tilt_left', 'tilt_right', 'forward']
export const BODIES = ['neutral', 'lean_forward', 'lean_left', 'lean_right']
export const MOVEMENTS = [
  'static', 'up', 'down', 'left', 'right', 'forward', 'back', 'wave', 'circle',
  'arc', 'shake', 'twist', 'open_close', 'approach', 'away', 'tap',
]

const AMP = 0.09
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const lerp = (a, b, w) => a + (b - a) * w
const smooth = (v) => {
  const x = clamp01(v)
  return x * x * (3 - 2 * x)
}
const lerpVec = (a, b, w) => a.map((value, i) => lerp(value, b[i], w))

export function sideOf(hand) {
  return hand === 'left' ? 1 : -1
}

export function locationTarget(location, hand = 'right') {
  const base = LOCATIONS[location]
  if (!base) return null
  // Right-hand table mirrors for the left hand, except centre-line anchors.
  return hand === 'left' ? [-base[0], base[1], base[2]] : [...base]
}

/**
 * Sample a movement at normalised time t (0..1) with `reps` repetitions.
 * Returns { offset:[x,y,z], roll (rad), curlMix 0..1 }.
 */
export function movementSample(movement, t, reps = 1, hand = 'right') {
  const phase = clamp01(t) * Math.max(1, reps) * Math.PI * 2
  const s = sideOf(hand)
  const saw = (clamp01(t) * Math.max(1, reps)) % 1 || (t >= 1 ? 1 : 0)
  const sweep = smooth(saw) * 2 - 1 // -1..1 per repetition
  const out = { offset: [0, 0, 0], roll: 0, curlMix: 0 }
  switch (movement) {
    case 'up': out.offset = [0, AMP * sweep, 0]; break
    case 'down': out.offset = [0, -AMP * sweep, 0]; break
    case 'left': out.offset = [AMP * sweep, 0, 0]; break
    case 'right': out.offset = [-AMP * sweep, 0, 0]; break
    case 'forward': out.offset = [0, 0, AMP * 1.2 * sweep]; break
    case 'back': out.offset = [0, 0, -AMP * 1.2 * sweep]; break
    case 'wave': out.offset = [AMP * 0.8 * Math.sin(phase), 0, 0]; out.roll = 0.35 * Math.sin(phase); break
    case 'circle': out.offset = [AMP * 0.9 * Math.cos(phase) - AMP * 0.9, AMP * 0.9 * Math.sin(phase), 0]; break
    case 'arc': out.offset = [AMP * sweep * s * -1, AMP * 0.7 * (1 - sweep * sweep) - AMP * 0.7, 0]; break
    case 'shake': out.offset = [AMP * 0.4 * Math.sin(phase * 2), 0, 0]; break
    case 'twist': out.roll = 0.9 * Math.sin(phase); break
    case 'open_close': out.curlMix = 0.5 - 0.5 * Math.cos(phase); break
    case 'approach': out.offset = [0, 0, AMP * 2 * (1 - smooth(t))]; break
    case 'away': out.offset = [0, 0, AMP * 2 * smooth(t)]; break
    case 'tap': out.offset = [0, 0, -AMP * 0.8 * Math.abs(Math.sin(phase / 2))]; break
    default: break // static / unknown: no movement
  }
  return out
}

export function restHandPose(hand = 'right') {
  const rest = HANDSHAPES.flat
  return {
    hand,
    curl: [...rest.curl].map((v) => Math.max(v, 0.25)),
    thumbAngle: 0.2,
    spread: 0.05,
    target: hand === 'left' ? [-REST_TARGET[0], REST_TARGET[1], REST_TARGET[2]] : [...REST_TARGET],
    palm: PALMS.inward,
    roll: 0,
    invert: false,
    raise: 0,
  }
}

/** Pose of one hand at local segment time t (0..1). */
export function handPoseAt(spec, t) {
  const rest = restHandPose(spec.hand)
  const shape = HANDSHAPES[spec.handshape]
  const place = locationTarget(spec.location, spec.hand)
  if (!shape || !place) return rest
  const reps = spec.repetitions || 1
  const raise = smooth(t / 0.2) * (1 - smooth((t - 0.85) / 0.15))
  const moveT = clamp01((t - 0.2) / 0.65)
  const move = movementSample(spec.movement || 'static', moveT, reps, spec.hand)
  const target = place.map((value, i) => value + move.offset[i])
  const mixedCurl = shape.curl.map((c) => lerp(c, 1, move.curlMix * 0.8))
  return {
    hand: spec.hand,
    curl: lerpVec(rest.curl, mixedCurl, raise),
    thumbAngle: lerp(rest.thumbAngle, shape.thumbAngle, raise),
    spread: lerp(rest.spread, shape.spread, raise),
    target: lerpVec(rest.target, target, raise),
    palm: raise > 0.5 ? PALMS[spec.palm] || PALMS.forward : rest.palm,
    roll: move.roll * raise,
    invert: Boolean(shape.invert) && raise > 0.5,
    raise,
  }
}

export function headPoseAt(head = 'neutral', t = 0) {
  const phase = clamp01(t) * Math.PI * 4
  const out = { x: 0, y: 0, z: 0 }
  if (head === 'nod') out.x = 0.22 * Math.sin(phase)
  else if (head === 'shake') out.y = 0.3 * Math.sin(phase)
  else if (head === 'tilt_left') out.z = 0.22 * smooth(t * 3)
  else if (head === 'tilt_right') out.z = -0.22 * smooth(t * 3)
  else if (head === 'forward') out.x = 0.14 * smooth(t * 3)
  return out
}

export function bodyPoseAt(body = 'neutral', t = 0) {
  const w = smooth(t * 3) * (1 - smooth((t - 0.85) / 0.15))
  if (body === 'lean_forward') return { x: 0.12 * w, z: 0 }
  if (body === 'lean_left') return { x: 0, z: 0.1 * w }
  if (body === 'lean_right') return { x: 0, z: -0.1 * w }
  return { x: 0, z: 0 }
}

export function facePoseAt(face = 'neutral', t = 0) {
  const base = FACES.neutral
  const target = FACES[face] || base
  const w = smooth(t / 0.2) * (1 - smooth((t - 0.9) / 0.1))
  return Object.fromEntries(Object.keys(base).map((key) => [key, lerp(base[key], target[key], w)]))
}

export const FALLBACK_HOLD_MS = 700
export const SEGMENT_GAP_MS = 120

/**
 * Build a non-overlapping playback timeline from engine `signs.glosses`.
 * Unsupported glosses get a text-fallback segment with no animation.
 */
export function buildTimeline(glosses = [], { speed = 1 } = {}) {
  const safeSpeed = Math.min(3, Math.max(0.25, Number(speed) || 1))
  const segments = []
  let cursor = 0
  glosses.forEach((item, index) => {
    const animated = Boolean(item?.available && item.animation)
    const base = animated ? Number(item.animation.duration_ms) || 1000 : FALLBACK_HOLD_MS
    const duration = Math.max(200, Math.round(base / safeSpeed))
    segments.push({
      index,
      gloss: item?.gloss || '',
      label: item?.label || item?.gloss || '',
      animated,
      reviewStatus: animated ? item.review_status || (item.verified ? 'interpreter_reviewed' : 'experimental') : 'unsupported',
      animation: animated ? item.animation : null,
      startMs: cursor,
      endMs: cursor + duration,
    })
    cursor += duration + SEGMENT_GAP_MS
  })
  return { segments, totalMs: Math.max(0, cursor - (segments.length ? SEGMENT_GAP_MS : 0)) }
}

export function segmentAt(timeline, tMs) {
  const hit = timeline.segments.find((s) => tMs >= s.startMs && tMs <= s.endMs)
  return hit ? hit.index : -1
}

/** Full avatar pose at absolute time tMs of a timeline (rest between segments). */
export function poseAtTime(timeline, tMs) {
  const index = segmentAt(timeline, tMs)
  const segment = index >= 0 ? timeline.segments[index] : null
  const anim = segment?.animated ? segment.animation : null
  const t = segment ? (tMs - segment.startMs) / Math.max(1, segment.endMs - segment.startMs) : 0
  const hands = { right: restHandPose('right'), left: restHandPose('left') }
  if (anim) {
    for (const spec of anim.hands || []) hands[spec.hand] = handPoseAt(spec, t)
  }
  return {
    activeIndex: index,
    segment,
    hands,
    face: facePoseAt(anim?.face, anim ? t : 0),
    head: headPoseAt(anim?.head, anim ? t : 0),
    body: bodyPoseAt(anim?.body, anim ? t : 0),
  }
}

export function reviewLabel(status) {
  if (status === 'interpreter_reviewed') return 'Interpreter-reviewed'
  if (status === 'experimental') return 'Experimental animation'
  return 'Text only (no sign available)'
}
