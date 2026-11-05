import {
  ageOn,
  birthDateForAge,
  mergePrivateLayer,
  type Constraint,
  type Person,
} from '@bishul/core'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  chunks,
  forbidden,
  inChunks,
  insertMany,
  invalid,
  notFound,
  type Actor,
  type Db,
} from './ctx'
import { householdToday } from './households'
import {
  constraintToCore,
  isKnownRule,
  parseActiveWhen,
  ruleToCore,
  validateConstraintTag,
} from './mappers'

type PersonRow = typeof s.persons.$inferSelect
type HouseholdRow = typeof s.households.$inferSelect

// ---------------------------------------------------------------------------------------------------------------
// Access

export interface PersonAccess {
  person: PersonRow
  household: HouseholdRow
  /** `own`: a Person in the actor's household. `ghost`: a contact in a household the actor created. */
  relation: 'own' | 'ghost'
}

export async function loadAccessiblePersons(
  db: Db,
  actor: Actor,
  personIds: string[],
): Promise<Map<string, PersonAccess>> {
  const persons = await inChunks(personIds, (part) =>
    db
      .select()
      .from(s.persons)
      .where(and(inArray(s.persons.id, part), isNull(s.persons.deletedAt))),
  )
  const hids = [...new Set(persons.map((p) => p.householdId))]
  const households = await inChunks(hids, (part) =>
    db
      .select()
      .from(s.households)
      .where(and(inArray(s.households.id, part), isNull(s.households.deletedAt))),
  )
  const hmap = new Map(households.map((h) => [h.id, h]))
  const out = new Map<string, PersonAccess>()
  for (const p of persons) {
    const h = hmap.get(p.householdId)
    if (!h) continue
    if (h.id === actor.householdId) out.set(p.id, { person: p, household: h, relation: 'own' })
    else if (h.isGhost && h.ghostOfHouseholdId === actor.householdId)
      out.set(p.id, { person: p, household: h, relation: 'ghost' })
  }
  return out
}

export async function requirePerson(db: Db, actor: Actor, personId: string): Promise<PersonAccess> {
  const found = (await loadAccessiblePersons(db, actor, [personId])).get(personId)
  if (!found) throw notFound('Person')
  return found
}

/** The layer a write about this person lands in: null for the household's own people, else the host's layer. */
export const layerFor = (actor: Actor, access: PersonAccess): string | null =>
  access.relation === 'own' ? null : actor.householdId

// ---------------------------------------------------------------------------------------------------------------
// Effective people for planning: the constraints that apply to someone, seen by this household.

export interface EffectivePerson {
  person: Person
  access: PersonAccess
  link: typeof s.personLinks.$inferSelect | null
}

/** Core Persons for planning: the person's own constraints (through a live link, for a contact) plus this host's layer. */
export async function loadEffectivePeople(
  db: Db,
  actor: Actor,
  personIds: string[],
  /** Ages are worked out on this day (a meal's date); default is today in the household's time zone. */
  asOf?: string,
): Promise<EffectivePerson[]> {
  const day = asOf ?? (await householdToday(db, actor.householdId))
  const access = await loadAccessiblePersons(db, actor, personIds)
  const ids = [...access.keys()]
  const links = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.personLinks)
      .where(and(inArray(s.personLinks.ghostPersonId, part), isNull(s.personLinks.deletedAt))),
  )
  const linkOf = new Map(links.map((l) => [l.ghostPersonId, l]))
  const sourceIds = ids.map((id) => linkOf.get(id)?.realPersonId ?? id)
  const allIds = [...new Set([...ids, ...sourceIds])]
  const cons = await inChunks(allIds, (part) =>
    db
      .select()
      .from(s.constraints)
      .where(and(inArray(s.constraints.personId, part), isNull(s.constraints.deletedAt))),
  )
  const rules = await inChunks(allIds, (part) =>
    db
      .select()
      .from(s.personRules)
      .where(and(inArray(s.personRules.personId, part), isNull(s.personRules.deletedAt))),
  )
  const result: EffectivePerson[] = []
  for (const id of personIds) {
    const acc = access.get(id)
    if (!acc) continue
    const link = linkOf.get(id) ?? null
    const baseId = link?.realPersonId ?? id
    const base = [
      ...cons.filter((c) => c.personId === baseId && !c.layerHouseholdId).map(constraintToCore),
      ...rules
        .filter((r) => r.personId === baseId && !r.layerHouseholdId)
        .map((r) => ruleToCore(r.rule, 'self')),
    ]
    const additions: Constraint[] = [
      ...cons
        .filter((c) => c.personId === id && c.layerHouseholdId === actor.householdId)
        .map(constraintToCore),
      ...rules
        .filter((r) => r.personId === id && r.layerHouseholdId === actor.householdId)
        .map((r) => ruleToCore(r.rule)),
    ]
    // Own people with no layer: their rows are already in `base`.
    const age = acc.person.birthDate ? ageOn(acc.person.birthDate, day) : null
    result.push({
      person: mergePrivateLayer(
        { id, name: acc.person.name, ...(age !== null && { age }), constraints: base },
        additions,
      ),
      access: acc,
      link,
    })
  }
  return result
}

