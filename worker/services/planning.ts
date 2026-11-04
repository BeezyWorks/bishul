import { todayIn } from '@beitecha/engine'
import {
  allocatePantry,
  buildDiningBrief,
  buildNeeds,
  buildShoppingList,
  calendarDays,
  rankCandidates,
  suggestMenu,
  type CalendarDay,
  type CourseSlot,
  type DiningBrief,
  type DiningBriefInput,
  type DishVersion,
  type HouseholdLocation,
  type MealKind,
  type PlannedMealItem,
  type RankContext,
} from '@bishul/core'
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  batch,
  clock,
  conflict,
  inChunks,
  insertMany,
  invalid,
  isDate,
  notFound,
  parseTime,
  slugOf,
  unique,
  type Actor,
  type Db,
} from './ctx'
import { householdLocation } from './households'
import { broughtToDish, toDishVersion, versionKashrut, type LoadedVersion } from './mappers'
import {
  loadEffectivePeople,
  householdPersonIds,
  loadAccessiblePersons,
  loadPersonViews,
  type EffectivePerson,
} from './people'
import {
  corePantry,
  effectiveScale,
  itemsOfMeals,
  mealsInRange,
  nextChametzCutoff,
  planMeals,
  type MealItemRow,
  type MealRow,
} from './plans'
import { getPrefs } from './prefs'
import { loadAllVersions, loadVersions } from './recipes'

const MAX_RANGE_DAYS = 400

// ---------------------------------------------------------------------------------------------------------------
// Settling: once a meal's date has passed, its serving history is written and its pantry stock used (computed
// lazily on read, once per meal).

export async function settlePassedMeals(db: Db, householdId: string): Promise<void> {
  const loc = await householdLocation(db, householdId)
  const today = todayIn(loc.timeZone)
  const rows = await db
    .select()
    .from(s.meals)
    .where(
      and(
        eq(s.meals.householdId, householdId),
        eq(s.meals.status, 'accepted'),
        lt(s.meals.date, today),
        isNull(s.meals.settledAt),
        isNull(s.meals.deletedAt),
      ),
    )
    .orderBy(asc(s.meals.date))
    .limit(60)
  if (!rows.length) return
  const plan = await planMeals(db, householdId, rows)
  const attendees = await inChunks(rows.map((m) => m.id), (part) =>
    db
      .select()
      .from(s.mealAttendees)
      .where(and(inArray(s.mealAttendees.mealId, part), isNull(s.mealAttendees.deletedAt))),
  )
  let pantry = await corePantry(db, householdId)
  const cutoff = nextChametzCutoff(loc, rows[0].date)
  const now = Date.now()

  for (const meal of rows) {
    const people = attendees.filter((a) => a.mealId === meal.id).map((a) => a.personId)
    const versionIds = unique(
      (plan.items.get(meal.id) ?? []).map((i) => i.versionId).filter((x): x is string => !!x && plan.versions.has(x)),
    )
    const stmts: unknown[] = []
    for (const versionId of versionIds)
      for (const personId of people)
        stmts.push(
          db
            .insert(s.servedLog)
            .values({ personId, versionId, mealId: meal.id, servedOn: meal.date, layerHouseholdId: householdId })
            .onConflictDoNothing(),
        )
    const draws = allocatePantry(
      buildNeeds(plan.planned.filter((p) => p.mealId === meal.id)),
      pantry,
      cutoff,
    )
    const used = new Map<string, number>()
    for (const d of draws) used.set(d.pantryId, (used.get(d.pantryId) ?? 0) + d.itemAmount)
    for (const [pantryId, amount] of used)
      stmts.push(
        db
          .update(s.pantryItems)
          .set({ quantityMetric: sql`max(0, coalesce(${s.pantryItems.quantityMetric}, 0) - ${amount})` })
          .where(eq(s.pantryItems.id, pantryId)),
      )
    pantry = pantry.map((p) => (used.has(p.id) ? { ...p, amount: Math.max(0, p.amount - used.get(p.id)!) } : p))
    stmts.push(db.update(s.meals).set({ settledAt: now }).where(eq(s.meals.id, meal.id)))
    await batch(db, stmts)
  }
  await db
    .update(s.pantryItems)
    .set({ deletedAt: now })
    .where(
      and(
        eq(s.pantryItems.householdId, householdId),
        isNull(s.pantryItems.deletedAt),
        sql`${s.pantryItems.quantityMetric} IS NOT NULL AND ${s.pantryItems.quantityMetric} <= 0.000001`,
      ),
    )
}

// ---------------------------------------------------------------------------------------------------------------
// Occasions

const HOLIDAY_DIMENSIONS: [RegExp, string][] = [
  [/pesach|passover/i, 'pesach'],
  [/chanuk|hanuk/i, 'chanukah'],
  [/purim/i, 'purim'],
  [/shavuot/i, 'shavuot'],
  [/sukkot|simchat torah|shemini/i, 'sukkot'],
  [/rosh hashana/i, 'rosh_hashana'],
]

