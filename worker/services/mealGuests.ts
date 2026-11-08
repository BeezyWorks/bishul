// Guests on a meal: who is present, and what that does to a meal (it becomes hosted, and is named for its day).
import { autoMealName, calendarDays, type DaySlot } from '@bishul/core'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import * as s from '../db/schema'
import { inChunks, unique, type Actor, type Db } from './ctx'
import { householdLocation } from './households'
import type { MealRow } from './plans'

/** Marks people present or absent on a meal, reviving rows that were removed earlier (the pair is unique). */
export async function setPresent(db: Db, mealId: string, personIds: string[], present: boolean) {
  if (!personIds.length) return
  const rows = await inChunks(personIds, (part) =>
    db
      .select()
      .from(s.mealAttendees)
      .where(and(eq(s.mealAttendees.mealId, mealId), inArray(s.mealAttendees.personId, part))),
  )
  const byPerson = new Map(rows.map((r) => [r.personId, r]))
  const stmts: unknown[] = []
  for (const id of unique(personIds)) {
    const row = byPerson.get(id)
    if (present) {
      if (!row) stmts.push(db.insert(s.mealAttendees).values({ mealId, personId: id }))
      else if (row.deletedAt !== null)
        stmts.push(
          db.update(s.mealAttendees).set({ deletedAt: null }).where(eq(s.mealAttendees.id, row.id)),
        )
    } else if (row && row.deletedAt === null) {
      stmts.push(
        db
          .update(s.mealAttendees)
          .set({ deletedAt: Date.now() })
          .where(eq(s.mealAttendees.id, row.id)),
      )
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50) as never)
}

/**
 * After guests change: a meal with a guest from another household becomes hosted, and while its name is still the
 * automatic one it is named for the day (a holiday, else "Tuesday dinner"). Removing every guest leaves it hosted.
 */
export async function syncHosted(db: Db, actor: Actor, mealId: string): Promise<void> {
  const [meal] = await db.select().from(s.meals).where(eq(s.meals.id, mealId))
  if (!meal) return
  const att = await db
    .select({ personId: s.mealAttendees.personId })
    .from(s.mealAttendees)
    .where(and(eq(s.mealAttendees.mealId, mealId), isNull(s.mealAttendees.deletedAt)))
  const persons = att.length
    ? await inChunks(
        att.map((a) => a.personId),
        (part) => db.select().from(s.persons).where(inArray(s.persons.id, part)),
      )
    : []
  const listed = await db
    .select()
    .from(s.mealHouseholds)
    .where(and(eq(s.mealHouseholds.mealId, mealId), isNull(s.mealHouseholds.deletedAt)))
  const hasGuest =
    persons.some((p) => p.householdId !== actor.householdId) ||
    listed.some((l) => l.householdId !== actor.householdId)
  if (hasGuest && !meal.hosted) {
    const patch: Partial<typeof s.meals.$inferInsert> = { hosted: true }
    if (!meal.nameEdited) patch.name = await autoNameFor(db, actor, meal.date, meal.slot as DaySlot)
    await db.update(s.meals).set(patch).where(eq(s.meals.id, mealId))
  }
}

export async function autoNameFor(
  db: Db,
  actor: Actor,
  date: string,
  slot: DaySlot,
): Promise<string> {
  const loc = await householdLocation(db, actor.householdId)
  const day = calendarDays(date, date, loc)[0]
  return autoMealName(day, slot)
}

export async function reopenIfAccepted(db: Db, meal: MealRow) {
  if (meal.status === 'accepted')
    await db
      .update(s.meals)
      .set({ status: 'draft', acceptedAt: null })
      .where(eq(s.meals.id, meal.id))
}