export async function householdPersonIds(db: Db, householdId: string): Promise<string[]> {
  const rows = await db
    .select({ id: s.persons.id })
    .from(s.persons)
    .where(and(eq(s.persons.householdId, householdId), isNull(s.persons.deletedAt)))
    .orderBy(s.persons.createdAt)
  return rows.map((r) => r.id)
}

// ---------------------------------------------------------------------------------------------------------------
// Views

export interface ConstraintView {
  id: string
  tagType: string
  tag: string
  kind: string
  severity: string
  activeWhen: unknown
  note: string | null
  source: string
  /** `own`: entered on this person in your household; `private`: your layer on a contact; `profile`: their own, live. */
  layer: 'own' | 'private' | 'profile'
}

export async function loadPersonViews(db: Db, actor: Actor, personIds: string[]) {
  const today = await householdToday(db, actor.householdId)
  const access = await loadAccessiblePersons(db, actor, personIds)
  const ids = [...access.keys()]
  const links = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.personLinks)
      .where(and(inArray(s.personLinks.ghostPersonId, part), isNull(s.personLinks.deletedAt))),
  )
  const linkOf = new Map(links.map((l) => [l.ghostPersonId, l]))
  const allIds = [...new Set([...ids, ...links.map((l) => l.realPersonId)])]
  const cons = await inChunks(allIds, (part) =>
    db
      .select()
      .from(s.constraints)
      .where(and(inArray(s.constraints.personId, part), isNull(s.constraints.deletedAt))),
  )
  const rules = await inChunks(allIds, (part) =>
    db
      .select()
      .from(s.personRules)
      .where(and(inArray(s.personRules.personId, part), isNull(s.personRules.deletedAt))),
  )
  const notes = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.notes)
      .where(
        and(
          inArray(s.notes.aboutPersonId, part),
          eq(s.notes.authorHouseholdId, actor.householdId),
          isNull(s.notes.deletedAt),
        ),
      )
      .orderBy(desc(s.notes.createdAt)),
  )
  const reacts = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.reactions)
      .where(
        and(
          inArray(s.reactions.personId, part),
          eq(s.reactions.layerHouseholdId, actor.householdId),
          isNull(s.reactions.deletedAt),
        ),
      )
      .orderBy(desc(s.reactions.createdAt)),
  )
  const served = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.servedLog)
      .where(
        and(
          inArray(s.servedLog.personId, part),
          eq(s.servedLog.layerHouseholdId, actor.householdId),
          isNull(s.servedLog.deletedAt),
        ),
      )
      .orderBy(desc(s.servedLog.servedOn)),
  )
  const versionIds = [
    ...new Set([...reacts.map((r) => r.versionId), ...served.map((x) => x.versionId)]),
  ]
  const titles = await versionTitles(db, versionIds)
  const hids = [...new Set([...access.values()].map((a) => a.household.id))]
  void hids

  const views = new Map<string, ReturnType<typeof buildView>>()
  function buildView(id: string) {
    const acc = access.get(id)!
    const link = linkOf.get(id) ?? null
    const baseId = link?.realPersonId ?? id
    const conView = (c: (typeof cons)[number]): ConstraintView => ({
      id: c.id,
      tagType: c.tagType,
      tag: c.tag,
      kind: c.kind,
      severity: c.severity,
      activeWhen: c.activeWhen,
      note: c.note,
      source: c.source,
      layer: c.personId !== id ? 'profile' : c.layerHouseholdId ? 'private' : 'own',
    })
    const mine = cons.filter(
      (c) =>
        (c.personId === baseId && !c.layerHouseholdId) ||
        (c.personId === id && (!c.layerHouseholdId || c.layerHouseholdId === actor.householdId)),
    )
    const myRules = rules.filter(
      (r) =>
        (r.personId === baseId && !r.layerHouseholdId) ||
        (r.personId === id && (!r.layerHouseholdId || r.layerHouseholdId === actor.householdId)),
    )
    const rx = reacts.filter((r) => r.personId === id)
    const reactionView = (r: (typeof reacts)[number]) => ({
      id: r.id,
      versionId: r.versionId,
      title: titles.get(r.versionId) ?? 'Deleted recipe',
      note: r.note,
      at: r.createdAt,
    })
    return {
      id,
      name: acc.person.name,
      isChild: acc.person.isChild,
      birthDate: acc.person.birthDate,
      birthDateApprox: acc.person.birthDateApprox,
      age: acc.person.birthDate ? ageOn(acc.person.birthDate, today) : null,
      userId: acc.person.userId,
      householdId: acc.household.id,
      householdName: acc.household.name,
      relation: acc.relation,
      link: link
        ? { realPersonId: link.realPersonId, mode: link.mode, linkedAt: link.linkedAt }
        : null,
      constraints: mine.map(conView),
      rules: myRules.map((r) => ({
        id: r.id,
        rule: r.rule,
        layer:
          r.personId !== id
            ? ('profile' as const)
            : r.layerHouseholdId
              ? ('private' as const)
              : ('own' as const),
      })),
      notes: notes
        .filter((n) => n.aboutPersonId === id)
        .map((n) => ({ id: n.id, text: n.text, at: n.createdAt })),
      likes: rx.filter((r) => r.reaction === 'like').map(reactionView),
      dislikes: rx.filter((r) => r.reaction === 'dislike').map(reactionView),
      served: served
        .filter((x) => x.personId === id)
        .slice(0, 30)
        .map((x) => ({
          date: x.servedOn,
          versionId: x.versionId,
          title: titles.get(x.versionId) ?? 'Deleted recipe',
        })),
    }
  }
  for (const id of ids) views.set(id, buildView(id))
  return views
}