/** The occasion dimensions a meal is for (matched against recipes' `occasion fit`). */
export function occasionsFor(day: CalendarDay, time: number | null): string[] {
  const out: string[] = []
  const evening = (time ?? (day.candleLighting ?? 1080) + 90) >= 15 * 60
  if (day.isErevShabbat && evening) out.push('leil_shabbat')
  if (day.isShabbat && !evening) out.push('shabbat_day')
  if (day.isShabbat && evening && day.havdalah === undefined) out.push('leil_shabbat')
  if (day.isYomTov || (day.isErevYomTov && evening)) out.push('yom_tov')
  for (const h of day.jewishHolidays)
    for (const [re, dim] of HOLIDAY_DIMENSIONS) if (re.test(h)) out.push(dim)
  for (const h of day.civilHolidays) if (/thanksgiving/i.test(h)) out.push('thanksgiving')
  if (!day.noMelacha && !(day.isErevShabbat && evening)) out.push('weeknight')
  return unique(out)
}

// ---------------------------------------------------------------------------------------------------------------
// Meal loading

export async function requireMeal(db: Db, actor: Actor, mealId: string): Promise<MealRow> {
  const [m] = await db
    .select()
    .from(s.meals)
    .where(and(eq(s.meals.id, mealId), eq(s.meals.householdId, actor.householdId), isNull(s.meals.deletedAt)))
  if (!m) throw notFound('Meal')
  return m
}

export interface MealContext {
  loc: HouseholdLocation
  today: string
  meal: MealRow
  items: MealItemRow[]
  versions: Map<string, LoadedVersion>
  attendees: EffectivePerson[]
  host: EffectivePerson[]
  selected: DishVersion[]
  input: DiningBriefInput
  day: CalendarDay
  occasions: string[]
}

async function attendeeRows(db: Db, mealId: string) {
  return db
    .select()
    .from(s.mealAttendees)
    .where(and(eq(s.mealAttendees.mealId, mealId), isNull(s.mealAttendees.deletedAt)))
}

export async function buildContext(db: Db, actor: Actor, meal: MealRow): Promise<MealContext> {
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const items = (await itemsOfMeals(db, [meal.id])).get(meal.id)!
  const versions = await loadVersions(db, actor.householdId, items.map((i) => i.versionId).filter((x): x is string => !!x))
  const att = await attendeeRows(db, meal.id)
  const hostIds = await householdPersonIds(db, actor.householdId)
  const everyone = await loadEffectivePeople(db, actor, unique([...att.map((a) => a.personId), ...hostIds]))
  const byId = new Map(everyone.map((p) => [p.person.id, p]))
  const attendees = att.map((a) => byId.get(a.personId)).filter((x): x is EffectivePerson => !!x)
  const host = hostIds.map((id) => byId.get(id)).filter((x): x is EffectivePerson => !!x)
  const selected = items.flatMap((i): DishVersion[] => {
    if (i.versionId) {
      const v = versions.get(i.versionId)
      if (!v) return []
      const d = toDishVersion(v)
      return [{ ...d, ...(i.course && { course: i.course }) }]
    }
    return [broughtToDish(i)]
  })
  const input: DiningBriefInput = {
    location: loc,
    date: meal.date,
    ...(meal.time !== null && { time: meal.time }),
    ...(meal.kind && { mealKind: meal.kind as MealKind }),
    attendees: attendees.map((a) => a.person),
    hostPersons: host.map((h) => h.person),
    selected,
  }
  const day = calendarDays(meal.date, meal.date, loc)[0]
  return { loc, today, meal, items, versions, attendees, host, selected, input, day, occasions: occasionsFor(day, meal.time) }
}

// ---------------------------------------------------------------------------------------------------------------
// Views

function itemView(it: MealItemRow, versions: Map<string, LoadedVersion>) {
  const v = it.versionId ? versions.get(it.versionId) : undefined
  if (it.versionId && v) {
    return {
      id: it.id,
      position: it.position,
      type: 'dish' as const,
      course: it.course ?? v.version.course,
      versionId: v.version.id,
      recipeId: v.recipe.id,
      title: v.recipe.title,
      versionTitle: v.version.title,
      kashrut: versionKashrut(v),
      scale: effectiveScale(it, v),
      servings: it.servings ?? (v.version.servings ? Math.round(v.version.servings * effectiveScale(it, v)) : null),
      baseServings: v.version.servings,
      activeMinutes: v.version.activeMinutes,
      totalMinutes: v.version.totalMinutes,
      difficulty: v.version.difficulty,
      broughtBy: null,
      description: null,
    }
  }
  return {
    id: it.id,
    position: it.position,
    type: (it.versionId ? 'dish' : 'brought') as 'dish' | 'brought',
    course: it.course,
    versionId: it.versionId,
    recipeId: null as string | null,
    title: it.description ?? (it.versionId ? 'Deleted recipe' : 'Brought dish'),
    versionTitle: null as string | null,
    kashrut: it.kashrut,
    scale: it.scale,
    servings: it.servings,
    baseServings: null as number | null,
    activeMinutes: null as number | null,
    totalMinutes: null as number | null,
    difficulty: null as string | null,
    broughtBy: it.broughtBy,
    description: it.description,
  }
}

