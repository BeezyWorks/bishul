import React, { useEffect } from 'react'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg'

import { colors, pot } from '@/theme/tokens'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const LOOP_MS = 3000
const TAU = Math.PI * 2

/** One steam wisp from (x, bottom) up 172: an S-curve whose bends swap sides as `a` swings. */
function wisp(x: number, bottom: number, a: number) {
  'worklet'
  const m = bottom - 86
  return (
    `M${x} ${bottom} C${x - a} ${bottom - 30} ${x + a} ${bottom - 52} ${x} ${m} ` +
    `C${x - a} ${m - 34} ${x + a} ${m - 52} ${x} ${m - 86}`
  )
}

function Steam({
  t,
  x,
  bottom,
  dir,
}: {
  t: SharedValue<number>
  x: number
  bottom: number
  dir: 1 | -1
}) {
  const props = useAnimatedProps(() => ({
    d: wisp(x, bottom, 30 * dir * Math.cos(t.value * TAU)),
    strokeOpacity: 0.72 + 0.18 * Math.sin(t.value * TAU),
  }))
  return (
    <AnimatedPath
      animatedProps={props}
      fill="none"
      stroke={colors.accent}
      strokeWidth={20}
      strokeLinecap="round"
    />
  )
}

// Flung-off droplets: [sideways, upward] launch strength, in bubble radii.
const DROPS = [
  [-1.1, 1.5],
  [0.15, 2],
  [1.2, 1.4],
] as const

/** Phases of one bubble's round: swell until `POP_AT`, burst over `BURST`, then rest. */
const POP_AT = 0.55
const BURST = 0.22

function Drop({
  t,
  x,
  y,
  r,
  offset,
  d,
}: {
  t: SharedValue<number>
  x: number
  y: number
  r: number
  offset: number
  d: readonly [number, number]
}) {
  const props = useAnimatedProps(() => {
    const u = (t.value + offset) % 1
    const p = u > POP_AT && u < POP_AT + BURST ? (u - POP_AT) / BURST : -1
    if (p < 0) return { cx: x, cy: y, r: 0, opacity: 0 }
    return {
      cx: x + d[0] * r * p,
      cy: y - r * (d[1] * p - 1.3 * p * p),
      r: r * 0.2 * (1 - 0.6 * p),
      opacity: 1 - p * p,
    }
  })
  return <AnimatedCircle animatedProps={props} fill={pot.bubbleRing} />
}

/**
 * A bubble swells and rises, then pops: it vanishes at once, a ring snaps outward and fades, and a
 * few droplets fly up over the rim. `offset` staggers bubbles through the loop.
 */
function Bubble({
  t,
  x,
  y,
  r,
  offset,
  rise,
}: {
  t: SharedValue<number>
  x: number
  y: number
  r: number
  offset: number
  rise: number
}) {
  const body = useAnimatedProps(() => {
    const u = (t.value + offset) % 1
    if (u >= POP_AT) return { cy: y, rx: 0, ry: 0, opacity: 0 }
    const s = Math.max(0, u / POP_AT)
    const k = s * (2 - s) * (1 + 0.12 * s * s) // fast swell that tightens right before the pop
    return { cy: y - rise * s, rx: r * k, ry: r * 0.7 * k, opacity: 1 }
  })
  const ring = useAnimatedProps(() => {
    const u = (t.value + offset) % 1
    const p = u > POP_AT && u < POP_AT + BURST ? (u - POP_AT) / BURST : -1
    if (p < 0) return { cy: y, rx: 0, ry: 0, opacity: 0, strokeWidth: 0 }
    const e = 1 - (1 - p) * (1 - p)
    return {
      cy: y - rise,
      rx: r * (1.12 + 0.9 * e),
      ry: r * 0.7 * (1.12 + 0.9 * e),
      opacity: 1 - p,
      strokeWidth: 6 * (1 - 0.6 * p),
    }
  })
  return (
    <G>
      <AnimatedEllipse
        cx={x}
        animatedProps={body}
        fill={pot.bubble}
        stroke={pot.bubbleRing}
        strokeWidth={6}
      />
      <AnimatedEllipse cx={x} animatedProps={ring} fill="none" stroke={pot.bubbleRing} />
      {DROPS.map((d, i) => (
        <Drop key={i} t={t} x={x} y={y - rise} r={r} offset={offset} d={d} />
      ))}
    </G>
  )
}