export type PersonView =
  ReturnType<typeof loadPersonViews> extends Promise<Map<string, infer V>> ? V : never

async function versionTitles(db: Db, versionIds: string[]): Promise<Map<string, string>> {
  const rows = await inChunks(versionIds, (part) =>
    db
      .select({ id: s.recipeVersions.id, title: s.recipeVersions.title, recipe: s.recipes.title })
      .from(s.recipeVersions)
      .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
      .where(inArray(s.recipeVersions.id, part)),
  )
  return new Map(
    rows.map((r) => [
      r.id,
      r.title && r.title !== r.recipe ? `${r.recipe} (${r.title})` : r.recipe,
    ]),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Reads

export async function getPeople(db: Db, actor: Actor) {
  const ownIds = await householdPersonIds(db, actor.householdId)
  const ghosts = await db
    .select()
    .from(s.households)
    .where(
      and(
        eq(s.households.ghostOfHouseholdId, actor.householdId),
        eq(s.households.isGhost, true),
        isNull(s.households.deletedAt),
      ),
    )
    .orderBy(s.households.name)
  const ghostPersons = await inChunks(
    ghosts.map((g) => g.id),
    (part) =>
      db
        .select()
        .from(s.persons)
        .where(and(inArray(s.persons.householdId, part), isNull(s.persons.deletedAt)))
        .orderBy(s.persons.createdAt),
  )
  const views = await loadPersonViews(db, actor, [...ownIds, ...ghostPersons.map((p) => p.id)])
  const [own] = await db.select().from(s.households).where(eq(s.households.id, actor.householdId))
  return {
    household: {
      id: own.id,
      name: own.name,
      people: ownIds.map((id) => views.get(id)!).filter(Boolean),
    },
    contacts: ghosts.map((g) => ({
      id: g.id,
      name: g.name,
      people: ghostPersons
        .filter((p) => p.householdId === g.id)
        .map((p) => views.get(p.id)!)
        .filter(Boolean),
    })),
  }
}

export async function getPerson(db: Db, actor: Actor, personId: string) {
  const acc = await requirePerson(db, actor, personId)
  const views = await loadPersonViews(db, actor, [personId])
  return views.get(personId)!
    ? {
        person: views.get(personId)!,
        household: {
          id: acc.household.id,
          name: acc.household.name,
          isContact: acc.relation === 'ghost',
        },
      }
    : (() => {
        throw notFound('Person')
      })()
}

// ---------------------------------------------------------------------------------------------------------------
// Writes

export interface SavePersonInput {
  id?: string
  name?: string
  isChild?: boolean
  /** `YYYY-MM-DD`; the person then ages automatically. null clears it. */
  birthDate?: string | null
  /** A stated age ("he's 5") when the birthday isn't known: stored as an estimated birth date. Ignored if birthDate is given. */
  age?: number | null
  /** Put a new person in this contact household (one you created). Omit for your own household. */
  contactHouseholdId?: string
  /** Create a new contact household with this name (a ghost) and put the person in it. */
  newContactHousehold?: string
  /** Rename the contact household this person is in. */
  renameHousehold?: string
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))

/** The stored birth fields for what the caller gave, or null when they said nothing about it. */
async function birthPatch(db: Db, actor: Actor, input: SavePersonInput) {
  const today = await householdToday(db, actor.householdId)
  if (input.birthDate !== undefined) {
    if (input.birthDate === null) return { birthDate: null, birthDateApprox: false }
    if (!isDate(input.birthDate)) throw invalid('birthDate must be YYYY-MM-DD')
    if (input.birthDate > today) throw invalid('birthDate cannot be in the future')
    return { birthDate: input.birthDate, birthDateApprox: false }
  }
  if (input.age !== undefined) {
    if (input.age === null) return { birthDate: null, birthDateApprox: false }
    if (!Number.isInteger(input.age) || input.age < 0 || input.age > 120)
      throw invalid('age must be a whole number from 0 to 120')
    return { birthDate: birthDateForAge(input.age, today), birthDateApprox: true }
  }
  return null
}

export async function savePerson(db: Db, actor: Actor, input: SavePersonInput) {
  const today = await householdToday(db, actor.householdId)
  const birth = await birthPatch(db, actor, input)
  if (input.id) {
    const acc = await requirePerson(db, actor, input.id)
    const patch: Partial<typeof s.persons.$inferInsert> = {}
    if (input.name) patch.name = input.name
    if (input.isChild !== undefined) patch.isChild = input.isChild
    if (birth) Object.assign(patch, birth)
    if (Object.keys(patch).length)
      await db.update(s.persons).set(patch).where(eq(s.persons.id, input.id))
    if (input.renameHousehold && acc.relation === 'ghost')
      await db
        .update(s.households)
        .set({ name: input.renameHousehold })
        .where(eq(s.households.id, acc.household.id))
    return (await getPerson(db, actor, input.id)).person
  }
  if (!input.name) throw invalid('A new person needs a name')
  let householdId = actor.householdId
  if (input.newContactHousehold) {
    const [g] = await db
      .insert(s.households)
      .values({
        ownerUserId: actor.userId,
        name: input.newContactHousehold,
        isGhost: true,
        ghostOfHouseholdId: actor.householdId,
      })
      .returning({ id: s.households.id })
    householdId = g.id
  } else if (input.contactHouseholdId) {
    const [g] = await db
      .select()
      .from(s.households)
      .where(and(eq(s.households.id, input.contactHouseholdId), isNull(s.households.deletedAt)))
    if (!g || (g.id !== actor.householdId && g.ghostOfHouseholdId !== actor.householdId))
      throw notFound('Contact household')
    householdId = g.id
  }
  const [p] = await db
    .insert(s.persons)
    .values({
      householdId,
      name: input.name,
      isChild:
        input.isChild ?? (birth?.birthDate ? (ageOn(birth.birthDate, today) ?? 99) < 18 : false),
      ...birth,
    })
    .returning({ id: s.persons.id })
  return (await getPerson(db, actor, p.id)).person
}

export async function deletePerson(db: Db, actor: Actor, personId: string) {
  const acc = await requirePerson(db, actor, personId)
  if (acc.person.userId)
    throw forbidden('A signed-in member cannot be deleted; use leave household.')
  await db.update(s.persons).set({ deletedAt: Date.now() }).where(eq(s.persons.id, personId))
  return { deleted: true }
}

export async function deleteContactHousehold(db: Db, actor: Actor, householdId: string) {
  const [g] = await db.select().from(s.households).where(eq(s.households.id, householdId))
  if (!g || !g.isGhost || g.ghostOfHouseholdId !== actor.householdId) throw notFound('Contact')
  await db.batch([
    db
      .update(s.persons)
      .set({ deletedAt: Date.now() })
      .where(eq(s.persons.householdId, householdId)),
    db.update(s.households).set({ deletedAt: Date.now() }).where(eq(s.households.id, householdId)),
  ])
  return { deleted: true }
}

export interface ConstraintInput {
  tagType: 'allergen' | 'ingredient' | 'diet' | 'kashrut_dish' | 'kashrut_sourcing'
  tag: string
  kind?: 'medical' | 'religious' | 'preference'
  severity?: 'strict' | 'flexible'
  activeWhen?: unknown
  note?: string
  source?: 'self' | 'host' | 'ai'
}

function defaultKind(c: ConstraintInput): 'medical' | 'religious' | 'preference' {
  if (c.kind) return c.kind
  if (c.tagType === 'allergen') return 'medical'
  if (c.tagType === 'ingredient') return 'preference'
  if (c.tagType === 'diet') return 'preference'
  return 'religious'
}

export interface SetConstraintsInput {
  personId: string
  /** Replace everything you have entered on this person with these. */
  set?: ConstraintInput[]
  add?: ConstraintInput[]
  removeIds?: string[]
  /** Replace the opt-in rules (no_fish_dairy, no_fish_meat, no_parve_from_dairy_at_meat, ...). */
  rules?: string[]
}

export async function setConstraints(db: Db, actor: Actor, input: SetConstraintsInput) {
  const acc = await requirePerson(db, actor, input.personId)
  const layer = layerFor(actor, acc)
  const mine = (t: typeof s.constraints | typeof s.personRules) =>
    layer ? eq(t.layerHouseholdId, layer) : isNull(t.layerHouseholdId)
  const defaultSource: ConstraintInput['source'] =
    acc.person.userId && acc.person.userId === actor.userId ? 'self' : 'host'
  const now = Date.now()

  const build = (c: ConstraintInput): typeof s.constraints.$inferInsert => {
    const tag = validateConstraintTag(c.tagType, c.tag)
    return {
      personId: input.personId,
      tagType: c.tagType,
      tag,
      kind: defaultKind(c),
      severity: c.severity ?? 'strict',
      activeWhen: parseActiveWhen(c.activeWhen),
      note: c.note ?? null,
      source: c.source ?? defaultSource,
      layerHouseholdId: layer,
    }
  }
  const stmts: unknown[] = []
  if (input.set) {
    stmts.push(
      db
        .update(s.constraints)
        .set({ deletedAt: now })
        .where(
          and(
            eq(s.constraints.personId, input.personId),
            mine(s.constraints),
            isNull(s.constraints.deletedAt),
          ),
        ),
    )
    for (const c of input.set) stmts.push(db.insert(s.constraints).values(build(c)))
  }
  if (input.removeIds?.length)
    stmts.push(
      db
        .update(s.constraints)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(s.constraints.id, input.removeIds),
            eq(s.constraints.personId, input.personId),
            mine(s.constraints),
          ),
        ),
    )
  for (const c of input.add ?? []) stmts.push(db.insert(s.constraints).values(build(c)))
  if (input.rules) {
    for (const r of input.rules) if (!isKnownRule(r)) throw invalid(`Unknown rule "${r}"`)
    stmts.push(
      db
        .update(s.personRules)
        .set({ deletedAt: now })
        .where(
          and(
            eq(s.personRules.personId, input.personId),
            mine(s.personRules),
            isNull(s.personRules.deletedAt),
          ),
        ),
    )
    for (const r of new Set(input.rules))
      stmts.push(
        db
          .insert(s.personRules)
          .values({ personId: input.personId, rule: r, layerHouseholdId: layer }),
      )
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50) as never)
  return (await getPerson(db, actor, input.personId)).person
}

