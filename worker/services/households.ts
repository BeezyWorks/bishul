import { todayIn } from '@beitecha/engine'
import { ageOn, type HouseholdLocation as CoreLocation } from '@tavshil/core'
import { and, eq, isNull } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  forbidden,
  invalid,
  notFound,
  randomToken,
  conflict,
  type Actor,
  type Db,
  type Via,
} from './ctx'

/** Where a household is until it says otherwise. Reported as `locationSet: false`. */
export const DEFAULT_LOCATION: CoreLocation = {
  lat: 40.7128,
  lng: -74.006,
  timeZone: 'America/New_York',
  israel: false,
}

export interface UserIdentity {
  id: string
  name?: string | null
}

/**
 * The household a user acts in. The first request for a user with no household creates a household of one with
 * their own Person (BRIEF §3).
 */
export async function ensureActor(db: Db, user: UserIdentity, via: Via): Promise<Actor> {
  const rows = await db
    .select({ householdId: s.householdMembers.householdId })
    .from(s.householdMembers)
    .innerJoin(s.households, eq(s.households.id, s.householdMembers.householdId))
    .where(
      and(
        eq(s.householdMembers.userId, user.id),
        isNull(s.householdMembers.deletedAt),
        isNull(s.households.deletedAt),
        eq(s.households.isGhost, false),
      ),
    )
    .orderBy(s.householdMembers.createdAt)
    .limit(1)
  if (rows[0]) return { userId: user.id, householdId: rows[0].householdId, via }
  const householdId = await createHouseholdOfOne(db, user)
  return { userId: user.id, householdId, via }
}

async function createHouseholdOfOne(db: Db, user: UserIdentity): Promise<string> {
  const name = user.name?.trim() || 'Me'
  const [h] = await db
    .insert(s.households)
    .values({ ownerUserId: user.id, name: `${name}'s household` })
    .returning({ id: s.households.id })
  await db.insert(s.householdMembers).values({ householdId: h.id, userId: user.id, role: 'owner' })
  await db.insert(s.persons).values({ householdId: h.id, userId: user.id, name })
  return h.id
}

export async function loadHousehold(db: Db, householdId: string) {
  const [h] = await db
    .select()
    .from(s.households)
    .where(and(eq(s.households.id, householdId), isNull(s.households.deletedAt)))
  if (!h) throw notFound('Household')
  return h
}

export async function householdLocation(db: Db, householdId: string): Promise<CoreLocation> {
  const h = await loadHousehold(db, householdId)
  return (h.location as CoreLocation | null) ?? DEFAULT_LOCATION
}

/** Today's date in the household's time zone (never the viewer's clock). */
export async function householdToday(db: Db, householdId: string): Promise<string> {
  return todayIn((await householdLocation(db, householdId)).timeZone)
}

// ---------------------------------------------------------------------------------------------------------------

export async function getHousehold(db: Db, actor: Actor) {
  const h = await loadHousehold(db, actor.householdId)
  const members = await db
    .select()
    .from(s.householdMembers)
    .where(and(eq(s.householdMembers.householdId, h.id), isNull(s.householdMembers.deletedAt)))
  const people = await db
    .select()
    .from(s.persons)
    .where(and(eq(s.persons.householdId, h.id), isNull(s.persons.deletedAt)))
  const invites = await db
    .select()
    .from(s.householdInvites)
    .where(
      and(
        eq(s.householdInvites.householdId, h.id),
        isNull(s.householdInvites.revokedAt),
        isNull(s.householdInvites.acceptedAt),
        isNull(s.householdInvites.deletedAt),
      ),
    )
  const loc = (h.location as CoreLocation | null) ?? null
  return {
    id: h.id,
    name: h.name,
    ownerUserId: h.ownerUserId,
    isOwner: h.ownerUserId === actor.userId,
    location: loc ?? DEFAULT_LOCATION,
    locationSet: !!loc,
    today: todayIn((loc ?? DEFAULT_LOCATION).timeZone),
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      personId: people.find((p) => p.userId === m.userId)?.id ?? null,
      isYou: m.userId === actor.userId,
    })),
    persons: people.map((p) => ({
      id: p.id,
      name: p.name,
      isChild: p.isChild,
      birthDate: p.birthDate,
      spicy: p.spicy,
      age: p.birthDate ? ageOn(p.birthDate, todayIn((loc ?? DEFAULT_LOCATION).timeZone)) : null,
      userId: p.userId,
    })),
    pendingInvites: invites.map((i) => ({
      id: i.id,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  }
}

export async function updateHousehold(
  db: Db,
  actor: Actor,
  input: { name?: string; location?: s.HouseholdLocation },
) {
  const patch: Partial<typeof s.households.$inferInsert> = {}
  if (input.name) patch.name = input.name
  if (input.location) {
    try {
      todayIn(input.location.timeZone)
    } catch {
      throw invalid(`Unknown time zone "${input.location.timeZone}"`)
    }
    patch.location = input.location
  }
  if (Object.keys(patch).length)
    await db.update(s.households).set(patch).where(eq(s.households.id, actor.householdId))
  return getHousehold(db, actor)
}

// ---------------------------------------------------------------------------------------------------------------
// Invites: a link anyone signed in can open to join (BRIEF §3).

const INVITE_DAYS = 14

export async function createInvite(db: Db, actor: Actor, publicUrl: string) {
  const token = randomToken(24)
  const expiresAt = Date.now() + INVITE_DAYS * 86_400_000
  const [row] = await db
    .insert(s.householdInvites)
    .values({ householdId: actor.householdId, token, createdBy: actor.userId, expiresAt })
    .returning()
  return {
    id: row.id,
    token,
    url: `${publicUrl.replace(/\/$/, '')}/join/${token}`,
    expiresAt,
  }
}

export async function revokeInvite(db: Db, actor: Actor, inviteId: string) {
  const res = await db
    .update(s.householdInvites)
    .set({ revokedAt: Date.now() })
    .where(
      and(
        eq(s.householdInvites.id, inviteId),
        eq(s.householdInvites.householdId, actor.householdId),
      ),
    )
    .returning({ id: s.householdInvites.id })
  if (!res.length) throw notFound('Invite')
  return { revoked: true }
}

/** What an invite link opens: the household's name, before the person decides to join. */
export async function previewInvite(db: Db, token: string) {
  const [inv] = await db
    .select()
    .from(s.householdInvites)
    .where(eq(s.householdInvites.token, token))
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < Date.now())
    throw notFound('Invite')
  const h = await loadHousehold(db, inv.householdId)
  return { householdName: h.name, expiresAt: inv.expiresAt }
}

