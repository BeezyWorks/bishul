import {
  computeHolds,
  effectiveExpiry,
  expiringSoon,
  formatQuantity,
  isAvailableAt,
  parseQuantity,
  toCanonical,
  type Quantity,
} from '@bishul/core'
import { and, asc, eq, isNull } from 'drizzle-orm'

import * as s from '../db/schema'
import { ensureIngredient, loadCatalog, type IngredientMeta } from './catalog'
import { invalid, isDate, notFound, type Actor, type Db } from './ctx'
import { householdLocation } from './households'
import { displayCategory } from './mappers'
import { corePantry, mealsInRange, nextChametzCutoff, planMeals } from './plans'
import { getPrefs } from './prefs'
import { todayIn } from '@beitecha/engine'

// ---------------------------------------------------------------------------------------------------------------
// Pantry (BRIEF §8): item, quantity, location, expiry. Holds and expiry are computed on every read.

export interface PantryInput {
  name?: string
  itemId?: string
  /** "2 cups", "500 g", "3" or a number in `unit`. */
  quantity?: string | number
  unit?: string
  location?: string | null
  expiresOn?: string | null
  /** Catalog data if the ingredient is new. */
  ingredient?: IngredientMeta
}

function parseAmount(
  q: string | number | undefined,
  unit?: string,
): { amount: number; unit: 'g' | 'ml' | 'piece' } | null {
  if (q === undefined || q === '') return null
  if (typeof q === 'number') {
    const c = unit ? toCanonical(q, unit) : null
    return c ? { amount: c.amount, unit: c.unit } : { amount: q, unit: 'piece' }
  }
  const p = parseQuantity(unit && /^[\d./\s]+$/.test(q) ? `${q} ${unit}` : q)
  if (!p) throw invalid(`Could not read the quantity "${q}". Try "2 cups" or "500 g".`)
  return { amount: p.amount, unit: p.unit }
}

export async function listPantry(db: Db, actor: Actor, opts: { soonDays?: number } = {}) {
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const cutoff = nextChametzCutoff(loc, today)
  const prefs = (await getPrefs(db, actor)).display
  const items = await corePantry(db, actor.householdId)
  const rows = await db
    .select()
    .from(s.pantryItems)
    .where(and(eq(s.pantryItems.householdId, actor.householdId), isNull(s.pantryItems.deletedAt)))
  const info = new Map(rows.map((r) => [r.id, r]))

  const upcoming = await mealsInRange(db, actor.householdId, today, '2100-01-01', 'accepted')
  const plan = await planMeals(db, actor.householdId, upcoming)
  const holds = computeHolds(items, plan.planned, cutoff)
  const mealById = new Map(upcoming.map((m) => [m.id, m]))
  const soon = new Set(expiringSoon(items, today, opts.soonDays ?? 7, cutoff).map((e) => e.item.id))
  const soonInfo = new Map(
    expiringSoon(items, today, opts.soonDays ?? 7, cutoff).map((e) => [e.item.id, e]),
  )

  return {
    today,
    chametzCutoff: cutoff,
    items: items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((it) => {
        const row = info.get(it.id)!
        const hold = holds.find((h) => h.pantryId === it.id)
        const eff = effectiveExpiry(it, cutoff)
        const q: Quantity = { amount: it.amount, unit: it.unit, approx: false }
        const expired = it.amount > 0 && !isAvailableAt(it, today, cutoff)
        return {
          id: it.id,
          ingredientId: it.ingredientId,
          name: it.name,
          amount: it.amount,
          unit: it.unit,
          display:
            it.amount > 0
              ? formatQuantity(q, prefs, {
                  category: displayCategory(it.name),
                  density: it.density,
                }).text
              : 'some',
          location: row.location,
          expiresOn: row.expiresOn,
          effectiveExpiry: eff ? eff.slice(0, 10) : null,
          chametz: !!it.chametz,
          chametzLimited:
            soonInfo.get(it.id)?.chametzLimited ??
            (!!it.chametz && !!eff && (!row.expiresOn || eff.slice(0, 10) < row.expiresOn)),
          expired,
          expiringSoon: soon.has(it.id),
          daysLeft: soonInfo.get(it.id)?.daysLeft ?? null,
          held: hold
            ? {
                amount: hold.held,
                unit: it.unit,
                display: formatQuantity(
                  { amount: hold.held, unit: it.unit, approx: false },
                  prefs,
                  { category: displayCategory(it.name), density: it.density },
                ).text,
              }
            : null,
          heldFor: (hold?.mealIds ?? []).map((id) => ({
            mealId: id,
            name: mealById.get(id)?.name ?? '',
            date: mealById.get(id)?.date ?? '',
          })),
        }
      }),
    note: 'Expired items are never suggested and never count against shopping. Items expiring soon are boosted in suggestions.',
  }
}

export async function addPantryItem(db: Db, actor: Actor, input: PantryInput) {
  if (!input.name?.trim()) throw invalid('A pantry item needs a name')
  if (input.expiresOn && !isDate(input.expiresOn)) throw invalid('expiresOn must be YYYY-MM-DD')
  const catalog = await loadCatalog(db, actor.householdId)
  const { row } = await ensureIngredient(
    db,
    catalog,
    input.name,
    input.ingredient,
    actor.via === 'web' ? 'user' : 'ai',
  )
  const amount = parseAmount(input.quantity, input.unit)
  const [item] = await db
    .insert(s.pantryItems)
    .values({
      householdId: actor.householdId,
      ingredientId: row.id,
      quantityMetric: amount?.amount ?? null,
      unit: amount?.unit ?? null,
      location: input.location ?? null,
      expiresOn: input.expiresOn ?? null,
    })
    .returning({ id: s.pantryItems.id })
  return { id: item.id, name: row.name }
}