export async function addNote(db: Db, actor: Actor, personId: string, text: string) {
  await requirePerson(db, actor, personId)
  const [n] = await db
    .insert(s.notes)
    .values({ authorHouseholdId: actor.householdId, aboutPersonId: personId, text })
    .returning()
  return { id: n.id, text: n.text, at: n.createdAt }
}

export async function deleteNote(db: Db, actor: Actor, noteId: string) {
  const res = await db
    .update(s.notes)
    .set({ deletedAt: Date.now() })
    .where(and(eq(s.notes.id, noteId), eq(s.notes.authorHouseholdId, actor.householdId)))
    .returning({ id: s.notes.id })
  if (!res.length) throw notFound('Note')
  return { deleted: true }
}

export async function recordReaction(
  db: Db,
  actor: Actor,
  input: { personId: string; versionId: string; reaction: 'like' | 'dislike'; note?: string },
) {
  await requirePerson(db, actor, input.personId)
  const [v] = await db
    .select({ id: s.recipeVersions.id })
    .from(s.recipeVersions)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .where(
      and(
        eq(s.recipeVersions.id, input.versionId),
        eq(s.recipes.householdId, actor.householdId),
        isNull(s.recipeVersions.deletedAt),
      ),
    )
  if (!v) throw notFound('Recipe version')
  // One standing reaction per person and version from this household: a new one replaces the old.
  await db
    .update(s.reactions)
    .set({ deletedAt: Date.now() })
    .where(
      and(
        eq(s.reactions.personId, input.personId),
        eq(s.reactions.versionId, input.versionId),
        eq(s.reactions.layerHouseholdId, actor.householdId),
        isNull(s.reactions.deletedAt),
      ),
    )
  const [r] = await db
    .insert(s.reactions)
    .values({
      personId: input.personId,
      versionId: input.versionId,
      reaction: input.reaction,
      note: input.note ?? null,
      recordedByUserId: actor.userId,
      layerHouseholdId: actor.householdId,
    })
    .returning()
  return {
    id: r.id,
    personId: r.personId,
    versionId: r.versionId,
    reaction: r.reaction,
    note: r.note,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Linking a ghost to a real person (BRIEF §3). Found through a profile share link: nothing is discoverable.

export async function linkContact(
  db: Db,
  actor: Actor,
  input: { ghostPersonId: string; profileToken: string; mode: 'merge' | 'overwrite' },
) {
  const acc = await requirePerson(db, actor, input.ghostPersonId)
  if (acc.relation !== 'ghost')
    throw invalid('Only a contact can be linked to someone else’s profile')
  const [link] = await db
    .select()
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.token, input.profileToken), eq(s.shareLinks.kind, 'profile')))
  if (!link || link.revokedAt) throw notFound('Profile link')
  const [real] = await db
    .select()
    .from(s.persons)
    .where(and(eq(s.persons.id, link.targetId), isNull(s.persons.deletedAt)))
  if (!real) throw notFound('Profile')
  if (real.householdId === actor.householdId)
    throw invalid('That profile is already in your household')
  const stmts: unknown[] = [
    db
      .insert(s.personLinks)
      .values({
        ghostPersonId: acc.person.id,
        realPersonId: real.id,
        mode: input.mode,
        linkedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: s.personLinks.ghostPersonId,
        set: { realPersonId: real.id, mode: input.mode, linkedAt: Date.now(), deletedAt: null },
      }),
  ]
  if (input.mode === 'overwrite') {
    // Replace what you entered with theirs: your constraints and rules on this contact are dropped; notes, likes
    // and serving history stay.
    stmts.push(
      db
        .update(s.constraints)
        .set({ deletedAt: Date.now() })
        .where(
          and(
            eq(s.constraints.personId, acc.person.id),
            eq(s.constraints.layerHouseholdId, actor.householdId),
          ),
        ),
      db
        .update(s.personRules)
        .set({ deletedAt: Date.now() })
        .where(
          and(
            eq(s.personRules.personId, acc.person.id),
            eq(s.personRules.layerHouseholdId, actor.householdId),
          ),
        ),
      db.update(s.persons).set({ name: real.name }).where(eq(s.persons.id, acc.person.id)),
    )
  }
  await db.batch(stmts as never)
  return (await getPerson(db, actor, acc.person.id)).person
}

