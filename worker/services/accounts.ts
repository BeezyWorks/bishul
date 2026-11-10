import { and, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm'

import * as s from '../db/schema'
import { chunks, type Db } from './ctx'
import { eraseUserProfile } from './people'

/**
 * A BeezyWorks account was deleted (BRIEF §3). Erases the profile (see `eraseUserProfile`), then settles what the
 * user owned:
 * - A household with other members stays with them. If the user owned it, ownership passes to the member who has
 *   been there longest. Recipes the user wrote stay with the household (it has full access to every member's
 *   recipes); everything else already belongs to the household.
 * - A household of one goes with its owner: its contacts, recipes, collections and invites are retired too, except
 *   recipes that are public (BRIEF §10): those stay, and show their author as anonymous.
 * Also revokes API keys, drops display preferences and revokes the links and invites they created.
 * Rows are soft-deleted (sync-friendly). Safe to run again.
 */
export async function eraseUserAccount(db: Db, userId: string) {
  const now = Date.now()
  await eraseUserProfile(db, userId)

  const memberships = await db
    .select({ householdId: s.householdMembers.householdId })
    .from(s.householdMembers)
    .innerJoin(s.households, eq(s.households.id, s.householdMembers.householdId))
    .where(
      and(
        eq(s.householdMembers.userId, userId),
        isNull(s.householdMembers.deletedAt),
        eq(s.households.isGhost, false),
        isNull(s.households.deletedAt),
      ),
    )
  // Households they own even if the membership row is already gone.
  const owned = await db
    .select({ id: s.households.id })
    .from(s.households)
    .where(
      and(
        eq(s.households.ownerUserId, userId),
        eq(s.households.isGhost, false),
        isNull(s.households.deletedAt),
      ),
    )
  const householdIds = [
    ...new Set([...memberships.map((m) => m.householdId), ...owned.map((h) => h.id)]),
  ]

  for (const householdId of householdIds) {
    const others = await db
      .select()
      .from(s.householdMembers)
      .where(
        and(
          eq(s.householdMembers.householdId, householdId),
          ne(s.householdMembers.userId, userId),
          isNull(s.householdMembers.deletedAt),
        ),
      )
      .orderBy(s.householdMembers.createdAt)
    if (!others.length) {
      await retireHousehold(db, householdId, now)
      continue
    }
    const [h] = await db.select().from(s.households).where(eq(s.households.id, householdId))
    const stmts: unknown[] = [
      db
        .update(s.householdMembers)
        .set({ deletedAt: now })
        .where(
          and(
            eq(s.householdMembers.householdId, householdId),
            eq(s.householdMembers.userId, userId),
          ),
        ),
    ]
    if (h?.ownerUserId === userId) {
      stmts.push(
        db
          .update(s.households)
          .set({ ownerUserId: others[0].userId })
          .where(eq(s.households.id, householdId)),
        db
          .update(s.householdMembers)
          .set({ role: 'owner' })
          .where(eq(s.householdMembers.id, others[0].id)),
      )
    }
    await db.batch(stmts as never)
  }

  await db.batch([
    db
      .update(s.apiKeys)
      .set({ revokedAt: now, deletedAt: now })
      .where(and(eq(s.apiKeys.userId, userId), isNull(s.apiKeys.deletedAt))),
    db
      .update(s.userPrefs)
      .set({ deletedAt: now })
      .where(and(eq(s.userPrefs.userId, userId), isNull(s.userPrefs.deletedAt))),
    db
      .update(s.shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(s.shareLinks.createdBy, userId), isNull(s.shareLinks.revokedAt))),
    db
      .update(s.householdInvites)
      .set({ revokedAt: now })
      .where(and(eq(s.householdInvites.createdBy, userId), isNull(s.householdInvites.revokedAt))),
  ])
}

/** A household nobody is left in: it, its contacts, recipes, collections and open invites are retired. */
async function retireHousehold(db: Db, householdId: string, now: number) {
  const ghosts = await db
    .select({ id: s.households.id })
    .from(s.households)
    .where(and(eq(s.households.ghostOfHouseholdId, householdId), eq(s.households.isGhost, true)))
  const all = [householdId, ...ghosts.map((g) => g.id)]
  for (const part of chunks(all)) {
    const people = await db
      .select({ id: s.persons.id })
      .from(s.persons)
      .where(inArray(s.persons.householdId, part))
    for (const ids of chunks(people.map((p) => p.id))) {
      await db.batch([
        db
          .update(s.personLinks)
          .set({ deletedAt: now })
          .where(and(inArray(s.personLinks.ghostPersonId, ids), isNull(s.personLinks.deletedAt))),
        db
          .update(s.persons)
          .set({ deletedAt: now })
          .where(and(inArray(s.persons.id, ids), isNull(s.persons.deletedAt))),
      ])
    }
    await db.batch([
      // Recipes that are public stay (readable, searchable, saveable); their author's profile is gone, so they
      // show as anonymous.
      db
        .update(s.recipes)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(s.recipes.householdId, part),
            isNull(s.recipes.deletedAt),
            notInArray(
              s.recipes.id,
              db
                .select({ id: s.publicRecipes.recipeId })
                .from(s.publicRecipes)
                .where(isNull(s.publicRecipes.deletedAt)),
            ),
          ),
        ),
      db
        .update(s.collections)
        .set({ deletedAt: now })
        .where(and(inArray(s.collections.householdId, part), isNull(s.collections.deletedAt))),
      db
        .update(s.householdInvites)
        .set({ revokedAt: now })
        .where(
          and(inArray(s.householdInvites.householdId, part), isNull(s.householdInvites.revokedAt)),
        ),
      db
        .update(s.householdMembers)
        .set({ deletedAt: now })
        .where(
          and(inArray(s.householdMembers.householdId, part), isNull(s.householdMembers.deletedAt)),
        ),
      db
        .update(s.households)
        .set({ deletedAt: now })
        .where(and(inArray(s.households.id, part), isNull(s.households.deletedAt))),
    ])
  }
}
