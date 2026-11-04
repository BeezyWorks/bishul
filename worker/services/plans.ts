// Loaders shared by pantry, shopping, prep and settling: the household's meals turned into core's plain inputs.
import {
  chametzCutoff,
  type HouseholdLocation,
  type PantryItem as CorePantryItem,
  type PlannedMealItem,
} from '@bishul/core'
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'

import * as s from '../db/schema'
import { inChunks, type Db } from './ctx'
import { canonicalUnit, toCoreLine, type LoadedVersion } from './mappers'
import { loadVersions } from './recipes'

export type MealRow = typeof s.meals.$inferSelect
export type MealItemRow = typeof s.mealItems.$inferSelect

export async function mealsInRange(
  db: Db,
  householdId: string,
  from: string,
  to: string,
  status?: 'draft' | 'accepted',
): Promise<MealRow[]> {
  return db
    .select()
    .from(s.meals)
    .where(
      and(
        eq(s.meals.householdId, householdId),
        gte(s.meals.date, from),
        lte(s.meals.date, to),
        isNull(s.meals.deletedAt),
        status ? eq(s.meals.status, status) : undefined,
      ),
    )
    .orderBy(asc(s.meals.date), asc(s.meals.time), asc(s.meals.createdAt))
}

export async function itemsOfMeals(db: Db, mealIds: string[]): Promise<Map<string, MealItemRow[]>> {
  const rows = await inChunks(mealIds, (part) =>
    db
      .select()
      .from(s.mealItems)
      .where(and(inArray(s.mealItems.mealId, part), isNull(s.mealItems.deletedAt)))
      .orderBy(asc(s.mealItems.position)),
  )
  const out = new Map<string, MealItemRow[]>()
  for (const id of mealIds) out.set(id, [])
  for (const r of rows) out.get(r.mealId)!.push(r)
  return out
}

/** The scale an item cooks at: as set, else from servings against the version's base yield, else 1. */
export function effectiveScale(item: MealItemRow, version: LoadedVersion | undefined): number {
  if (item.scale && item.scale > 0) return item.scale
  if (item.servings && version?.version.servings) return item.servings / version.version.servings
  return 1
}

export interface PlannedMeals {
  meals: MealRow[]
  items: Map<string, MealItemRow[]>
  versions: Map<string, LoadedVersion>
  planned: PlannedMealItem[]
}

/** Meals with their items and versions, and the shopping/pantry view of what they use. Brought dishes cost nothing. */
export async function planMeals(db: Db, householdId: string, meals: MealRow[]): Promise<PlannedMeals> {
  const items = await itemsOfMeals(db, meals.map((m) => m.id))
  const vids = [...items.values()].flat().map((i) => i.versionId).filter((x): x is string => !!x)
  const versions = await loadVersions(db, householdId, vids)
  const planned: PlannedMealItem[] = []
  for (const m of meals)
    for (const it of items.get(m.id) ?? []) {
      if (!it.versionId) continue
      const v = versions.get(it.versionId)
      if (!v) continue
      planned.push({
        mealId: m.id,
        mealDate: m.date,
        lines: v.lines.map(toCoreLine),
        scale: effectiveScale(it, v),
      })
    }
  return { meals, items, versions, planned }
}

/** Pantry rows as core's pantry items (canonical amounts, chametz from the catalog). */
export async function corePantry(db: Db, householdId: string): Promise<CorePantryItem[]> {
  const rows = await db
    .select({ item: s.pantryItems, ingredient: s.ingredients })
    .from(s.pantryItems)
    .innerJoin(s.ingredients, eq(s.ingredients.id, s.pantryItems.ingredientId))
    .where(and(eq(s.pantryItems.householdId, householdId), isNull(s.pantryItems.deletedAt)))
  return rows.map(({ item, ingredient }) => ({
    id: item.id,
    ingredientId: item.ingredientId,
    name: ingredient.name,
    amount: item.quantityMetric ?? 0,
    unit: canonicalUnit(item.unit),
    ...(item.location && { location: item.location }),
    expiry: item.expiresOn,
    chametz: !!ingredient.flags?.chametz?.value,
    density: ingredient.densityGPerMl,
  }))
}

/** The pre-Pesach cutoff date still ahead of `today` (this year's, or next year's once it has passed). */
export function nextChametzCutoff(loc: HouseholdLocation, today: string): string | null {
  try {
    const year = Number(today.slice(0, 4))
    const c = chametzCutoff(year, loc)
    if (c.date >= today) return c.date
    return chametzCutoff(year + 1, loc).date
  } catch {
    return null
  }
}