export async function unlinkContact(db: Db, actor: Actor, ghostPersonId: string) {
  const acc = await requirePerson(db, actor, ghostPersonId)
  await db
    .update(s.personLinks)
    .set({ deletedAt: Date.now() })
    .where(eq(s.personLinks.ghostPersonId, acc.person.id))
  return (await getPerson(db, actor, ghostPersonId)).person
}

/**
 * Erases a deleted user's profile (BRIEF §3). Everything they entered about themselves goes: the links that let
 * hosts see it (each linked contact goes back to being a plain ghost), their self-entered constraints and rules, the
 * snapshots of their shared profile links, and their own Person rows (renamed, then retired). A host's private layer
 * (notes, constraints they entered, likes, serving history) stays. Safe to run again.
 */
export async function eraseUserProfile(db: Db, userId: string) {
  const mine = await db.select().from(s.persons).where(eq(s.persons.userId, userId))
  const now = Date.now()
  for (const part of chunks(mine.map((p) => p.id))) {
    await db.batch([
      db
        .update(s.personLinks)
        .set({ deletedAt: now })
        .where(and(inArray(s.personLinks.realPersonId, part), isNull(s.personLinks.deletedAt))),
      // Their own layer only; a host's layer has `layer_household_id` set and stays.
      db
        .update(s.constraints)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(s.constraints.personId, part),
            isNull(s.constraints.layerHouseholdId),
            isNull(s.constraints.deletedAt),
          ),
        ),
      db
        .update(s.personRules)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(s.personRules.personId, part),
            isNull(s.personRules.layerHouseholdId),
            isNull(s.personRules.deletedAt),
          ),
        ),
      // A profile link holds a snapshot of the profile: revoke it and drop the copy.
      db
        .update(s.shareLinks)
        .set({ revokedAt: now, snapshot: {} })
        .where(and(eq(s.shareLinks.kind, 'profile'), inArray(s.shareLinks.targetId, part))),
      db
        .update(s.mealAttendees)
        .set({ deletedAt: now })
        .where(and(inArray(s.mealAttendees.personId, part), isNull(s.mealAttendees.deletedAt))),
      db
        .update(s.persons)
        .set({ name: 'Former member', deletedAt: now })
        .where(inArray(s.persons.id, part)),
    ])
  }
}