/** A piece of stew floating up and down a few pixels. */
function Chunk({
  t,
  x,
  y,
  rx,
  ry,
  offset,
}: {
  t: SharedValue<number>
  x: number
  y: number
  rx: number
  ry: number
  offset: number
}) {
  const bob = () => {
    'worklet'
    return 3 * Math.sin((t.value + offset) * TAU)
  }
  const body = useAnimatedProps(() => ({ cy: y + bob() }))
  const shine = useAnimatedProps(() => ({ cy: y - ry * 0.3 + bob() }))
  return (
    <G>
      <AnimatedEllipse cx={x} rx={rx} ry={ry} fill={pot.chunk} animatedProps={body} />
      <AnimatedEllipse
        cx={x - rx * 0.25}
        rx={rx * 0.45}
        ry={ry * 0.33}
        fill={pot.chunkShine}
        animatedProps={shine}
      />
    </G>
  )
}

/** The app icon's pot, bubbling with the steam swaying. Loops until unmounted. */
export function PotLoader({ size = 96 }: { size?: number }) {
  const t = useSharedValue(0.2)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    t.value = 0
    t.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false)
  }, [reduceMotion, t])

  return (
    <Svg width={size} height={size} viewBox="120 100 780 780">
      <Steam t={t} x={420} bottom={330} dir={1} />
      <Steam t={t} x={604} bottom={330} dir={1} />
      <Steam t={t} x={512} bottom={300} dir={-1} />
      <Path
        fill={pot.rim}
        fillRule="evenodd"
        d="M164 510h34a28 28 0 0 1 28 28v0a28 28 0 0 1-28 28h-34a28 28 0 0 1-28-28v0a28 28 0 0 1 28-28zM158 527h22a11 11 0 0 1 0 22h-22a11 11 0 0 1 0-22z"
      />
      <Path
        fill={pot.rim}
        fillRule="evenodd"
        d="M826 510h34a28 28 0 0 1 28 28v0a28 28 0 0 1-28 28h-34a28 28 0 0 1-28-28v0a28 28 0 0 1 28-28zM844 527h22a11 11 0 0 1 0 22h-22a11 11 0 0 1 0-22z"
      />
      <Path d="M212 470L224 680C236 800 354 862 512 862S788 800 800 680L812 470z" fill={pot.body} />
      <Path d="M262 540c-4 120 30 220 130 268-110-34-150-140-130-268z" fill={pot.sheen} />
      <Ellipse cx={512} cy={470} rx={300} ry={80} fill={pot.rim} />
      <Ellipse cx={512} cy={474} rx={270} ry={64} fill={pot.mouth} />
      <Ellipse cx={512} cy={480} rx={262} ry={57} fill={pot.stew} />
      <Ellipse cx={450} cy={474} rx={150} ry={22} fill={pot.stewShine} />
      <Chunk t={t} x={372} y={486} rx={44} ry={22} offset={0} />
      <Chunk t={t} x={668} y={494} rx={38} ry={20} offset={0.33} />
      <Chunk t={t} x={560} y={520} rx={32} ry={16} offset={0.66} />
      <Bubble t={t} x={340} y={490} r={34} offset={0} rise={10} />
      <Bubble t={t} x={470} y={470} r={40} offset={0.2} rise={12} />
      <Bubble t={t} x={600} y={496} r={32} offset={0.4} rise={10} />
      <Bubble t={t} x={705} y={482} r={36} offset={0.6} rise={12} />
      <Bubble t={t} x={540} y={470} r={28} offset={0.8} rise={8} />
    </Svg>
  )
}
