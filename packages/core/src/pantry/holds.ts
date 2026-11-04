import { allocatePantry, buildNeeds, type PlannedMealItem } from '../shopping/allocate'
import type { PantryItem } from './expiry'

export interface PantryHold {
  pantryId: string
  ingredientId: string
  /** Amount held aside, in the pantry item's own unit. */
  held: number
  /** Meals that will use it. */
  mealIds: string[]
}

/**
 * What accepted upcoming meals will use from the pantry, recomputed from scratch on every call (so holds
 * follow plan and version edits). Pass only accepted meal items. Expired stock is never held; chametz items
 * are only held for meals before the cutoff.
 */
export function computeHolds(
  pantry: PantryItem[],
  items: PlannedMealItem[],
  chametzCutoff?: string | null,
): PantryHold[] {
  const draws = allocatePantry(buildNeeds(items), pantry, chametzCutoff)
  const byId = new Map<string, PantryHold>()
  for (const d of draws) {
    const item = pantry.find((p) => p.id === d.pantryId)!
    const h = byId.get(d.pantryId) ?? {
      pantryId: d.pantryId,
      ingredientId: item.ingredientId,
      held: 0,
      mealIds: [],
    }
    h.held += d.itemAmount
    if (!h.mealIds.includes(d.need.mealId)) h.mealIds.push(d.need.mealId)
    byId.set(d.pantryId, h)
  }
  return [...byId.values()]
}

/** Pantry quantity left after holds (never negative), per item id. */
export function freeAfterHolds(pantry: PantryItem[], holds: PantryHold[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of pantry) {
    const h = holds.find((x) => x.pantryId === p.id)?.held ?? 0
    out.set(p.id, Math.max(0, p.amount - h))
  }
  return out
}