async function requireItem(db: Db, actor: Actor, id: string) {
  const [it] = await db
    .select()
    .from(s.pantryItems)
    .where(
      and(
        eq(s.pantryItems.id, id),
        eq(s.pantryItems.householdId, actor.householdId),
        isNull(s.pantryItems.deletedAt),
      ),
    )
  if (!it) throw notFound('Pantry item')
  return it
}

export async function updatePantryItem(db: Db, actor: Actor, id: string, input: PantryInput) {
  const it = await requireItem(db, actor, id)
  const patch: Partial<typeof s.pantryItems.$inferInsert> = {}
  if (input.quantity !== undefined) {
    const a = parseAmount(input.quantity, input.unit ?? undefined)
    patch.quantityMetric = a?.amount ?? null
    patch.unit = a?.unit ?? it.unit
  }
  if (input.location !== undefined) patch.location = input.location
  if (input.expiresOn !== undefined) {
    if (input.expiresOn && !isDate(input.expiresOn)) throw invalid('expiresOn must be YYYY-MM-DD')
    patch.expiresOn = input.expiresOn
  }
  if (Object.keys(patch).length)
    await db.update(s.pantryItems).set(patch).where(eq(s.pantryItems.id, id))
  return { id }
}

export async function removePantryItem(db: Db, actor: Actor, id: string) {
  await requireItem(db, actor, id)
  await db.update(s.pantryItems).set({ deletedAt: Date.now() }).where(eq(s.pantryItems.id, id))
  return { deleted: true }
}

export interface PantryChange extends PantryInput {
  op: 'add' | 'set' | 'use' | 'remove'
}

/** Several pantry edits at once (the MCP `update_pantry`): add stock, set what is left, use some, or remove. */
export async function applyPantryChanges(db: Db, actor: Actor, changes: PantryChange[]) {
  const results: { op: string; name?: string; id?: string; note?: string }[] = []
  for (const c of changes) {
    if (c.op === 'add') {
      const r = await addPantryItem(db, actor, c)
      results.push({ op: 'add', ...r })
      continue
    }
    let it: typeof s.pantryItems.$inferSelect | undefined
    if (c.itemId) it = await requireItem(db, actor, c.itemId)
    else if (c.name) {
      const catalog = await loadCatalog(db, actor.householdId)
      const ing = catalog.find(c.name)
      if (ing) {
        const rows = await db
          .select()
          .from(s.pantryItems)
          .where(
            and(
              eq(s.pantryItems.householdId, actor.householdId),
              eq(s.pantryItems.ingredientId, ing.id),
              isNull(s.pantryItems.deletedAt),
            ),
          )
          .orderBy(asc(s.pantryItems.expiresOn))
        it = rows[0]
      }
    }
    if (!it) throw notFound(`Pantry item ${c.name ?? c.itemId ?? ''}`.trim())
    if (c.op === 'remove') {
      await removePantryItem(db, actor, it.id)
      results.push({ op: 'remove', id: it.id })
    } else if (c.op === 'set') {
      await updatePantryItem(db, actor, it.id, c)
      results.push({ op: 'set', id: it.id })
    } else {
      const used = parseAmount(c.quantity, c.unit)
      if (!used) throw invalid('Say how much was used')
      const left = Math.max(0, (it.quantityMetric ?? 0) - used.amount)
      await db
        .update(s.pantryItems)
        .set({ quantityMetric: left })
        .where(eq(s.pantryItems.id, it.id))
      results.push({ op: 'use', id: it.id, note: left === 0 ? 'now empty' : undefined })
    }
  }
  return { changes: results }
}

// ---------------------------------------------------------------------------------------------------------------
// Equipment (BRIEF §8)

export async function listEquipment(db: Db, actor: Actor) {
  const rows = await db
    .select()
    .from(s.equipment)
    .where(and(eq(s.equipment.householdId, actor.householdId), isNull(s.equipment.deletedAt)))
    .orderBy(asc(s.equipment.item))
  return rows.map((r) => ({ id: r.id, item: r.item, count: r.count, designation: r.designation }))
}

export interface EquipmentInput {
  id?: string
  item?: string
  count?: number
  designation?: 'meat' | 'dairy' | 'parve' | 'pesach' | null
  remove?: boolean
}

export async function saveEquipment(db: Db, actor: Actor, input: EquipmentInput) {
  if (input.id) {
    const [e] = await db
      .select()
      .from(s.equipment)
      .where(
        and(
          eq(s.equipment.id, input.id),
          eq(s.equipment.householdId, actor.householdId),
          isNull(s.equipment.deletedAt),
        ),
      )
    if (!e) throw notFound('Equipment')
    if (input.remove) {
      await db.update(s.equipment).set({ deletedAt: Date.now() }).where(eq(s.equipment.id, e.id))
      return { deleted: true }
    }
    await db
      .update(s.equipment)
      .set({
        ...(input.item && { item: input.item }),
        ...(input.count !== undefined && { count: input.count }),
        ...(input.designation !== undefined && { designation: input.designation }),
      })
      .where(eq(s.equipment.id, e.id))
    return { id: e.id }
  }
  if (!input.item?.trim()) throw invalid('Equipment needs an item name')
  const [e] = await db
    .insert(s.equipment)
    .values({
      householdId: actor.householdId,
      item: input.item.trim(),
      count: input.count ?? 1,
      designation: input.designation ?? null,
    })
    .returning({ id: s.equipment.id })
  return { id: e.id }
}

export async function getKitchen(db: Db, actor: Actor) {
  return { equipment: await listEquipment(db, actor) }
}