/**
 * Joins the invite's household. The joiner's household of one is retired: their person, recipes and contacts move
 * with them (pantry, equipment and meals stay behind in the retired household).
 */
export async function acceptInvite(db: Db, user: UserIdentity, token: string) {
  const [inv] = await db
    .select()
    .from(s.householdInvites)
    .where(eq(s.householdInvites.token, token))
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < Date.now())
    throw notFound('Invite')
  const actor = await ensureActor(db, user, 'web')
  if (actor.householdId === inv.householdId) return { householdId: inv.householdId, joined: false }
  const current = await db
    .select()
    .from(s.householdMembers)
    .where(
      and(
        eq(s.householdMembers.householdId, actor.householdId),
        isNull(s.householdMembers.deletedAt),
      ),
    )
  if (current.length > 1) throw conflict('Leave your current household before joining another one.')

  const target = inv.householdId
  const old = actor.householdId
  await db.batch([
    db
      .update(s.persons)
      .set({ householdId: target })
      .where(and(eq(s.persons.householdId, old), eq(s.persons.userId, user.id))),
    db
      .update(s.recipes)
      .set({ householdId: target })
      .where(and(eq(s.recipes.householdId, old), eq(s.recipes.ownerUserId, user.id))),
    db
      .update(s.households)
      .set({ ghostOfHouseholdId: target })
      .where(eq(s.households.ghostOfHouseholdId, old)),
    db
      .update(s.householdMembers)
      .set({ deletedAt: Date.now() })
      .where(and(eq(s.householdMembers.householdId, old), eq(s.householdMembers.userId, user.id))),
    db.insert(s.householdMembers).values({ householdId: target, userId: user.id, role: 'member' }),
    db.update(s.households).set({ deletedAt: Date.now() }).where(eq(s.households.id, old)),
    db
      .update(s.householdInvites)
      .set({ acceptedBy: user.id, acceptedAt: Date.now() })
      .where(eq(s.householdInvites.id, inv.id)),
  ])
  return { householdId: target, joined: true }
}

/** Leaving: a new household of one, taking the leaver's own recipes and person. Owners must hand over first. */
export async function leaveHousehold(db: Db, user: UserIdentity, actor: Actor) {
  const h = await loadHousehold(db, actor.householdId)
  const members = await db
    .select()
    .from(s.householdMembers)
    .where(and(eq(s.householdMembers.householdId, h.id), isNull(s.householdMembers.deletedAt)))
  if (members.length <= 1) throw conflict('You are the only member of this household.')
  if (h.ownerUserId === actor.userId)
    throw forbidden('Transfer ownership to another member before leaving.')
  const newId = await createHouseholdOfOne(db, user)
  // The new household's fresh person is replaced by the leaver's existing one.
  await db
    .delete(s.persons)
    .where(and(eq(s.persons.householdId, newId), eq(s.persons.userId, user.id)))
  await db.batch([
    db
      .update(s.persons)
      .set({ householdId: newId })
      .where(and(eq(s.persons.householdId, h.id), eq(s.persons.userId, user.id))),
    db
      .update(s.recipes)
      .set({ householdId: newId })
      .where(and(eq(s.recipes.householdId, h.id), eq(s.recipes.ownerUserId, user.id))),
    db
      .update(s.householdMembers)
      .set({ deletedAt: Date.now() })
      .where(and(eq(s.householdMembers.householdId, h.id), eq(s.householdMembers.userId, user.id))),
  ])
  return { householdId: newId }
}

export async function transferOwnership(db: Db, actor: Actor, toUserId: string) {
  const h = await loadHousehold(db, actor.householdId)
  if (h.ownerUserId !== actor.userId) throw forbidden('Only the household owner can do this.')
  const [m] = await db
    .select()
    .from(s.householdMembers)
    .where(
      and(
        eq(s.householdMembers.householdId, h.id),
        eq(s.householdMembers.userId, toUserId),
        isNull(s.householdMembers.deletedAt),
      ),
    )
  if (!m) throw notFound('Member')
  await db.batch([
    db.update(s.households).set({ ownerUserId: toUserId }).where(eq(s.households.id, h.id)),
    db
      .update(s.householdMembers)
      .set({ role: 'member' })
      .where(
        and(eq(s.householdMembers.householdId, h.id), eq(s.householdMembers.userId, actor.userId)),
      ),
    db
      .update(s.householdMembers)
      .set({ role: 'owner' })
      .where(
        and(eq(s.householdMembers.householdId, h.id), eq(s.householdMembers.userId, toUserId)),
      ),
  ])
  return getHousehold(db, actor)
}
