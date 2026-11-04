import { ML_PER_TSP, UNITS } from './tables'
import type { DisplayPrefs, FormattedQuantity, Quantity, UnitSystem } from './types'

const FRACTIONS: Array<[number, string]> = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
]

/** Round to the nearest kitchen fraction (⅛ ¼ ⅓ ½ ⅔ ¾). Returns the rounded value and its text. */
export function roundToFraction(x: number): { value: number; text: string } {
  const whole = Math.floor(x)
  const frac = x - whole
  let best = FRACTIONS[0]!
  let bestD = Infinity
  for (const f of FRACTIONS) {
    const d = Math.abs(f[0] - frac)
    if (d < bestD) {
      best = f
      bestD = d
    }
  }
  const value = whole + best[0]
  const w = Math.floor(value + 1e-9)
  const fracText = best[0] === 1 || best[0] === 0 ? '' : best[1]
  const text = w === 0 && fracText ? fracText : `${w}${fracText}`
  return { value, text }
}

function trimNumber(x: number, dp: number): string {
  return String(Number(x.toFixed(dp)))
}

function plural(label: string, value: number): string {
  if (value <= 1) return label
  return label === 'fl oz' ||
    label === 'oz' ||
    label === 'lb' ||
    label === 'tsp' ||
    label === 'tbsp'
    ? label
    : `${label}s`
}

function make(text: string, amount: number, unit: string, approx: boolean): FormattedQuantity {
  return { text: `${approx ? '~' : ''}${text}`, amount, unit, approx }
}

function fmtMetricWeight(g: number, approx: boolean): FormattedQuantity {
  let r: number
  if (g < 5) r = Math.round(g * 2) / 2
  else if (g < 20) r = Math.round(g)
  else r = Math.round(g / 5) * 5
  if (r >= 1000) {
    const kg = Math.round((g / 1000) * 100) / 100
    return make(`${trimNumber(kg, 2)} kg`, kg, 'kg', approx)
  }
  return make(`${trimNumber(r, 1)} g`, r, 'g', approx)
}

function fmtMetricVolume(ml: number, approx: boolean): FormattedQuantity {
  let r: number
  if (ml < 20) r = ml < 5 ? Math.round(ml * 2) / 2 : Math.round(ml)
  else r = Math.round(ml / 5) * 5
  if (r >= 1000) {
    const l = Math.round((ml / 1000) * 100) / 100
    return make(`${trimNumber(l, 2)} l`, l, 'l', approx)
  }
  return make(`${trimNumber(r, 1)} ml`, r, 'ml', approx)
}

function fmtUsWeight(g: number, approx: boolean): FormattedQuantity {
  const oz = g / UNITS.oz!.factor
  if (oz < 0.125) return fmtMetricWeight(g, approx)
  if (oz >= 16) {
    const f = roundToFraction(oz / 16)
    return make(`${f.text} lb`, f.value, 'lb', approx)
  }
  const f = roundToFraction(oz)
  if (f.value >= 16) return make('1 lb', 1, 'lb', approx)
  return make(`${f.text} oz`, f.value, 'oz', approx)
}

function fmtUsVolume(ml: number, approx: boolean): FormattedQuantity {
  const tsp = ml / ML_PER_TSP
  if (tsp < 3) {
    const f = roundToFraction(tsp)
    if (f.value === 0) return make('a pinch', 0, 'pinch', approx)
    if (f.value < 3) return make(`${f.text} tsp`, f.value, 'tsp', approx)
  }
  if (tsp < 12) {
    const f = roundToFraction(tsp / 3)
    if (f.value < 4) return make(`${f.text} tbsp`, f.value, 'tbsp', approx)
  }
  const cups = tsp / 48
  if (cups >= 4) {
    const q = cups / 4
    if (Math.abs(q - Math.round(q * 2) / 2) < 0.02) {
      const f = roundToFraction(q)
      return make(`${f.text} ${plural('quart', f.value)}`, f.value, 'quart', approx)
    }
  }
  const f = roundToFraction(cups)
  return make(`${f.text} ${plural('cup', f.value)}`, f.value, 'cup', approx)
}

function fmtCount(n: number, approx: boolean): FormattedQuantity {
  const f = roundToFraction(n)
  return make(f.text === '' ? '0' : f.text, f.value, '', approx)
}

/** Format a canonical quantity for a unit system (no category overrides, no density). */
export function formatInSystem(q: Quantity, system: UnitSystem): FormattedQuantity {
  if (q.unit === 'piece') return fmtCount(q.amount, q.approx)
  if (q.unit === 'g')
    return system === 'metric'
      ? fmtMetricWeight(q.amount, q.approx)
      : fmtUsWeight(q.amount, q.approx)
  return system === 'metric' ? fmtMetricVolume(q.amount, q.approx) : fmtUsVolume(q.amount, q.approx)
}

/**
 * Format a quantity for display per the user's preference: a system plus per-category overrides
 * (flour/sugar in grams, liquids in cups). `density` (g/ml) lets an override show weight as volume or vice
 * versa; such results are marked approximate ("~").
 */
export function formatQuantity(
  q: Quantity,
  prefs: DisplayPrefs,
  opts: { category?: string; density?: number | null } = {},
): FormattedQuantity {
  const ov = opts.category ? prefs.overrides?.[opts.category] : undefined
  const system = ov?.system ?? prefs.system
  let cur = q
  if (ov?.dimension && q.unit !== 'piece' && opts.density && opts.density > 0) {
    if (ov.dimension === 'weight' && q.unit === 'ml')
      cur = { amount: q.amount * opts.density, unit: 'g', approx: true }
    else if (ov.dimension === 'volume' && q.unit === 'g')
      cur = { amount: q.amount / opts.density, unit: 'ml', approx: true }
  }
  return formatInSystem(cur, system)
}
