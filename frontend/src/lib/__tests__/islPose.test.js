import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HANDSHAPES, LOCATIONS, PALMS, FACES, HEADS, BODIES, MOVEMENTS,
  buildTimeline, segmentAt, poseAtTime, handPoseAt, locationTarget, movementSample,
  restHandPose, reviewLabel,
} from '../islPose.js'

const lexicon = JSON.parse(
  readFileSync(new URL('../../../../backend/app/sign_language/data/isl_lexicon.json', import.meta.url), 'utf8'),
)

test('every vocabulary value used by the real lexicon is mapped (no random fallbacks)', () => {
  assert.equal(lexicon.entries.length, 100)
  for (const entry of lexicon.entries) {
    const a = entry.animation
    for (const h of a.hands) {
      assert.ok(HANDSHAPES[h.handshape], `handshape ${h.handshape} (${entry.gloss})`)
      assert.ok(LOCATIONS[h.location], `location ${h.location} (${entry.gloss})`)
      assert.ok(PALMS[h.palm], `palm ${h.palm} (${entry.gloss})`)
      assert.ok(MOVEMENTS.includes(h.movement), `movement ${h.movement} (${entry.gloss})`)
    }
    assert.ok(FACES[a.face], `face ${a.face}`)
    assert.ok(HEADS.includes(a.head), `head ${a.head}`)
    assert.ok(BODIES.includes(a.body), `body ${a.body}`)
  }
})

test('no lexicon entry claims to be verified without reviewer evidence', () => {
  for (const e of lexicon.entries) {
    assert.equal(e.verified, false)
    assert.equal(e.review_status, 'experimental')
  }
})

test('all handshape tables are well formed', () => {
  for (const [name, s] of Object.entries(HANDSHAPES)) {
    assert.equal(s.curl.length, 5, name)
    assert.ok(s.curl.every((c) => c >= 0 && c <= 1), name)
  }
})

const hello = lexicon.entries.find((e) => e.gloss === 'HELLO')
const glosses = [
  { gloss: 'HELLO', label: 'Hello', available: true, animation: hello.animation, review_status: 'experimental' },
  { gloss: 'ZZYZX', label: 'zzyzx', available: false, animation: null },
  { gloss: 'HELLO', label: 'Hello', available: true, animation: hello.animation, review_status: 'experimental' },
]

test('timeline segments never overlap and keep order', () => {
  const tl = buildTimeline(glosses)
  assert.equal(tl.segments.length, 3)
  for (let i = 1; i < tl.segments.length; i += 1) {
    assert.ok(tl.segments[i].startMs > tl.segments[i - 1].endMs)
  }
  assert.equal(tl.totalMs, tl.segments[2].endMs)
})

test('unsupported gloss becomes a text-only segment with no animation', () => {
  const seg = buildTimeline(glosses).segments[1]
  assert.equal(seg.animated, false)
  assert.equal(seg.animation, null)
  assert.equal(seg.reviewStatus, 'unsupported')
  const tl = buildTimeline(glosses)
  const pose = poseAtTime(tl, (seg.startMs + seg.endMs) / 2)
  assert.equal(pose.activeIndex, 1)
  assert.deepEqual(pose.hands.right.target, restHandPose('right').target) // no invented gesture
})

test('speed scales durations; gaps/active segment lookup are consistent', () => {
  const slow = buildTimeline(glosses, { speed: 0.5 })
  const fast = buildTimeline(glosses, { speed: 2 })
  assert.ok(slow.totalMs > fast.totalMs)
  assert.equal(segmentAt(fast, fast.segments[0].startMs + 1), 0)
  assert.equal(segmentAt(fast, fast.segments[0].endMs + 1), -1) // in the gap
})

test('hand starts and ends at rest and reaches the lexicon location mid-sign', () => {
  const spec = hello.animation.hands[0]
  const rest = restHandPose('right')
  assert.deepEqual(handPoseAt(spec, 0).target, rest.target)
  assert.ok(handPoseAt(spec, 1).target.every((v, i) => Math.abs(v - rest.target[i]) < 1e-9))
  const mid = handPoseAt(spec, 0.5)
  const place = locationTarget(spec.location, 'right')
  assert.ok(Math.abs(mid.target[1] - place[1]) < 0.12)
  assert.ok(mid.raise > 0.99)
})

test('left hand mirrors x; movement samples are finite', () => {
  const r = locationTarget('shoulder', 'right')
  const l = locationTarget('shoulder', 'left')
  assert.equal(l[0], -r[0])
  for (const m of MOVEMENTS) {
    for (const t of [0, 0.25, 0.5, 1]) {
      const s = movementSample(m, t, 2, 'right')
      assert.ok(s.offset.every(Number.isFinite) && Number.isFinite(s.roll), `${m}@${t}`)
    }
  }
})

test('review labels are honest', () => {
  assert.match(reviewLabel('experimental'), /Experimental/)
  assert.match(reviewLabel('unsupported'), /Text only/)
})
