import type { CanonicalUnit } from '../units/types'

export interface PantryItem {
  id: string
  ingredientId: string
  name: string
  /** Canonical amount. */
  amount: number
  unit: CanonicalUnit
  location?: string
  /** Expiry date ("2026-11-10") or date-time. Null/undefined = does not expire. */
  expiry?: string | null
  chametz?: boolean
  /** Density in g/ml, if known. */
  density?: number | null
  category?: string
}

const DAY_MS = 86_400_000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a date or date-time to epoch milliseconds. Date-only strings are floating dates (treated as UTC);
 * `edge` says whether a bare date means the start or the end of that day. Date-times without an offset are
 * also treated as floating (UTC), so callers should use one convention throughout (household-local
 * wall-clock time). Returns NaN when unparseable.
 */
export function toInstant(s: string, edge: 'start' | 'end' = 'start'): number {
  if (DATE_ONLY.test(s)) return Date.parse(`${s}T00:00:00Z`) + (edge === 'end' ? DAY_MS - 1 : 0)
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  return Date.parse(hasZone ? s : `${s}Z`)
}

/**
 * The moment an item stops being usable: its expiry (end of day for a bare date), or for chametz items
 * min(expiry, pre-Pesach cutoff). Null when it never expires.
 */
export function effectiveExpiryMs(item: PantryItem, chametzCutoff?: string | null): number | null {
  const parts: number[] = []
  if (item.expiry) {
    const e = toInstant(item.expiry, 'end')
    if (Number.isFinite(e)) parts.push(e)
  }
  if (item.chametz && chametzCutoff) {
    const c = toInstant(chametzCutoff, 'start')
    if (Number.isFinite(c)) parts.push(c)
  }
  return parts.length ? Math.min(...parts) : null
}

/** Effective expiry as an ISO string (UTC-floating), or null. */
export function effectiveExpiry(item: PantryItem, chametzCutoff?: string | null): string | null {
  const ms = effectiveExpiryMs(item, chametzCutoff)
  return ms === null ? null : new Date(ms).toISOString()
}

/** True when the item can still be used at `at` (a date or date-time). Expired items are never available. */
export function isAvailableAt(
  item: PantryItem,
  at: string,
  chametzCutoff?: string | null,
): boolean {
  if (!(item.amount > 0)) return false
  const exp = effectiveExpiryMs(item, chametzCutoff)
  if (exp === null) return true
  const t = toInstant(at, 'start')
  return Number.isFinite(t) && t <= exp
}

export interface ExpiringItem {
  item: PantryItem
  expiresAt: string
  /** Whole days left (0 = expires today). */
  daysLeft: number
  /** True when the chametz cutoff, not the printed date, is what makes it expire. */
  chametzLimited: boolean
}

/**
 * Items that are still good now but expire within `days` days (inclusive), soonest first. Chametz items use
 * their effective expiry.
 */
export function expiringSoon(
  items: PantryItem[],
  now: string,
  days: number,
  chametzCutoff?: string | null,
): ExpiringItem[] {
  const nowMs = toInstant(now, 'start')
  const out: ExpiringItem[] = []
  for (const item of items) {
    if (!(item.amount > 0)) continue
    const exp = effectiveExpiryMs(item, chametzCutoff)
    if (exp === null || exp < nowMs) continue
    const daysLeft = Math.floor((exp - nowMs) / DAY_MS)
    if (daysLeft > days) continue
    const plain = item.expiry ? toInstant(item.expiry, 'end') : Infinity
    out.push({
      item,
      expiresAt: new Date(exp).toISOString(),
      daysLeft,
      chametzLimited: exp < plain,
    })
  }
  return out.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
}

/** Items usable at `at` (not expired by their effective expiry). */
export function availableItems(
  items: PantryItem[],
  at: string,
  chametzCutoff?: string | null,
): PantryItem[] {
  return items.filter((i) => isAvailableAt(i, at, chametzCutoff))
}