async function mealView(db: Db, actor: Actor, ctx: MealContext) {
  const { meal } = ctx
  const hostIds = ctx.host.map((h) => h.person.id)
  const attendeeIds = new Set(ctx.attendees.map((a) => a.person.id))
  const nameOf = (p: EffectivePerson) => ({
    personId: p.person.id,
    name: p.person.name,
    householdId: p.access.household.id,
    householdName: p.access.household.name,
    isGuest: p.access.relation === 'ghost' || p.access.household.id !== actor.householdId,
    isChild: p.access.person.isChild,
  })
  void hostIds
  return {
    id: meal.id,
    date: meal.date,
    name: meal.name,
    time: meal.time,
    timeText: clock(meal.time),
    kind: meal.kind,
    status: meal.status,
    acceptedAt: meal.acceptedAt,
    settled: !!meal.settledAt,
    attendees: ctx.attendees.map(nameOf),
    notComing: ctx.host.filter((h) => !attendeeIds.has(h.person.id)).map(nameOf),
    items: ctx.items.map((i) => itemView(i, ctx.versions)),
    occasions: ctx.occasions,
    calendar: dayLabel(ctx.day),
  }
}

function dayLabel(d: CalendarDay) {
  return {
    date: d.date,
    weekday: d.weekday,
    hebrew: d.hebrew.text,
    parasha: d.parasha ?? null,
    holidays: [...d.jewishHolidays, ...d.civilHolidays],
    isShabbat: d.isShabbat,
    isYomTov: d.isYomTov,
    isErevShabbat: d.isErevShabbat,
    noMelacha: d.noMelacha,
    candleLighting: d.candleLighting ?? null,
    candleLightingText: d.candleLighting !== undefined ? clock(d.candleLighting) : null,
    havdalah: d.havdalah ?? null,
  }
}

export type MealView = Awaited<ReturnType<typeof mealView>>

// ---------------------------------------------------------------------------------------------------------------
// The dining brief (core), enriched with the host's private layer

export async function briefOf(db: Db, actor: Actor, ctx: MealContext, candidates?: DishVersion[]) {
  const brief: DiningBrief = buildDiningBrief({ ...ctx.input, ...(candidates && { candidates }) })
  const ids = ctx.attendees.map((a) => a.person.id)
  const views = await loadPersonViews(db, actor, ids)
  const menuVersionIds = new Set(ctx.items.map((i) => i.versionId).filter(Boolean))
  const people = ids.map((id) => {
    const v = views.get(id)!
    return {
      personId: id,
      name: v.name,
      // The host's private layer about the guest. For the host's AI only: never repeat it to the guest.
      private: {
        notes: v.notes.map((n) => n.text),
        likes: v.likes.map((l) => l.title),
        dislikes: v.dislikes.map((l) => l.title),
        recentlyServed: v.served.slice(0, 8).map((x) => ({ date: x.date, title: x.title })),
        onThisMenu: {
          likes: v.likes.filter((l) => menuVersionIds.has(l.versionId)).map((l) => l.title),
          dislikes: v.dislikes.filter((l) => menuVersionIds.has(l.versionId)).map((l) => l.title),
        },
      },
    }
  })
  const aiDataInUse = brief.aiWarnings.length > 0
  return {
    ...brief,
    people,
    mealStatus: ctx.meal.status,
    hasAllergyConstraints: brief.activeConstraints.some((a) => a.constraint.tag.type === 'allergen'),
    safety: {
      aiFilledAllergyData: aiDataInUse,
      note: aiDataInUse
        ? 'Some allergy results rest on AI-filled ingredient data. Check labels for those ingredients.'
        : null,
    },
  }
}

