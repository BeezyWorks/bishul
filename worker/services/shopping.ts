import { todayIn } from '@beitecha/engine'
import {
  buildDiningBrief,
  buildPrepSchedule,
  buildShoppingList,
  calendarDays,
  formatQuantity,
  type PrepMeal,
  type Quantity,
} from '@tavshil/core'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import * as s from '../db/schema'
import { loadCatalog, nameKey } from './catalog'
import { clock, invalid, notFound, type Actor, type Db } from './ctx'
import { householdLocation } from './households'
import { displayCategory } from './mappers'
import { buildContexts, settlePassedMeals } from './planning'
import { corePantry, mealsInRange, nextChametzCutoff, planMeals } from './plans'
import { getPrefs } from './prefs'

// ---------------------------------------------------------------------------------------------------------------
// Shopping list (BRIEF §9): totals come from accepted meals minus pantry; order, checked state and manual lines are
// stored.

function addDaysStr(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export async function getShoppingList(
  db: Db,
  actor: Actor,
  input: { from?: string; to?: string } = {},
) {
  const loc = await householdLocation(db, actor.householdId)
  await settlePassedMeals(db, actor.householdId, { loc })
  const today = todayIn(loc.timeZone)
  const from = input.from ?? today
  const to = input.to ?? addDaysStr(from, 30)
  const meals = await mealsInRange(db, actor.householdId, from, to, 'accepted')
  // Independent reads, in parallel: each one is a round trip to D1.
  const [plan, pantry, prefsAll, { contexts }, stored, catalog] = await Promise.all([
    planMeals(db, actor.householdId, meals),
    corePantry(db, actor.householdId),
    getPrefs(db, actor),
    buildContexts(db, actor, meals, { loc }),
    db
      .select()
      .from(s.shoppingList)
      .where(
        and(eq(s.shoppingList.householdId, actor.householdId), isNull(s.shoppingList.deletedAt)),
      )
      .orderBy(asc(s.shoppingList.position)),
    loadCatalog(db, actor.householdId),
  ])
  const prefs = prefsAll.display
  const cutoff = nextChametzCutoff(loc, today)
  const computed = buildShoppingList(plan.planned, { pantry, chametzCutoff: cutoff, prefs })

  // Sourcing notes ("buy chalav Yisrael butter"), from each meal's dining brief.
  const sourcing = new Map<string, Set<string>>()
  for (const ctx of contexts.values()) {
    for (const n of buildDiningBrief(ctx.input).sourcingNotes)
      for (const ing of n.ingredients) {
        const k = nameKey(ing)
        if (!sourcing.has(k)) sourcing.set(k, new Set())
        sourcing.get(k)!.add(n.text)
      }
  }

  const rowOf = new Map(stored.filter((r) => r.ingredientId).map((r) => [r.ingredientId!, r]))
  const fmt = (q: Quantity, name: string, density: number | null) =>
    formatQuantity(q, prefs, { category: displayCategory(name), density }).text

  const lines = computed.map((l) => {
    const row = rowOf.get(l.ingredientId)
    const density = catalog.get(l.ingredientId)?.densityGPerMl ?? null
    return {
      key: `ing:${l.ingredientId}`,
      manual: false,
      ingredientId: l.ingredientId,
      name: l.name,
      display: l.display,
      toBuyDisplay: l.toBuyDisplay,
      needed: l.needed.map((q) => ({
        amount: q.amount,
        unit: q.unit,
        text: fmt(q, l.name, density),
      })),
      have: l.have.map((q) => ({ amount: q.amount, unit: q.unit, text: fmt(q, l.name, density) })),
      toBuy: l.toBuy.map((q) => ({
        amount: q.amount,
        unit: q.unit,
        text: fmt(q, l.name, density),
      })),
      covered: l.covered,
      unquantified: l.unquantified,
      mealIds: l.mealIds,
      checked: row?.checked ?? false,
      note: row?.note ?? null,
      sourcingNotes: [...(sourcing.get(nameKey(l.name)) ?? [])],
      position: row?.position ?? null,
    }
  })
  const manual = stored
    .filter((r) => !r.ingredientId)
    .map((r) => ({
      key: `manual:${r.id}`,
      manual: true,
      ingredientId: null,
      name: r.manual ?? '',
      display: r.manual ?? '',
      toBuyDisplay: r.manual ?? '',
      needed: [],
      have: [],
      toBuy: [],
      covered: false,
      unquantified: true,
      mealIds: [],
      checked: r.checked,
      note: r.note,
      sourcingNotes: [] as string[],
      position: r.position,
    }))
  const all = [...lines, ...manual]
  // Ordered lines first (by stored position), then new ones in the order the meals need them.
  all.sort((a, b) => {
    if (a.position !== null && b.position !== null) return a.position - b.position
    if (a.position !== null) return -1
    if (b.position !== null) return 1
    return 0
  })
  return {
    from,
    to,
    mealCount: meals.length,
    lines: all,
    buyCount: all.filter((l) => !l.checked && (l.manual || l.toBuy.length || l.unquantified))
      .length,
    note: meals.length
      ? 'Totals are what the accepted meals need minus unexpired pantry stock.'
      : 'No accepted meals in this range, so there is nothing to buy yet. Accept a menu first.',
  }
}

export interface ShoppingUpdate {
  check?: { key: string; checked: boolean }[]
  /** Line keys in the order they should appear. */
  order?: string[]
  addManual?: (string | { text: string; note?: string })[]
  removeKeys?: string[]
  notes?: { key: string; note: string | null }[]
  uncheckAll?: boolean
}

export async function updateShoppingList(db: Db, actor: Actor, input: ShoppingUpdate) {
  const [stored, catalog] = await Promise.all([
    db
      .select()
      .from(s.shoppingList)
      .where(
        and(eq(s.shoppingList.householdId, actor.householdId), isNull(s.shoppingList.deletedAt)),
      ),
    loadCatalog(db, actor.householdId),
  ])
  let nextPos = stored.reduce((n, r) => Math.max(n, r.position + 1), 0)
  const byKey = new Map<string, (typeof stored)[number]>()
  for (const r of stored) byKey.set(r.ingredientId ? `ing:${r.ingredientId}` : `manual:${r.id}`, r)

  async function row(key: string) {
    const have = byKey.get(key)
    if (have) return have
    const m = /^ing:(.+)$/.exec(key)
    if (!m || !catalog.get(m[1])) throw notFound(`Shopping line ${key}`)
    const [created] = await db
      .insert(s.shoppingList)
      .values({ householdId: actor.householdId, ingredientId: m[1], position: nextPos++ })
      .returning()
    byKey.set(key, created)
    return created
  }

  for (const t of input.addManual ?? []) {
    const text = typeof t === 'string' ? t : t.text
    if (!text.trim()) throw invalid('A manual line needs text')
    const [created] = await db
      .insert(s.shoppingList)
      .values({
        householdId: actor.householdId,
        position: nextPos++,
        manual: text.trim(),
        note: typeof t === 'string' ? null : (t.note ?? null),
      })
      .returning()
    byKey.set(`manual:${created.id}`, created)
  }
  for (const c of input.check ?? [])
    await db
      .update(s.shoppingList)
      .set({ checked: c.checked })
      .where(eq(s.shoppingList.id, (await row(c.key)).id))
  for (const n of input.notes ?? [])
    await db
      .update(s.shoppingList)
      .set({ note: n.note })
      .where(eq(s.shoppingList.id, (await row(n.key)).id))
  if (input.uncheckAll)
    await db
      .update(s.shoppingList)
      .set({ checked: false })
      .where(
        and(eq(s.shoppingList.householdId, actor.householdId), isNull(s.shoppingList.deletedAt)),
      )
  if (input.order) {
    const stmts = []
    for (let i = 0; i < input.order.length; i++) {
      const r = await row(input.order[i])
      stmts.push(db.update(s.shoppingList).set({ position: i }).where(eq(s.shoppingList.id, r.id)))
    }
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50) as never)
  }
  for (const k of input.removeKeys ?? []) {
    const r = byKey.get(k)
    if (r)
      await db
        .update(s.shoppingList)
        .set({ deletedAt: Date.now() })
        .where(eq(s.shoppingList.id, r.id))
  }
  return getShoppingList(db, actor)
}

