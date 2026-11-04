import { effectiveExpiryMs, type PantryItem } from '../pantry/expiry'
import { convertCanonical } from '../units/convert'
import { formatQuantity } from '../units/display'
import type { CanonicalUnit, DisplayPrefs, Quantity } from '../units/types'
import { allocatePantry, buildNeeds, type Need, type PlannedMealItem } from './allocate'

export interface ShoppingOptions {
  pantry?: PantryItem[]
  /** Pre-Pesach cutoff (date or date-time): chametz pantry items are unusable after it. */
  chametzCutoff?: string | null
  /** Display preference for the `display` strings. Defaults to US. */
  prefs?: DisplayPrefs
}

export interface ShoppingLine {
  ingredientId: string
  name: string
  /**
   * Totals needed. One entry normally; several (one per unit) only when weight and volume (or pieces) of the
   * same ingredient cannot be merged because no density is known.
   */
  needed: Quantity[]
  /** Usable (non-expired) pantry stock for those units. */
  have: Quantity[]
  /** Still to buy after pantry stock, never negative. */
  toBuy: Quantity[]
  /** True when some meal needs this ingredient with no quantity ("to taste"). */
  unquantified: boolean
  /** Pantry covers everything quantified. */
  covered: boolean
  mealIds: string[]
  /** e.g. "Onions — need 3½ · you have 2". */
  display: string
  /** e.g. "Onions — buy 1½". */
  toBuyDisplay: string
}

const UNIT_ORDER: CanonicalUnit[] = ['g', 'ml', 'piece']
const EPS = 1e-6

interface Group {
  ingredientId: string
  name: string
  category?: string
  density: number | null
  needs: Need[]
}

function fmtList(qs: Quantity[], prefs: DisplayPrefs, g: Group): string {
  return qs
    .map((q) => formatQuantity(q, prefs, { category: g.category, density: g.density }).text)
    .join(' + ')
}

/**
 * Build the shopping list: one line per ingredient with the total needed across the given (accepted) meal
 * items, minus non-expired pantry stock. Brought dishes are excluded. Weight and volume of the same ingredient
 * are merged using its density (result approximate); without a density they stay as separate sub-totals.
 * Pantry stock only covers meals on or before its (chametz-adjusted) expiry.
 */
export function buildShoppingList(
  items: PlannedMealItem[],
  options: ShoppingOptions = {},
): ShoppingLine[] {
  const prefs = options.prefs ?? { system: 'us' }
  const pantry = options.pantry ?? []
  const needs = buildNeeds(items)

  const groups = new Map<string, Group>()
  for (const n of needs) {
    let g = groups.get(n.ingredientId)
    if (!g) {
      g = {
        ingredientId: n.ingredientId,
        name: n.name,
        density: null,
        needs: [],
        ...(n.category && { category: n.category }),
      }
      groups.set(n.ingredientId, g)
    }
    g.density ??= n.density
    g.needs.push(n)
  }
  for (const g of groups.values()) {
    g.density ??=
      pantry.find((p) => p.ingredientId === g.ingredientId && p.density && p.density > 0)
        ?.density ?? null
    for (const n of g.needs) n.density = g.density
  }

  const draws = allocatePantry(needs, pantry, options.chametzCutoff)
  const lines: ShoppingLine[] = []

  for (const g of groups.values()) {
    const quantified = g.needs.filter((n) => n.amount !== null)
    const firstMergeUnit = quantified.find((n) => n.unit !== 'piece')?.unit
    const keyOf = (u: CanonicalUnit): CanonicalUnit =>
      g.density && u !== 'piece' && firstMergeUnit ? firstMergeUnit : u
    const to = (amount: number, from: CanonicalUnit, key: CanonicalUnit): Quantity | null =>
      convertCanonical({ amount, unit: from }, key, g.density)

    const needed = new Map<CanonicalUnit, Quantity>()
    const bought = new Map<CanonicalUnit, Quantity>()
    const add = (
      m: Map<CanonicalUnit, Quantity>,
      key: CanonicalUnit,
      q: Quantity,
      extraApprox: boolean,
    ) => {
      const cur = m.get(key) ?? { amount: 0, unit: key, approx: false }
      cur.amount += q.amount
      cur.approx ||= q.approx || extraApprox
      m.set(key, cur)
    }
    for (const n of quantified) {
      const key = keyOf(n.unit)
      const q = to(n.amount as number, n.unit, key)!
      add(needed, key, q, n.approx)
    }
    const drawsHere = draws.filter((d) => d.need.ingredientId === g.ingredientId)
    // toBuy = needed - drawn, per key
    for (const key of needed.keys()) bought.set(key, { ...needed.get(key)! })
    for (const d of drawsHere) {
      const key = keyOf(d.need.unit)
      const q = to(d.amount, d.need.unit, key)!
      const b = bought.get(key)!
      b.amount -= q.amount
      b.approx ||= d.converted
    }

    // Stock usable at the earliest meal that needs this ingredient (per key).
    const have = new Map<CanonicalUnit, Quantity>()
    for (const key of needed.keys()) {
      const earliest = Math.min(...quantified.filter((n) => keyOf(n.unit) === key).map((n) => n.at))
      for (const p of pantry) {
        if (p.ingredientId !== g.ingredientId || !(p.amount > 0)) continue
        const exp = effectiveExpiryMs(p, options.chametzCutoff)
        if (exp !== null && exp < earliest) continue
        const q = convertCanonical({ amount: p.amount, unit: p.unit }, key, g.density)
        if (q) add(have, key, q, false)
      }
    }

    const ordered = (m: Map<CanonicalUnit, Quantity>, keepZero: boolean): Quantity[] =>
      UNIT_ORDER.filter((u) => m.has(u))
        .map((u) => m.get(u)!)
        .map((q) => (q.amount < EPS ? { ...q, amount: 0 } : q))
        .filter((q) => keepZero || q.amount > 0)

    const neededL = ordered(needed, false)
    const haveL = ordered(have, false)
    const toBuyL = ordered(bought, false)
    const unquantified = g.needs.some((n) => n.amount === null)
    const covered = neededL.length > 0 && toBuyL.length === 0

    let display: string
    let toBuyDisplay: string
    if (neededL.length === 0) {
      display = `${g.name} — as needed`
      toBuyDisplay = display
    } else {
      display = `${g.name} — need ${fmtList(neededL, prefs, g)}`
      if (haveL.length) display += ` · you have ${fmtList(haveL, prefs, g)}`
      toBuyDisplay = toBuyL.length
        ? `${g.name} — buy ${fmtList(toBuyL, prefs, g)}`
        : `${g.name} — covered by pantry`
    }
    lines.push({
      ingredientId: g.ingredientId,
      name: g.name,
      needed: neededL,
      have: haveL,
      toBuy: toBuyL,
      unquantified,
      covered,
      mealIds: [...new Set(g.needs.map((n) => n.mealId))],
      display,
      toBuyDisplay,
    })
  }
  return lines
}