export async function getDiningBrief(
  db: Db,
  actor: Actor,
  input:
    | { mealId: string }
    | {
        date: string
        personIds: string[]
        time?: string | number
        mealKind?: MealKind
        versionIds?: string[]
        candidateVersionIds?: string[]
      },
) {
  if ('mealId' in input) {
    const meal = await requireMeal(db, actor, input.mealId)
    const ctx = await buildContext(db, actor, meal)
    return briefOf(db, actor, ctx)
  }
  if (!isDate(input.date)) throw invalid('date must be YYYY-MM-DD')
  const loc = await householdLocation(db, actor.householdId)
  const hostIds = await householdPersonIds(db, actor.householdId)
  const everyone = await loadEffectivePeople(db, actor, unique([...input.personIds, ...hostIds]))
  const byId = new Map(everyone.map((p) => [p.person.id, p]))
  const attendees = input.personIds.map((id) => byId.get(id))
  if (attendees.some((a) => !a)) throw notFound('Person')
  const vids = unique([...(input.versionIds ?? []), ...(input.candidateVersionIds ?? [])])
  const versions = await loadVersions(db, actor.householdId, vids)
  const pick = (ids?: string[]) =>
    (ids ?? []).flatMap((id) => {
      const v = versions.get(id)
      return v ? [toDishVersion(v)] : []
    })
  const time = parseTime(input.time)
  const fake = {
    id: 'adhoc',
    householdId: actor.householdId,
    date: input.date,
    time,
    kind: input.mealKind ?? null,
    status: 'draft',
  } as MealRow
  const ctx: MealContext = {
    loc,
    today: todayIn(loc.timeZone),
    meal: fake,
    items: [],
    versions,
    attendees: attendees as EffectivePerson[],
    host: hostIds.map((id) => byId.get(id)!).filter(Boolean),
    selected: pick(input.versionIds),
    input: {
      location: loc,
      date: input.date,
      ...(time !== null && { time }),
      ...(input.mealKind && { mealKind: input.mealKind }),
      attendees: (attendees as EffectivePerson[]).map((a) => a.person),
      hostPersons: hostIds.map((id) => byId.get(id)!.person),
      selected: pick(input.versionIds),
    },
    day: calendarDays(input.date, input.date, loc)[0],
    occasions: [],
  }
  return briefOf(db, actor, ctx, pick(input.candidateVersionIds))
}

// ---------------------------------------------------------------------------------------------------------------
// Meals

export async function getMeal(db: Db, actor: Actor, mealId: string) {
  await settlePassedMeals(db, actor.householdId)
  const meal = await requireMeal(db, actor, mealId)
  const ctx = await buildContext(db, actor, meal)
  const brief = await briefOf(db, actor, ctx)
  return { meal: await mealView(db, actor, ctx), brief, review: await reviewOf(db, actor, ctx, brief) }
}

async function reviewOf(db: Db, actor: Actor, ctx: MealContext, brief: DiningBrief) {
  const planned = await planMeals(db, actor.householdId, [ctx.meal])
  const pantry = await corePantry(db, actor.householdId)
  const prefs = (await getPrefs(db, actor)).display
  const cutoff = nextChametzCutoff(ctx.loc, ctx.today)
  const lines = buildShoppingList(planned.planned, { pantry, chametzCutoff: cutoff, prefs })
  const dishes = ctx.items.filter((i) => i.versionId).map((i) => ctx.versions.get(i.versionId!))
  const next = (
    await db
      .select()
      .from(s.meals)
      .where(
        and(eq(s.meals.householdId, actor.householdId), gt(s.meals.date, ctx.meal.date), isNull(s.meals.deletedAt)),
      )
      .orderBy(asc(s.meals.date), asc(s.meals.time))
      .limit(1)
  )[0]
  return {
    handsOnMinutes: dishes.reduce((n, v) => n + (v?.version.activeMinutes ?? 0), 0),
    issues: brief.mealIssues.filter((i) => i.severity === 'error').map((i) => i.text),
    warnings: brief.mealIssues.filter((i) => i.severity === 'warning').map((i) => i.text),
    adjustments: brief.eatAround.map((e) => ({ dish: e.dishTitle, person: e.personName, text: e.text })),
    sourcing: brief.sourcingNotes.map((n) => n.text),
    shopping: lines.filter((l) => l.toBuy.length || l.unquantified).map((l) => l.toBuyDisplay),
    emptyMenu: ctx.items.length === 0,
    nextMeal: next ? { id: next.id, name: next.name, date: next.date } : null,
  }
}

export interface MealItemInput {
  /** A recipe version… */
  versionId?: string
  scale?: number
  servings?: number
  /** …or a dish someone is bringing. */
  brought?: { description: string; by: string; kashrut?: 'meat' | 'dairy' | 'parve'; course?: string }
  course?: string
}

export interface CreateMealInput {
  date: string
  name: string
  /** `18:30` or minutes since midnight. */
  time?: string | number | null
  kind?: MealKind | null
  /** Who is coming: the whole household by default. Include contacts' person ids to invite guests. */
  personIds?: string[]
  /** Everyone in your household except these. */
  excludePersonIds?: string[]
  items?: MealItemInput[]
}

