import { findUnit } from './tables'
import type { CanonicalUnit, Quantity } from './types'

function canonicalOf(dim: 'weight' | 'volume' | 'count'): CanonicalUnit {
  return dim === 'weight' ? 'g' : dim === 'volume' ? 'ml' : 'piece'
}

/** Convert an amount in any named unit to canonical. Null for unknown units or non-finite amounts. */
export function toCanonical(amount: number, unitName: string, approx = false): Quantity | null {
  const def = findUnit(unitName)
  if (!def || !Number.isFinite(amount)) return null
  return { amount: amount * def.factor, unit: canonicalOf(def.dimension), approx }
}

/** Convert between canonical units. g<->ml needs a positive density (g/ml); pieces never convert. */
export function convertCanonical(
  q: { amount: number; unit: CanonicalUnit; approx?: boolean },
  to: CanonicalUnit,
  density?: number | null,
): Quantity | null {
  const approx = q.approx ?? false
  if (q.unit === to) return { amount: q.amount, unit: to, approx }
  if (q.unit === 'piece' || to === 'piece') return null
  if (!density || !(density > 0)) return null
  const amount = q.unit === 'ml' ? q.amount * density : q.amount / density
  return { amount, unit: to, approx: true }
}

/**
 * Convert an amount from one named unit to another named unit (e.g. cups -> g).
 * Weight<->weight and volume<->volume are exact; weight<->volume needs a density and is marked approximate.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  opts: { density?: number | null; approx?: boolean } = {},
): { amount: number; approx: boolean } | null {
  const b = findUnit(to)
  const canon = toCanonical(amount, from, opts.approx)
  if (!b || !canon) return null
  const c = convertCanonical(canon, canonicalOf(b.dimension), opts.density)
  if (!c) return null
  return { amount: c.amount / b.factor, approx: c.approx }
}