// ---------------------------------------------------------------------------------------------------------------
// Prep schedule (BRIEF §9)

function slotFor(
  meal: { name: string; date: string; time: number | null },
  day: ReturnType<typeof calendarDays>[number],
) {
  const n = meal.name.toLowerCase()
  if (/breakfast/.test(n)) return 'breakfast' as const
  if (/shlishit|third/.test(n)) return 'seudah_shlishit' as const
  if (/lunch|brunch|day/.test(n)) return 'lunch' as const
  if (/night|dinner|supper|seder/.test(n)) return 'dinner' as const
  if (day.noMelacha && !day.isErevShabbat) return 'lunch' as const
  return 'dinner' as const
}

export async function getPrepSchedule(
  db: Db,
  actor: Actor,
  input: { from?: string; to?: string; includeDrafts?: boolean } = {},
) {
  await settlePassedMeals(db, actor.householdId)
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const from = input.from ?? today
  const to = input.to ?? addDaysStr(from, 14)
  const meals = (await mealsInRange(db, actor.householdId, from, to)).filter(
    (m) => input.includeDrafts || m.status === 'accepted',
  )
  const plan = await planMeals(db, actor.householdId, meals)
  const assumptions: string[] = []
  const days = meals.length ? calendarDays(from, to, loc) : []
  const prepMeals: PrepMeal[] = meals.map((m) => {
    const day = days.find((d) => d.date === m.date) ?? calendarDays(m.date, m.date, loc)[0]
    return {
      id: m.id,
      date: m.date,
      ...(m.time !== null && { time: m.time }),
      slot: slotFor(m, day),
      label: m.name,
      items: (plan.items.get(m.id) ?? []).map((it) => {
        const v = it.versionId ? plan.versions.get(it.versionId) : undefined
        if (!v)
          return {
            dishId: it.id,
            title: it.description ?? 'Brought dish',
            activeMinutes: 0,
            totalMinutes: 0,
            servingStyle: 'hot' as const,
            brought: true,
          }
        const title = v.recipe.title
        const active = v.version.activeMinutes
        if (active === null)
          assumptions.push(`${title} has no cooking times, so 30 minutes of work was assumed.`)
        const a = active ?? 30
        return {
          dishId: v.version.id,
          title,
          activeMinutes: a,
          totalMinutes: Math.max(v.version.totalMinutes ?? a, a),
          prePrep: (v.version.prePrep ?? []).map((p) => ({
            label: p.step,
            leadMinutes: p.lead_minutes,
          })),
          servingStyle: v.version.servingStyle ?? ('hot' as const),
          holdsOnBlech: v.version.holdsOnBlech ?? undefined,
        }
      }),
    }
  })
  const sched = buildPrepSchedule({ location: loc, meals: prepMeals })
  const text = (m: number | undefined) =>
    m === undefined ? null : clock(((m % 1440) + 1440) % 1440)
  return {
    from,
    to,
    mealCount: meals.length,
    days: sched.days.map((d) => ({
      ...d,
      meals: d.meals.map((m) => ({ ...m, timeText: text(m.time) })),
      tasks: d.tasks.map((t) => ({ ...t, startText: text(t.start), endText: text(t.end) })),
    })),
    flags: sched.flags,
    assumptions: [...new Set(assumptions)],
    note: meals.length
      ? null
      : 'No accepted meals in this range. Accept a menu to get a prep schedule.',
  }
}