async function nextPosition(db: Db, mealId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(max(${s.mealItems.position}), -1)` })
    .from(s.mealItems)
    .where(and(eq(s.mealItems.mealId, mealId), isNull(s.mealItems.deletedAt)))
  return (r?.n ?? -1) + 1
}

async function addItems(db: Db, actor: Actor, mealId: string, items: MealItemInput[]) {
  if (!items.length) return
  const vids = items.map((i) => i.versionId).filter((x): x is string => !!x)
  const versions = await loadVersions(db, actor.householdId, vids)
  let pos = await nextPosition(db, mealId)
  const rows: (typeof s.mealItems.$inferInsert)[] = []
  for (const it of items) {
    if (it.versionId) {
      const v = versions.get(it.versionId)
      if (!v) throw notFound('Recipe version')
      rows.push({
        mealId,
        position: pos++,
        course: it.course ?? v.version.course ?? null,
        versionId: v.version.id,
        scale: it.scale ?? (it.servings && v.version.servings ? it.servings / v.version.servings : 1),
        servings: it.servings ?? (v.version.servings ? Math.round(v.version.servings * (it.scale ?? 1)) : null),
      })
    } else if (it.brought) {
      rows.push({
        mealId,
        position: pos++,
        course: it.course ?? it.brought.course ?? null,
        broughtBy: it.brought.by,
        description: it.brought.description,
        kashrut: it.brought.kashrut ?? null,
      })
    } else throw invalid('Each item needs a versionId or a brought dish')
  }
  await insertMany(db, s.mealItems, rows)
}

async function setAttendees(db: Db, actor: Actor, mealId: string, personIds: string[]) {
  const ok = await loadAccessiblePersons(db, actor, personIds)
  for (const id of personIds) if (!ok.has(id)) throw notFound('Person')
  const existing = await attendeeRows(db, mealId)
  const have = new Map(existing.map((e) => [e.personId, e]))
  const want = new Set(personIds)
  const stmts: unknown[] = []
  for (const e of existing)
    if (!want.has(e.personId))
      stmts.push(db.update(s.mealAttendees).set({ deletedAt: Date.now() }).where(eq(s.mealAttendees.id, e.id)))
  for (const id of want) if (!have.has(id)) stmts.push(db.insert(s.mealAttendees).values({ mealId, personId: id }))
  await batch(db, stmts)
}

export async function createMeal(db: Db, actor: Actor, input: CreateMealInput) {
  if (!isDate(input.date)) throw invalid('date must be YYYY-MM-DD')
  if (!input.name.trim()) throw invalid('A meal needs a name')
  const time = parseTime(input.time)
  const [meal] = await db
    .insert(s.meals)
    .values({
      householdId: actor.householdId,
      date: input.date,
      name: input.name.trim(),
      time,
      kind: input.kind ?? null,
    })
    .returning()
  const hostIds = await householdPersonIds(db, actor.householdId)
  const exclude = new Set(input.excludePersonIds ?? [])
  const who = input.personIds
    ? unique([...hostIds.filter((h) => !exclude.has(h)), ...input.personIds])
    : hostIds.filter((h) => !exclude.has(h))
  await setAttendees(db, actor, meal.id, who)
  if (input.items?.length) await addItems(db, actor, meal.id, input.items)
  return getMeal(db, actor, meal.id)
}

export interface UpdateMealInput {
  name?: string
  date?: string
  time?: string | number | null
  kind?: MealKind | null
  /** Replace the guest list. */
  personIds?: string[]
  /** Add people (contacts) to the meal. */
  addPersonIds?: string[]
  /** Mark people as not coming. */
  removePersonIds?: string[]
  addItems?: MealItemInput[]
  removeItemIds?: string[]
  updateItems?: { id: string; course?: string; scale?: number; servings?: number; by?: string; description?: string; kashrut?: 'meat' | 'dairy' | 'parve' }[]
  /** Item ids in the order they should appear. */
  order?: string[]
}

export async function updateMeal(db: Db, actor: Actor, mealId: string, input: UpdateMealInput) {
  const meal = await requireMeal(db, actor, mealId)
  const content =
    input.personIds || input.addPersonIds || input.removePersonIds || input.addItems || input.removeItemIds || input.updateItems || input.order
  if (meal.settledAt && content) throw conflict('That meal has already happened; its menu is now history.')
  const patch: Partial<typeof s.meals.$inferInsert> = {}
  if (input.name) patch.name = input.name
  if (input.date) {
    if (!isDate(input.date)) throw invalid('date must be YYYY-MM-DD')
    patch.date = input.date
  }
  if (input.time !== undefined) patch.time = parseTime(input.time)
  if (input.kind !== undefined) patch.kind = input.kind
  let reopened = false
  if (content && meal.status === 'accepted') {
    patch.status = 'draft'
    patch.acceptedAt = null
    reopened = true
  }
  if (Object.keys(patch).length) await db.update(s.meals).set(patch).where(eq(s.meals.id, mealId))

  if (input.personIds) await setAttendees(db, actor, mealId, input.personIds)
  if (input.addPersonIds || input.removePersonIds) {
    const cur = (await attendeeRows(db, mealId)).map((a) => a.personId)
    const drop = new Set(input.removePersonIds ?? [])
    await setAttendees(db, actor, mealId, unique([...cur, ...(input.addPersonIds ?? [])]).filter((p) => !drop.has(p)))
  }
  if (input.removeItemIds?.length)
    await db
      .update(s.mealItems)
      .set({ deletedAt: Date.now() })
      .where(and(inArray(s.mealItems.id, input.removeItemIds), eq(s.mealItems.mealId, mealId)))
  for (const u of input.updateItems ?? []) {
    await db
      .update(s.mealItems)
      .set({
        ...(u.course !== undefined && { course: u.course }),
        ...(u.scale !== undefined && { scale: u.scale }),
        ...(u.servings !== undefined && { servings: u.servings }),
        ...(u.by !== undefined && { broughtBy: u.by }),
        ...(u.description !== undefined && { description: u.description }),
        ...(u.kashrut !== undefined && { kashrut: u.kashrut }),
      })
      .where(and(eq(s.mealItems.id, u.id), eq(s.mealItems.mealId, mealId)))
  }
  if (input.addItems?.length) await addItems(db, actor, mealId, input.addItems)
  if (input.order) {
    const stmts = input.order.map((id, i) =>
      db.update(s.mealItems).set({ position: i }).where(and(eq(s.mealItems.id, id), eq(s.mealItems.mealId, mealId))),
    )
    await batch(db, stmts)
  }
  const res = await getMeal(db, actor, mealId)
  return { ...res, reopened }
}

export async function deleteMeal(db: Db, actor: Actor, mealId: string) {
  await requireMeal(db, actor, mealId)
  await db.update(s.meals).set({ deletedAt: Date.now() }).where(eq(s.meals.id, mealId))
  return { deleted: true }
}

// ---------------------------------------------------------------------------------------------------------------
// Accepting (BRIEF §9)

export interface AcceptInput {
  mealIds?: string[]
  /** Accept every draft meal on this date, or in this range. */
  date?: string
  from?: string
  to?: string
  /** Accept despite problems the brief found (only when the host has said so). */
  force?: boolean
}

export async function acceptMeals(db: Db, actor: Actor, input: AcceptInput) {
  let meals: MealRow[]
  if (input.mealIds?.length) {
    meals = []
    for (const id of input.mealIds) meals.push(await requireMeal(db, actor, id))
  } else {
    const from = input.from ?? input.date
    const to = input.to ?? input.date
    if (!from || !to) throw invalid('Give mealIds, a date, or a from/to range')
    meals = await mealsInRange(db, actor.householdId, from, to, 'draft')
  }
  const accepted: { id: string; name: string; date: string }[] = []
  const blocked: { id: string; name: string; date: string; problems: string[] }[] = []
  const notes: string[] = []
  for (const meal of meals) {
    if (meal.status === 'accepted') continue
    const ctx = await buildContext(db, actor, meal)
    const brief = buildDiningBrief(ctx.input)
    const problems = [
      ...brief.mealIssues.filter((i) => i.severity === 'error').map((i) => i.text),
      ...brief.hardExclusions.map((e) => e.text),
      ...brief.ruleViolations.filter((v) => v.severity === 'strict').map((v) => v.text),
    ]
    if (problems.length && !input.force) {
      blocked.push({ id: meal.id, name: meal.name, date: meal.date, problems: unique(problems) })
      continue
    }
    if (!ctx.items.length) notes.push(`${meal.name} (${meal.date}) has no dishes yet.`)
    await db.update(s.meals).set({ status: 'accepted', acceptedAt: Date.now() }).where(eq(s.meals.id, meal.id))
    accepted.push({ id: meal.id, name: meal.name, date: meal.date })
  }
  await settlePassedMeals(db, actor.householdId)
  return {
    accepted,
    blocked,
    notes,
    message: blocked.length
      ? 'Some meals were not accepted because the dining brief found problems. Show them to the host; accept with force only if the host says so.'
      : 'Accepted. Pantry items are held for these meals and the cooking is scheduled.',
  }
}

export async function reopenMeals(db: Db, actor: Actor, mealIds: string[]) {
  for (const id of mealIds) {
    const m = await requireMeal(db, actor, id)
    if (m.settledAt) throw conflict(`${m.name} has already happened`)
    await db.update(s.meals).set({ status: 'draft', acceptedAt: null }).where(eq(s.meals.id, id))
  }
  return { reopened: mealIds }
}

// ---------------------------------------------------------------------------------------------------------------
// Suggestions (BRIEF §9)

async function rankContext(db: Db, actor: Actor, ctx: MealContext, course?: string): Promise<RankContext> {
  const ids = ctx.attendees.map((a) => a.person.id)
  const reacts = ids.length
    ? await inChunks(ids, (part) =>
        db
          .select()
          .from(s.reactions)
          .where(
            and(
              inArray(s.reactions.personId, part),
              eq(s.reactions.layerHouseholdId, actor.householdId),
              isNull(s.reactions.deletedAt),
            ),
          ),
      )
    : []
  const served = ids.length
    ? await inChunks(ids, (part) =>
        db
          .select()
          .from(s.servedLog)
          .where(
            and(
              inArray(s.servedLog.personId, part),
              eq(s.servedLog.layerHouseholdId, actor.householdId),
              isNull(s.servedLog.deletedAt),
            ),
          ),
      )
    : []
  const pantry = await corePantry(db, actor.householdId)
  return {
    today: ctx.today,
    reactions: reacts.map((r) => ({ personId: r.personId, versionId: r.versionId, type: r.reaction, ...(r.note && { note: r.note }) })),
    servings: served.map((x) => ({ personId: x.personId, versionId: x.versionId, date: x.servedOn })),
    pantry: pantry.map((p) => ({
      name: p.name,
      ...(p.expiry && { expiresOn: p.expiry.slice(0, 10) }),
      ...(p.chametz && { chametz: true }),
    })),
    occasions: ctx.occasions,
    ...(course && { course }),
    ...(nextChametzCutoff(ctx.loc, ctx.today) && { chametzCutoff: nextChametzCutoff(ctx.loc, ctx.today)! }),
  }
}

const dishMeta = (all: LoadedVersion[]) => new Map(all.map((v) => [v.version.id, v]))

export async function getSuggestions(
  db: Db,
  actor: Actor,
  input: { mealId: string; course?: string; limit?: number },
) {
  await settlePassedMeals(db, actor.householdId)
  const meal = await requireMeal(db, actor, input.mealId)
  const ctx = await buildContext(db, actor, meal)
  const all = await loadAllVersions(db, actor.householdId)
  const meta = dishMeta(all)
  const rc = await rankContext(db, actor, ctx, input.course)
  const result = rankCandidates(ctx.input, all.map(toDishVersion), rc)
  const brief = buildDiningBrief(ctx.input)
  const limit = input.limit ?? 25
  const shape = (id: string) => {
    const v = meta.get(id)!
    return {
      versionId: id,
      recipeId: v.recipe.id,
      title: v.recipe.title,
      versionTitle: v.version.title,
      course: v.version.course,
      form: v.version.form,
      kashrut: versionKashrut(v),
      difficulty: v.version.difficulty,
      activeMinutes: v.version.activeMinutes,
      totalMinutes: v.version.totalMinutes,
      servings: v.version.servings,
    }
  }
  const hasAllergyChecks = brief.activeConstraints.some((a) => a.constraint.tag.type === 'allergen')
  return {
    meal: { id: meal.id, name: meal.name, date: meal.date },
    course: input.course ?? null,
    attendees: ctx.attendees.map((a) => ({ id: a.person.id, name: a.person.name })),
    suggestions: result.ranked.slice(0, limit).map((r) => ({
      ...shape(r.dish.id),
      score: Math.round(r.score * 100) / 100,
      reasons: r.reasons,
      eatAround: r.check.eatAround.map((e) => e.text),
      aiWarnings: r.check.aiWarnings.map((w) => w.text),
    })),
    totalFits: result.ranked.length,
    hidden: result.hidden.map((h) => ({ ...shape(h.dish.id), why: h.why })),
    hasAllergyChecks,
    disclaimer: brief.disclaimer,
  }
}

export async function suggestMenuForMeal(
  db: Db,
  actor: Actor,
  input: { mealId: string; plan?: CourseSlot[]; apply?: boolean; maxHard?: number },
) {
  await settlePassedMeals(db, actor.householdId)
  const meal = await requireMeal(db, actor, input.mealId)
  const ctx = await buildContext(db, actor, meal)
  const all = await loadAllVersions(db, actor.householdId)
  const meta = dishMeta(all)
  const rc = await rankContext(db, actor, ctx)
  const res = suggestMenu(ctx.input, all.map(toDishVersion), rc, { plan: input.plan, maxHard: input.maxHard })
  const menu = res.menu.map((m) => {
    const v = meta.get(m.dish.id)!
    return {
      course: m.course,
      versionId: v.version.id,
      recipeId: v.recipe.id,
      title: v.recipe.title,
      versionTitle: v.version.title,
      kashrut: versionKashrut(v),
      activeMinutes: v.version.activeMinutes,
      score: Math.round(m.score * 100) / 100,
      reasons: m.reasons,
    }
  })
  if (input.apply) {
    if (meal.settledAt) throw conflict('That meal has already happened')
    await addItems(db, actor, meal.id, menu.map((m) => ({ versionId: m.versionId, course: m.course })))
    if (meal.status === 'accepted')
      await db.update(s.meals).set({ status: 'draft', acceptedAt: null }).where(eq(s.meals.id, meal.id))
  }
  return { applied: !!input.apply, menu, unfilled: res.unfilled, disclaimer: buildDiningBrief(ctx.input).disclaimer }
}

// ---------------------------------------------------------------------------------------------------------------
// Calendar, upcoming and the menu

function checkRange(from: string, to: string) {
  if (!isDate(from) || !isDate(to)) throw invalid('from and to must be YYYY-MM-DD')
  const n = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
  if (n < 1) throw invalid('to is before from')
  if (n > MAX_RANGE_DAYS) throw invalid(`Ask for at most ${MAX_RANGE_DAYS} days at a time`)
}

export async function getCalendar(db: Db, actor: Actor, input: { from?: string; to?: string; days?: number }) {
  await settlePassedMeals(db, actor.householdId)
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const from = input.from ?? today
  const to = input.to ?? addDaysStr(from, (input.days ?? 14) - 1)
  checkRange(from, to)
  const days = calendarDays(from, to, loc)
  const meals = await mealsInRange(db, actor.householdId, from, to)
  const items = await itemsOfMeals(db, meals.map((m) => m.id))
  return {
    today,
    location: { name: (loc as { name?: string }).name ?? null, timeZone: loc.timeZone, israel: loc.israel },
    days: days.map((d) => ({
      ...dayLabel(d),
      hebrewDate: d.hebrew,
      sunrise: d.sunrise ?? null,
      sunset: d.sunset ?? null,
      nightfall: d.nightfall ?? null,
      isCholHamoed: d.isCholHamoed,
      isErevYomTov: d.isErevYomTov,
      isYomKippur: d.isYomKippur,
      eruvTavshilin: d.eruvTavshilin,
      candleLightingKind: d.candleLightingKind ?? null,
      periods: d.periods,
      meals: meals
        .filter((m) => m.date === d.date)
        .map((m) => ({
          id: m.id,
          name: m.name,
          time: m.time,
          timeText: clock(m.time),
          kind: m.kind,
          status: m.status,
          itemCount: (items.get(m.id) ?? []).length,
        })),
    })),
  }
}

function addDaysStr(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** The coming Shabbatot and Yom Tovim as occasions (the home screen), with the meals planned for them. */
export async function getUpcoming(db: Db, actor: Actor, input: { days?: number } = {}) {
  await settlePassedMeals(db, actor.householdId)
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const span = Math.min(input.days ?? 35, 120)
  const end = addDaysStr(today, span)
  const days = calendarDays(addDaysStr(today, -1), end, loc)
  const meals = await mealsInRange(db, actor.householdId, today, end)
  const items = await itemsOfMeals(db, meals.map((m) => m.id))
  const chip = (d: string) =>
    meals
      .filter((m) => m.date === d)
      .map((m) => ({ id: m.id, name: m.name, time: m.time, timeText: clock(m.time), kind: m.kind, status: m.status, itemCount: (items.get(m.id) ?? []).length }))

  const occasions: unknown[] = []
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    if (!d.noMelacha || days[i - 1].noMelacha) continue
    let j = i
    while (j + 1 < days.length && days[j + 1].noMelacha) j++
    const run = days.slice(i - 1, j + 1)
    if (run[run.length - 1].date < today) continue
    const holiday = run
      .flatMap((x) => x.jewishHolidays)
      .find((h) => !/^erev|rosh chodesh|parashat|shabbat/i.test(h))
    const parasha = run.find((x) => x.parasha)?.parasha
    const title = holiday ?? (parasha ? `Shabbat ${parasha}` : 'Shabbat')
    occasions.push({
      title,
      from: run[0].date,
      to: run[run.length - 1].date,
      hebrew: `${run[0].hebrew.text} – ${run[run.length - 1].hebrew.text}`,
      isYomTov: run.some((x) => x.isYomTov),
      eruvTavshilin: run.some((x) => x.eruvTavshilin),
      days: run.map((x) => ({ ...dayLabel(x), meals: chip(x.date) })),
    })
  }
  return { today, occasions: occasions.slice(0, 8), upcomingMeals: meals.map((m) => ({ id: m.id, name: m.name, date: m.date, timeText: clock(m.time), status: m.status })) }
}

/** What is for dinner: the accepted menus (and, if asked, drafts) over a range, with their items. */
export async function getMenu(
  db: Db,
  actor: Actor,
  input: { date?: string; from?: string; to?: string; includeDrafts?: boolean },
) {
  await settlePassedMeals(db, actor.householdId)
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const from = input.from ?? input.date ?? today
  const to = input.to ?? input.date ?? addDaysStr(from, 7)
  checkRange(from, to)
  const meals = (await mealsInRange(db, actor.householdId, from, to)).filter(
    (m) => input.includeDrafts || m.status === 'accepted',
  )
  const plan = await planMeals(db, actor.householdId, meals)
  return {
    from,
    to,
    meals: meals.map((m) => ({
      id: m.id,
      date: m.date,
      name: m.name,
      time: m.time,
      timeText: clock(m.time),
      kind: m.kind,
      status: m.status,
      items: (plan.items.get(m.id) ?? []).map((i) => itemView(i, plan.versions)),
    })),
    note: input.includeDrafts ? null : 'Only accepted meals are shown. Pass includeDrafts to see drafts.',
  }
}

