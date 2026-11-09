// The Plan tab: a week (or any short range) of days with weekday meals and the runs of Shabbat / Yom Tov that touch
// it; the hosted page of a run or a single hosted meal; and the guest, dish and recipe-search operations on a meal.
// The calendar, naming and grouping rules are `@tavshil/core` (hosting.ts, menu.ts); this file loads the data and
// shapes it.
import { startOfWeek, todayIn } from '@beitecha/engine'
import {
  DEFAULT_COURSES,
  DISCLAIMER,
  SLOT_LABELS,
  autoMealName,
  awayText,
  buildDiningBrief,
  calendarDays,
  compareMealsInDay,
  compareMealsInHolyDay,
  constraintLabels,
  countsText,
  courseGroup,
  createDishChecker,
  displayHolidays,
  eveLinkOn,
  foodNotes,
  groupMenuWithDefaults,
  headcount,
  holyDateOfMeal,
  holyDatesOf,
  hostedKeyFor,
  hostedRuns,
  isActive,
  isDaySlot,
  isNightSlot,
  mealKey,
  mealProblems,
  menuSummary,
  parseHostedKey,
  runStartingOn,
  sumHeadcounts,
  type CalendarDay,
  type ConstraintLabel,
  type DaySlot,
  type Headcount,
  type HolyDay,
  type HostedRun,
  type HouseholdLocation,
  type MealProblem,
  type MealProblems,
  type ServingNutrition,
  perServing,
} from '@tavshil/core'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  clock,
  conflict,
  inChunks,
  invalid,
  isDate,
  notFound,
  unique,
  type Actor,
  type Db,
} from './ctx'
import { householdLocation } from './households'
import { toDishVersion, versionKashrut, type LoadedVersion } from './mappers'
import {
  buildContext,
  buildContexts,
  requireMeal,
  settlePassedMeals,
  type MealContext,
} from './planning'
import { setPresent, syncHosted, reopenIfAccepted } from './mealGuests'
import { loadEffectivePeopleOnDates, requirePerson, type EffectivePerson } from './people'
import { itemsOfMeals, mealsInRange, type MealItemRow, type MealRow } from './plans'
import { loadAllVersions, loadVersions, searchRecipes, type SearchInput } from './recipes'

const MAX_PLAN_DAYS = 62

// ---------------------------------------------------------------------------------------------------------------
// Shapes (the REST and MCP responses; the client mirrors them in src/lib/api/types.ts)

export interface HolidayView {
  name: string
  kind: 'jewish' | 'civil'
}

export interface MealCard {
  /** Null for a default meal of a holy day that has not been created yet (`virtual`). */
  id: string | null
  virtual: boolean
  /** For a virtual meal: what to send to create it. */
  create: { date: string; slot: DaySlot; name: string } | null
  date: string
  slot: DaySlot
  slotLabel: string
  name: string
  nameEdited: boolean
  /** Minutes after midnight, or null. */
  time: number | null
  /** `HH:MM` 24-hour, or null. */
  timeText: string | null
  status: 'draft' | 'accepted'
  /** Meat / dairy / parve once known. */
  kind: 'meat' | 'dairy' | 'parve' | null
  /** A full page: flagged, in a run, or has a guest from another household. */
  hosted: boolean
  /** The run this meal belongs to (`run-2027-04-22`), or null for a weekday meal. */
  runKey: string | null
  /** Where its page lives: `/hosted/${hostedKey}`. */
  hostedKey: string
  /** The holy day it belongs to (the date of the day itself) and whether it is the evening or daytime meal. */
  holyDate: string | null
  part: 'night' | 'day' | null
  /** Dish titles of the main course (or the first course with dishes) in menu order. Empty: show "Not planned". */
  summary: string[]
  itemCount: number
  planned: boolean
  headcount: Headcount
  headcountText: string
  awayText: string
  /** Households other than your own on the guest list. */
  guestHouseholds: number
  hasGuests: boolean
  problems: MealProblems['counts']
}

export interface WeekDay {
  date: string
  /** 0 = Sunday. */
  weekday: number
  isToday: boolean
  hebrew: string
  parasha: string | null
  holidays: HolidayView[]
  isShabbat: boolean
  isYomTov: boolean
  isCholHamoed: boolean
  isErevShabbat: boolean
  isErevYomTov: boolean
  candleLighting: { minutes: number; text: string } | null
  havdalah: { minutes: number; text: string } | null
  /** Set when this day is a holy day of a run: its tile is the run, not these cells. */
  holyDay: { runKey: string; label: string } | null
  /** The evening meal of the holy day that starts tonight ("Plan Seder I →"); it replaces this day's dinner slot. */
  eve: {
    runKey: string
    holyDate: string
    mealName: string
    holyDayLabel: string
    /** The meal, if it exists already. */
    meal: MealCard | null
  } | null
  /** Weekday meals of this date in order (not meals that belong to a run). */
  meals: MealCard[]
}

export interface RunHolyDay {
  date: string
  eveDate: string
  label: string
  isShabbat: boolean
  isYomTov: boolean
  isCholHamoed: boolean
  /** Evening meal first, then daytime meals; default meals not yet created are `virtual`. */
  meals: MealCard[]
}

export interface RunSummary {
  key: string
  title: string
  from: string
  to: string
  startsOn: string
  holyDays: RunHolyDay[]
  /** Meals counting the virtual ones. */
  mealCount: number
  toPlan: number
  problems: { allergies: number; gaps: number; total: number }
}

export interface PlanView {
  today: string
  from: string
  to: string
  location: { timeZone: string; israel: boolean }
  /** The Shabbat's parsha in a Sunday-to-Saturday week. */
  parasha: string | null
  days: WeekDay[]
  runs: RunSummary[]
}

export interface GuestMember {
  personId: string
  name: string
  isChild: boolean
  present: boolean
  /** Constraints active on the meal's day. A strict allergy has `strictAllergy: true` (danger color). */
  constraints: ConstraintLabel[]
}

export interface GuestHousehold {
  householdId: string
  name: string
  /** Your own household: always on the list, cannot be removed. */
  isHost: boolean
  members: GuestMember[]
  /** Who is coming. */
  counts: Headcount
  countsText: string
  awayText: string
  /** Everyone's constraints combined (distinct), strict allergies first. */
  constraints: ConstraintLabel[]
  removable: boolean
}

export interface MenuItemView {
  itemId: string
  position: number
  /** The stored course. */
  course: string | null
  title: string
  recipeId: string | null
  versionId: string | null
  versionTitle: string | null
  kashrut: 'meat' | 'dairy' | 'parve' | null
  /** A dish with no recipe (typed in), or brought by a guest. */
  noRecipe: boolean
  broughtBy: string | null
  /** The problems that name this dish (allergy first). */
  problems: MealProblem[]
}

export interface MenuCourseView {
  course: string
  label: string
  items: MenuItemView[]
}

export interface HostedMealView extends MealCard {
  menu: MenuCourseView[]
  households: GuestHousehold[]
  problemDetails: MealProblems
  /** Food notes for the printed menu: never names. */
  foodNotes: string[]
  /** Everything a dining brief says per person, for the host only. */
  disclaimer: string
}

export interface HostedHolyDay {
  date: string
  label: string
  isShabbat: boolean
  isYomTov: boolean
  meals: HostedMealView[]
}

export interface HostedPage {
  /** The canonical key: `run-…` for a run, `meal-…` for a single hosted meal. */
  key: string
  type: 'run' | 'meal'
  title: string
  from: string
  to: string
  /** The night the run begins (the civil date before its first day). */
  startsOn: string
  today: string
  location: { timeZone: string; israel: boolean }
  /** `letter` or `a4`, for printing. */
  paper: 'letter' | 'a4'
  /** One group per holy day; a single meal has one group with an empty label. */
  days: HostedHolyDay[]
  totals: { meals: number; toPlan: number; withGuests: number; withProblems: number }
  /** Everything to fix across the page, for the "things to fix" box. */
  fixes: (MealProblem & { mealId: string | null; mealName: string; dayLabel: string })[]
  disclaimer: string
}

// ---------------------------------------------------------------------------------------------------------------
// Loading a meal's facts

const hostRows = async (db: Db, ids: string[]) =>
  ids.length
    ? inChunks(ids, (part) =>
        db
          .select()
          .from(s.households)
          .where(and(inArray(s.households.id, part), isNull(s.households.deletedAt))),
      )
    : []

interface MealFacts {
  meal: MealRow
  ctx: MealContext
  households: GuestHousehold[]
  problems: MealProblems
  mealKind: 'meat' | 'dairy' | 'parve' | null
}

async function householdMemberRows(db: Db, householdIds: string[]) {
  if (!householdIds.length) return []
  return inChunks(householdIds, (part) =>
    db
      .select()
      .from(s.persons)
      .where(and(inArray(s.persons.householdId, part), isNull(s.persons.deletedAt)))
      .orderBy(asc(s.persons.createdAt)),
  )
}

/** The guest-list rows of several meals (see the `meal_households` table), oldest first. */
async function mealHouseholdRowsOf(db: Db, mealIds: string[]) {
  const rows = await inChunks(mealIds, (part) =>
    db
      .select()
      .from(s.mealHouseholds)
      .where(and(inArray(s.mealHouseholds.mealId, part), isNull(s.mealHouseholds.deletedAt)))
      .orderBy(asc(s.mealHouseholds.createdAt)),
  )
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

/** Which households are on the guest list of a meal, host first. */
function listedHouseholdIds(
  actor: Actor,
  rows: { householdId: string }[],
  attendeePersons: { householdId: string }[],
): string[] {
  return unique([
    actor.householdId,
    ...rows.map((r) => r.householdId),
    ...attendeePersons.map((p) => p.householdId),
  ])
}

async function loadFacts(db: Db, actor: Actor, meal: MealRow): Promise<MealFacts> {
  return (await loadFactsMany(db, actor, [meal])).get(meal.id)!
}

/**
 * The facts of many meals with a fixed number of queries: everything is loaded once for all of them (see
 * `buildContexts`), then each meal's facts are worked out in memory.
 */
async function loadFactsMany(
  db: Db,
  actor: Actor,
  meals: MealRow[],
  known?: { loc?: HouseholdLocation },
): Promise<Map<string, MealFacts>> {
  const out = new Map<string, MealFacts>()
  if (!meals.length) return out
  const [built, listRows] = await Promise.all([
    buildContexts(db, actor, meals, known),
    mealHouseholdRowsOf(
      db,
      meals.map((m) => m.id),
    ),
  ])
  const rowsByMeal = new Map<string, { householdId: string }[]>()
  for (const r of listRows) {
    const list = rowsByMeal.get(r.mealId) ?? []
    list.push(r)
    rowsByMeal.set(r.mealId, list)
  }
  const hidsOf = new Map(
    meals.map((meal) => {
      const ctx = built.contexts.get(meal.id)!
      const attPersons = ctx.attendees.map((a) => ({ householdId: a.access.household.id }))
      return [
        meal.id,
        listedHouseholdIds(actor, rowsByMeal.get(meal.id) ?? [], attPersons),
      ] as const
    }),
  )
  const allHids = unique([...hidsOf.values()].flat())
  const [hhRows, memberRows] = await Promise.all([
    hostRows(db, allHids),
    householdMemberRows(db, allHids),
  ])
  const names = new Map(hhRows.map((h) => [h.id, h.name]))
  const missing = memberRows.map((m) => m.id).filter((id) => !built.loaded.has(id))
  if (missing.length) {
    const more = await loadEffectivePeopleOnDates(
      db,
      actor,
      missing,
      unique(meals.map((m) => m.date)),
    )
    for (const [day, list] of more)
      for (const e of list) built.effective.get(day)!.set(e.person.id, e)
  }
  for (const meal of meals) {
    const ctx = built.contexts.get(meal.id)!
    const hids = hidsOf.get(meal.id)!
    const effective = built.effective.get(meal.date)!
    out.set(meal.id, factsOf(actor, meal, ctx, hids, names, memberRows, effective))
  }
  return out
}

function factsOf(
  actor: Actor,
  meal: MealRow,
  ctx: MealContext,
  hids: string[],
  names: Map<string, string>,
  memberRows: Awaited<ReturnType<typeof householdMemberRows>>,
  effective: Map<string, EffectivePerson>,
): MealFacts {
  const attendeeIds = new Set(ctx.attendees.map((a) => a.person.id))
  const households: GuestHousehold[] = hids
    .filter((id) => names.has(id))
    .map((id) => {
      const members: GuestMember[] = memberRows
        .filter((m) => m.householdId === id)
        .map((m) => {
          const eff = effective.get(m.id)
          const active = (eff?.person.constraints ?? []).filter((c) =>
            isActive(c.activeWhen, meal.date, ctx.loc, meal.time ?? undefined),
          )
          return {
            personId: m.id,
            name: m.name,
            isChild: m.isChild,
            present: attendeeIds.has(m.id),
            constraints: constraintLabels(active),
          }
        })
      const counts = headcount(members)
      const all = members.flatMap((m) => m.constraints)
      return {
        householdId: id,
        name: names.get(id)!,
        isHost: id === actor.householdId,
        members,
        counts,
        countsText: countsText(counts),
        awayText: awayText(members.filter((m) => !m.present).map((m) => m.name)),
        constraints: mergeLabels(all),
        removable: id !== actor.householdId,
      }
    })

  const brief = buildDiningBrief(ctx.input)
  const problems = mealProblems(
    brief,
    ctx.items.map((i) => ({
      id: i.id,
      dishId: i.versionId ?? i.id,
      course:
        i.course ?? (i.versionId ? (ctx.versions.get(i.versionId)?.version.course ?? null) : null),
    })),
  )
  return { meal, ctx, households, problems, mealKind: brief.mealKind }
}

/** Distinct labels of several members, strict allergies first. */
function mergeLabels(all: ConstraintLabel[]): ConstraintLabel[] {
  const by = new Map<string, ConstraintLabel>()
  for (const l of all) {
    const prev = by.get(l.text)
    by.set(l.text, {
      text: l.text,
      strictAllergy: l.strictAllergy || !!prev?.strictAllergy,
      strict: l.strict || !!prev?.strict,
    })
  }
  return [...by.values()].sort(
    (a, b) => Number(b.strictAllergy) - Number(a.strictAllergy) || a.text.localeCompare(b.text),
  )
}

function itemTitle(it: MealItemRow, versions: Map<string, LoadedVersion>): string {
  const v = it.versionId ? versions.get(it.versionId) : undefined
  if (v) return v.recipe.title
  return it.description ?? (it.versionId ? 'Deleted recipe' : 'Dish')
}

const itemCourse = (it: MealItemRow, versions: Map<string, LoadedVersion>) =>
  it.course ?? (it.versionId ? (versions.get(it.versionId)?.version.course ?? null) : null)

const toTimeText = (m: number | null) => clock(m)

/** The card of a stored meal. */
function cardOf(
  f: MealFacts,
  place: { runKey: string | null; holyDate: string | null; part: 'night' | 'day' | null },
  hostedFlag: boolean,
): MealCard {
  const { meal, ctx } = f
  const slot = meal.slot as DaySlot
  const guests = f.households.filter((h) => !h.isHost)
  const counts = sumHeadcounts(f.households.map((h) => h.counts))
  const hasGuests = guests.some((g) => g.counts.total > 0 || g.members.length > 0)
  const hosted = hostedFlag || !!place.runKey || hasGuests
  return {
    id: meal.id,
    virtual: false,
    create: null,
    date: meal.date,
    slot,
    slotLabel: SLOT_LABELS[slot],
    name: meal.name,
    nameEdited: meal.nameEdited,
    time: meal.time,
    timeText: toTimeText(meal.time),
    status: meal.status,
    kind: f.mealKind,
    hosted,
    runKey: place.runKey,
    hostedKey: hostedKeyFor({ id: meal.id, runKey: place.runKey }),
    holyDate: place.holyDate,
    part: place.part,
    summary: menuSummary(
      ctx.items.map((i) => ({ ...i, course: itemCourse(i, ctx.versions) })),
      (i) => itemTitle(i, ctx.versions),
    ),
    itemCount: ctx.items.length,
    planned: ctx.items.length > 0,
    headcount: counts,
    headcountText: countsText(counts),
    awayText: awayText(
      f.households.flatMap((h) => h.members.filter((m) => !m.present).map((m) => m.name)),
    ),
    guestHouseholds: guests.length,
    hasGuests,
    problems: f.problems.counts,
  }
}

function virtualCard(
  run: HostedRun,
  hd: HolyDay,
  d: HolyDay['defaultMeals'][number],
  hostHeadcount: Headcount,
): MealCard {
  const slot = d.slot
  return {
    id: null,
    virtual: true,
    create: { date: d.date, slot, name: d.name },
    date: d.date,
    slot,
    slotLabel: SLOT_LABELS[slot],
    name: d.name,
    nameEdited: false,
    time: null,
    timeText: null,
    status: 'draft',
    kind: null,
    hosted: true,
    runKey: run.key,
    hostedKey: run.key,
    holyDate: hd.date,
    part: d.part,
    summary: [],
    itemCount: 0,
    planned: false,
    headcount: hostHeadcount,
    headcountText: countsText(hostHeadcount),
    awayText: '',
    guestHouseholds: 0,
    hasGuests: false,
    problems: { allergies: 0, gaps: 0, other: 0, total: 0 },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Where a meal sits

interface Placement {
  run: HostedRun | null
  holy: HolyDay | null
  part: 'night' | 'day' | null
}

function placeMeal(meal: { date: string; slot: DaySlot }, runs: HostedRun[]): Placement {
  const holyDate = holyDateOfMeal(meal, holyDatesOf(runs))
  if (!holyDate) return { run: null, holy: null, part: null }
  const run = runs.find((r) => r.holyDays.some((d) => d.date === holyDate))!
  const holy = run.holyDays.find((d) => d.date === holyDate)!
  return { run, holy, part: isNightSlot(meal.slot) ? 'night' : 'day' }
}

/** Runs around a date, wide enough to place a meal on it. */
const runsAround = (date: string, loc: HouseholdLocation) =>
  hostedRuns(addDays(date, -1), addDays(date, 1), loc)

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

const hostHeadcountOf = async (db: Db, actor: Actor): Promise<Headcount> => {
  const rows = await householdMemberRows(db, [actor.householdId])
  return headcount(rows.map((r) => ({ isChild: r.isChild, present: true })))
}

const clockText = (minutes: number | undefined) => {
  if (minutes === undefined) return null
  const h = Math.floor(minutes / 60) % 24
  const m = Math.round(minutes % 60)
  return { minutes, text: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}` }
}

// ---------------------------------------------------------------------------------------------------------------
// The plan (week / month)

/** Meals that were soft-deleted in a range: a removed default meal does not come back as a placeholder. */
async function removedSlots(db: Db, actor: Actor, from: string, to: string) {
  const rows = await db
    .select({ date: s.meals.date, slot: s.meals.slot })
    .from(s.meals)
    .where(
      and(
        eq(s.meals.householdId, actor.householdId),
        isNotNull(s.meals.deletedAt),
        sql`${s.meals.date} >= ${from}`,
        sql`${s.meals.date} <= ${to}`,
      ),
    )
  return new Set(rows.map((r) => `${r.date}|${r.slot}`))
}

export async function getPlan(
  db: Db,
  actor: Actor,
  input: { from: string; to: string },
): Promise<PlanView> {
  if (!isDate(input.from) || !isDate(input.to)) throw invalid('from and to must be YYYY-MM-DD')
  const n = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 + 1
  if (n < 1) throw invalid('to is before from')
  if (n > MAX_PLAN_DAYS) throw invalid(`Ask for at most ${MAX_PLAN_DAYS} days at a time`)
  const [loc, hostCount] = await Promise.all([
    householdLocation(db, actor.householdId),
    hostHeadcountOf(db, actor),
  ])
  await settlePassedMeals(db, actor.householdId, { loc })
  const today = todayIn(loc.timeZone)
  const runs = hostedRuns(input.from, input.to, loc)
  const lo = runs.reduce((m, r) => (r.startsOn < m ? r.startsOn : m), input.from)
  const hi = runs.reduce((m, r) => (r.to > m ? r.to : m), input.to)
  const [rows, removed] = await Promise.all([
    mealsInRange(db, actor.householdId, lo, hi),
    removedSlots(db, actor, lo, hi),
  ])
  const holyDates = holyDatesOf(runs)

  const cards = new Map<string, MealCard>()
  const allFacts = await loadFactsMany(db, actor, rows, { loc })
  for (const meal of rows) {
    const slot = meal.slot as DaySlot
    const place = placeMeal({ date: meal.date, slot }, runs)
    const facts = allFacts.get(meal.id)!
    cards.set(
      meal.id,
      cardOf(
        facts,
        { runKey: place.run?.key ?? null, holyDate: place.holy?.date ?? null, part: place.part },
        meal.hosted,
      ),
    )
  }
  void holyDates

  const runSummaries: RunSummary[] = runs.map((run) => {
    const holyDays = run.holyDays.map((hd): RunHolyDay => {
      const real = rows
        .filter((m) => {
          const p = placeMeal({ date: m.date, slot: m.slot as DaySlot }, runs)
          return p.holy?.date === hd.date
        })
        .map((m) => cards.get(m.id)!)
      const virtuals = hd.defaultMeals
        .filter(
          (d) =>
            !real.some((r) => r.part === d.part && r.slot === d.slot) &&
            !removed.has(`${d.date}|${d.slot}`),
        )
        .map((d) => virtualCard(run, hd, d, hostCount))
      const meals = [...real, ...virtuals].sort((a, b) => compareMealsInHolyDay(a, b))
      return {
        date: hd.date,
        eveDate: hd.eveDate,
        label: hd.label,
        isShabbat: hd.isShabbat,
        isYomTov: hd.isYomTov,
        isCholHamoed: hd.isCholHamoed,
        meals,
      }
    })
    const all = holyDays.flatMap((d) => d.meals)
    const allergies = all.reduce((n, m) => n + m.problems.allergies, 0)
    const gaps = all.reduce((n, m) => n + m.problems.gaps, 0)
    return {
      key: run.key,
      title: run.title,
      from: run.from,
      to: run.to,
      startsOn: run.startsOn,
      holyDays,
      mealCount: all.length,
      toPlan: all.filter((m) => !m.planned).length,
      problems: { allergies, gaps, total: all.reduce((n, m) => n + m.problems.total, 0) },
    }
  })

  const cal = calendarDays(input.from, input.to, loc)
  const days: WeekDay[] = cal.map((d) => {
    const holyRun = runs.find((r) => r.holyDays.some((h) => h.date === d.date))
    const hd = holyRun?.holyDays.find((h) => h.date === d.date)
    const eve = eveLinkOn(d.date, runs)
    const eveRun = eve ? runSummaries.find((r) => r.key === eve.runKey) : undefined
    const eveMeal = eve
      ? (eveRun?.holyDays
          .find((h) => h.date === eve.holyDate)
          ?.meals.find((m) => m.part === 'night' && m.slot === 'dinner') ?? null)
      : null
    return {
      date: d.date,
      weekday: d.weekday,
      isToday: d.date === today,
      hebrew: d.hebrew.text,
      parasha: d.parasha ?? null,
      holidays: displayHolidays(d),
      isShabbat: d.isShabbat,
      isYomTov: d.isYomTov,
      isCholHamoed: d.isCholHamoed,
      isErevShabbat: d.isErevShabbat,
      isErevYomTov: d.isErevYomTov,
      candleLighting: clockText(d.candleLighting),
      havdalah: clockText(d.havdalah),
      holyDay: holyRun && hd ? { runKey: holyRun.key, label: hd.label } : null,
      eve:
        eve && eveMeal
          ? { ...eve, meal: eveMeal.virtual ? null : eveMeal }
          : eve
            ? { ...eve, meal: null }
            : null,
      meals: rows
        .filter(
          (m) =>
            m.date === d.date &&
            placeMeal({ date: m.date, slot: m.slot as DaySlot }, runs).holy === null,
        )
        .map((m) => cards.get(m.id)!)
        .sort(compareMealsInDay),
    }
  })
  return {
    today,
    from: input.from,
    to: input.to,
    location: { timeZone: loc.timeZone, israel: loc.israel },
    parasha: cal.find((d) => d.parasha)?.parasha ?? null,
    days,
    runs: runSummaries,
  }
}

/** The Sunday-to-Saturday week containing `date` (default: today in the household's time zone). */
export async function getWeek(db: Db, actor: Actor, input: { date?: string } = {}) {
  const loc = await householdLocation(db, actor.householdId)
  const date = input.date ?? todayIn(loc.timeZone)
  if (!isDate(date)) throw invalid('date must be YYYY-MM-DD')
  const from = startOfWeek(date)
  return getPlan(db, actor, { from, to: addDays(from, 6) })
}

// ---------------------------------------------------------------------------------------------------------------
// The hosted page

function menuOf(f: MealFacts): MenuCourseView[] {
  const { ctx, problems } = f
  const items = ctx.items.map((i): MenuItemView => {
    const v = i.versionId ? ctx.versions.get(i.versionId) : undefined
    return {
      itemId: i.id,
      position: i.position,
      course: itemCourse(i, ctx.versions),
      title: itemTitle(i, ctx.versions),
      recipeId: v?.recipe.id ?? null,
      versionId: v?.version.id ?? null,
      versionTitle: v?.version.title ?? null,
      kashrut: v ? versionKashrut(v) : i.kashrut,
      noRecipe: !v,
      broughtBy: i.broughtBy,
      problems: problems.problems.filter((p) => p.itemIds.includes(i.id)),
    }
  })
  return groupMenuWithDefaults(items, DEFAULT_COURSES).map((g) => ({
    course: g.course,
    label: g.label,
    items: g.items,
  }))
}

function viewOf(
  f: MealFacts,
  place: { runKey: string | null; holyDate: string | null; part: 'night' | 'day' | null },
): HostedMealView {
  const card = cardOf(f, place, f.meal.hosted)
  const constraints = f.ctx.attendees.flatMap((a) =>
    a.person.constraints.filter((c) =>
      isActive(c.activeWhen, f.meal.date, f.ctx.loc, f.meal.time ?? undefined),
    ),
  )
  return {
    ...card,
    menu: menuOf(f),
    households: f.households,
    problemDetails: f.problems,
    foodNotes: foodNotes(constraints),
    disclaimer: DISCLAIMER,
  }
}

const paperFor = (loc: HouseholdLocation): 'letter' | 'a4' =>
  !loc.israel && /^(America|US|Canada)\//.test(loc.timeZone) ? 'letter' : 'a4'

/** The page of a run (`run-2027-04-22`) or a single hosted meal (`meal-<id>`; a run's meal gives its run). */
export async function getHosted(db: Db, actor: Actor, key: string): Promise<HostedPage> {
  const parsed = parseHostedKey(key)
  if (!parsed) throw invalid('Not a hosted key')
  await settlePassedMeals(db, actor.householdId)
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)

  if (parsed.type === 'meal') {
    const meal = await requireMeal(db, actor, parsed.mealId)
    const place = placeMeal(
      { date: meal.date, slot: meal.slot as DaySlot },
      runsAround(meal.date, loc),
    )
    if (place.run) return getHosted(db, actor, place.run.key)
    const view = viewOf(await loadFacts(db, actor, meal), {
      runKey: null,
      holyDate: null,
      part: null,
    })
    return page({
      key: mealKey(meal.id),
      type: 'meal',
      title: meal.name,
      from: meal.date,
      to: meal.date,
      startsOn: meal.date,
      today,
      loc,
      days: [{ date: meal.date, label: '', isShabbat: false, isYomTov: false, meals: [view] }],
    })
  }

  const run = runStartingOn(parsed.date, loc)
  if (!run) throw notFound('Run')
  const rows = await mealsInRange(db, actor.householdId, run.startsOn, run.to)
  const removed = await removedSlots(db, actor, run.startsOn, run.to)
  const hostCount = await hostHeadcountOf(db, actor)
  const days: HostedHolyDay[] = []
  const placed = run.holyDays.map((hd) => ({
    hd,
    mine: rows.filter((m) => {
      const p = placeMeal({ date: m.date, slot: m.slot as DaySlot }, [run])
      return p.holy?.date === hd.date
    }),
  }))
  const factsById = await loadFactsMany(
    db,
    actor,
    placed.flatMap((p) => p.mine),
    { loc },
  )
  // A superset of the placeholder days is fine: it is the same few dates.
  const virtualDates = placed.flatMap(({ hd }) =>
    hd.defaultMeals.filter((d) => !removed.has(`${d.date}|${d.slot}`)).map((d) => d.date),
  )
  const hostByDate = await hostHouseholds(db, actor, virtualDates)
  for (const { hd, mine } of placed) {
    const views: HostedMealView[] = []
    for (const m of mine) {
      const place = placeMeal({ date: m.date, slot: m.slot as DaySlot }, [run])
      views.push(
        viewOf(factsById.get(m.id)!, {
          runKey: run.key,
          holyDate: hd.date,
          part: place.part,
        }),
      )
    }
    for (const d of hd.defaultMeals) {
      if (views.some((v) => v.part === d.part && v.slot === d.slot)) continue
      if (removed.has(`${d.date}|${d.slot}`)) continue
      views.push(virtualView(run, hd, d, hostCount, hostByDate.get(d.date)!))
    }
    days.push({
      date: hd.date,
      label: hd.label,
      isShabbat: hd.isShabbat,
      isYomTov: hd.isYomTov,
      meals: views.sort(compareMealsInHolyDay),
    })
  }
  return page({
    key: run.key,
    type: 'run',
    title: run.title,
    from: run.from,
    to: run.to,
    startsOn: run.startsOn,
    today,
    loc,
    days,
  })
}

/** The host household as a guest row for each date (placeholder meals), with a fixed number of queries. */
async function hostHouseholds(
  db: Db,
  actor: Actor,
  dates: string[],
): Promise<Map<string, GuestHousehold>> {
  const out = new Map<string, GuestHousehold>()
  const days = unique(dates)
  if (!days.length) return out
  const [[h], members] = await Promise.all([
    hostRows(db, [actor.householdId]),
    householdMemberRows(db, [actor.householdId]),
  ])
  const byDate = await loadEffectivePeopleOnDates(
    db,
    actor,
    members.map((m) => m.id),
    days,
  )
  for (const date of days) {
    const eff = new Map(byDate.get(date)!.map((e) => [e.person.id, e]))
    const mem: GuestMember[] = members.map((m) => ({
      personId: m.id,
      name: m.name,
      isChild: m.isChild,
      present: true,
      constraints: constraintLabels(eff.get(m.id)?.person.constraints ?? []),
    }))
    const counts = headcount(mem)
    out.set(date, {
      householdId: actor.householdId,
      name: h?.name ?? 'Us',
      isHost: true,
      members: mem,
      counts,
      countsText: countsText(counts),
      awayText: '',
      constraints: mergeLabels(mem.flatMap((m) => m.constraints)),
      removable: false,
    })
  }
  return out
}

function virtualView(
  run: HostedRun,
  hd: HolyDay,
  d: HolyDay['defaultMeals'][number],
  hostCount: Headcount,
  host: GuestHousehold,
): HostedMealView {
  return {
    ...virtualCard(run, hd, d, hostCount),
    menu: DEFAULT_COURSES.map((c) => ({
      course: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
      items: [],
    })),
    households: [host],
    problemDetails: {
      problems: [],
      aiNotes: [],
      unchecked: [],
      counts: { allergies: 0, gaps: 0, other: 0, total: 0 },
    },
    foodNotes: [],
    disclaimer: DISCLAIMER,
  }
}

function page(p: {
  key: string
  type: 'run' | 'meal'
  title: string
  from: string
  to: string
  startsOn: string
  today: string
  loc: HouseholdLocation
  days: HostedHolyDay[]
}): HostedPage {
  const meals = p.days.flatMap((d) => d.meals)
  const fixes = p.days.flatMap((d) =>
    d.meals.flatMap((m) =>
      m.problemDetails.problems.map((x) => ({
        ...x,
        mealId: m.id,
        mealName: m.name,
        dayLabel: d.label,
      })),
    ),
  )
  return {
    key: p.key,
    type: p.type,
    title: p.title,
    from: p.from,
    to: p.to,
    startsOn: p.startsOn,
    today: p.today,
    location: { timeZone: p.loc.timeZone, israel: p.loc.israel },
    paper: paperFor(p.loc),
    days: p.days,
    totals: {
      meals: meals.length,
      toPlan: meals.filter((m) => !m.planned).length,
      withGuests: meals.filter((m) => m.hasGuests).length,
      withProblems: meals.filter((m) => m.problems.total > 0).length,
    },
    fixes,
    disclaimer: DISCLAIMER,
  }
}

/** One meal as a hosted-page row (what the guest and dish operations return). */
export async function getHostedMeal(db: Db, actor: Actor, mealId: string): Promise<HostedMealView> {
  const meal = await requireMeal(db, actor, mealId)
  const loc = await householdLocation(db, actor.householdId)
  const place = placeMeal(
    { date: meal.date, slot: meal.slot as DaySlot },
    runsAround(meal.date, loc),
  )
  return viewOf(await loadFacts(db, actor, meal), {
    runKey: place.run?.key ?? null,
    holyDate: place.holy?.date ?? null,
    part: place.part,
  })
}

/**
 * The meal for a default slot of a holy day, created if it does not exist ("Plan Seder I →", "Plan the menu" on a
 * folded meal). Idempotent: an existing meal in that slot is returned as it is.
 */
export async function ensureRunMeal(
  db: Db,
  actor: Actor,
  input: { runKey: string; holyDate: string; part: 'night' | 'day' },
) {
  const parsed = parseHostedKey(input.runKey)
  if (!parsed || parsed.type !== 'run') throw invalid('Not a run key')
  const loc = await householdLocation(db, actor.householdId)
  const run = runStartingOn(parsed.date, loc)
  const hd = run?.holyDays.find((d) => d.date === input.holyDate)
  if (!run || !hd) throw notFound('Holy day')
  const def = hd.defaultMeals.find((m) => m.part === input.part)!
  const existing = (await mealsInRange(db, actor.householdId, def.date, def.date)).find(
    (m) =>
      m.slot === def.slot &&
      placeMeal({ date: m.date, slot: m.slot as DaySlot }, [run]).holy?.date === hd.date,
  )
  if (existing) return { mealId: existing.id, created: false, hostedKey: run.key }
  const [meal] = await db
    .insert(s.meals)
    .values({
      householdId: actor.householdId,
      date: def.date,
      name: def.name,
      slot: def.slot,
      hosted: true,
    })
    .returning()
  const hostIds = (await householdMemberRows(db, [actor.householdId])).map((p) => p.id)
  await setPresent(db, meal.id, hostIds, true)
  return { mealId: meal.id, created: true, hostedKey: run.key }
}

// ---------------------------------------------------------------------------------------------------------------
// Attendance

/** Everything the host can pick as a guest: households (yours and contacts) with members, for search. */
async function requireHouseholdOnList(db: Db, actor: Actor, householdId: string) {
  const [h] = await db
    .select()
    .from(s.households)
    .where(and(eq(s.households.id, householdId), isNull(s.households.deletedAt)))
  if (!h || (h.id !== actor.householdId && h.ghostOfHouseholdId !== actor.householdId))
    throw notFound('Household')
  return h
}

export async function addHouseholdToMeal(
  db: Db,
  actor: Actor,
  mealId: string,
  householdId: string,
): Promise<HostedMealView> {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened')
  await requireHouseholdOnList(db, actor, householdId)
  const members = await householdMemberRows(db, [householdId])
  if (householdId !== actor.householdId) {
    const [row] = await db
      .select()
      .from(s.mealHouseholds)
      .where(
        and(eq(s.mealHouseholds.mealId, mealId), eq(s.mealHouseholds.householdId, householdId)),
      )
    if (!row) await db.insert(s.mealHouseholds).values({ mealId, householdId })
    else if (row.deletedAt !== null)
      await db
        .update(s.mealHouseholds)
        .set({ deletedAt: null })
        .where(eq(s.mealHouseholds.id, row.id))
  }
  await setPresent(
    db,
    mealId,
    members.map((m) => m.id),
    true,
  )
  await syncHosted(db, actor, mealId)
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

export async function removeHouseholdFromMeal(
  db: Db,
  actor: Actor,
  mealId: string,
  householdId: string,
): Promise<HostedMealView> {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened')
  if (householdId === actor.householdId) throw invalid('Your own household is always on the list')
  const members = await householdMemberRows(db, [householdId])
  await setPresent(
    db,
    mealId,
    members.map((m) => m.id),
    false,
  )
  await db
    .update(s.mealHouseholds)
    .set({ deletedAt: Date.now() })
    .where(and(eq(s.mealHouseholds.mealId, mealId), eq(s.mealHouseholds.householdId, householdId)))
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

export async function setMemberPresent(
  db: Db,
  actor: Actor,
  mealId: string,
  personId: string,
  present: boolean,
): Promise<HostedMealView> {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened')
  const acc = await requirePerson(db, actor, personId)
  if (acc.household.id !== actor.householdId) {
    // A guest's household is on the list as soon as one of its people is ticked.
    const [row] = await db
      .select()
      .from(s.mealHouseholds)
      .where(
        and(
          eq(s.mealHouseholds.mealId, mealId),
          eq(s.mealHouseholds.householdId, acc.household.id),
        ),
      )
    if (!row) await db.insert(s.mealHouseholds).values({ mealId, householdId: acc.household.id })
    else if (row.deletedAt !== null)
      await db
        .update(s.mealHouseholds)
        .set({ deletedAt: null })
        .where(eq(s.mealHouseholds.id, row.id))
  }
  await setPresent(db, mealId, [personId], present)
  if (present) await syncHosted(db, actor, mealId)
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

// ---------------------------------------------------------------------------------------------------------------
// Dishes

export interface AddDishInput {
  /** The course group to add to: `starter`, `main`, `dessert` or a custom one. */
  course: string
  /** A recipe version… */
  versionId?: string
  scale?: number
  servings?: number
  /** …or a dish without a recipe (typed in). */
  description?: string
  kashrut?: 'meat' | 'dairy' | 'parve'
  /** A guest is bringing it. */
  broughtBy?: string
}

async function lastPosition(db: Db, mealId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(max(${s.mealItems.position}), -1)` })
    .from(s.mealItems)
    .where(and(eq(s.mealItems.mealId, mealId), isNull(s.mealItems.deletedAt)))
  return r?.n ?? -1
}

export async function addDish(db: Db, actor: Actor, mealId: string, input: AddDishInput) {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened; its menu is now history.')
  const course = courseGroup(input.course)
  const position = (await lastPosition(db, mealId)) + 1
  if (input.versionId) {
    const v = (await loadVersions(db, actor.householdId, [input.versionId])).get(input.versionId)
    if (!v) throw notFound('Recipe version')
    await db.insert(s.mealItems).values({
      mealId,
      position,
      course,
      versionId: v.version.id,
      scale: input.scale ?? 1,
      servings: input.servings ?? v.version.servings ?? null,
      broughtBy: input.broughtBy ?? null,
    })
  } else if (input.description?.trim()) {
    await db.insert(s.mealItems).values({
      mealId,
      position,
      course,
      description: input.description.trim(),
      broughtBy: input.broughtBy ?? null,
      kashrut: input.kashrut ?? null,
    })
  } else throw invalid('A dish needs a versionId or a description')
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

export async function removeDish(db: Db, actor: Actor, mealId: string, itemId: string) {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened; its menu is now history.')
  await db
    .update(s.mealItems)
    .set({ deletedAt: Date.now() })
    .where(and(eq(s.mealItems.id, itemId), eq(s.mealItems.mealId, mealId)))
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

/**
 * Moves a dish to a course, before another dish of that course (`beforeItemId`) or at its end. Positions are
 * renumbered 0..n over the whole meal; a dish stays in menu order within its course.
 */
export async function moveDish(
  db: Db,
  actor: Actor,
  mealId: string,
  itemId: string,
  input: { course: string; beforeItemId?: string },
) {
  const meal = await requireMeal(db, actor, mealId)
  if (meal.settledAt) throw conflict('That meal has already happened; its menu is now history.')
  const items = (await itemsOfMeals(db, [mealId])).get(mealId) ?? []
  const moving = items.find((i) => i.id === itemId)
  if (!moving) throw notFound('Dish')
  const course = courseGroup(input.course)
  const rest = items.filter((i) => i.id !== itemId)
  let at: number
  if (input.beforeItemId) {
    at = rest.findIndex((i) => i.id === input.beforeItemId)
    if (at < 0) throw notFound('Dish')
  } else {
    // After the last dish of that course; with none, where the course belongs among the others.
    let last = -1
    rest.forEach((i, idx) => {
      if (courseGroup(i.course) === course) last = idx
    })
    at = last >= 0 ? last + 1 : rest.length
  }
  const order = [...rest.slice(0, at), moving, ...rest.slice(at)]
  const stmts: unknown[] = order.map((it, idx) =>
    db
      .update(s.mealItems)
      .set({ position: idx, ...(it.id === itemId && { course }) })
      .where(eq(s.mealItems.id, it.id)),
  )
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50) as never)
  await reopenIfAccepted(db, meal)
  return getHostedMeal(db, actor, mealId)
}

// ---------------------------------------------------------------------------------------------------------------
// Recipe search for a meal

/** The nutrition filters and sorts of a recipe search, usable when searching for a meal. */
export type NutritionSearch = Pick<
  SearchInput,
  | 'nutrition'
  | 'minProteinG'
  | 'minFiberG'
  | 'maxCalories'
  | 'maxCarbsG'
  | 'maxSodiumMg'
  | 'maxSugarG'
  | 'sort'
>

export interface MealRecipeHit {
  recipeId: string
  versionId: string
  title: string
  versionTitle: string
  course: string | null
  kashrut: 'meat' | 'dairy' | 'parve'
  /** Short fit notes, even for ones that fit ("pareve · fits everyone"). */
  note: string
  /** Why it does not fit; empty when it does. */
  why: string[]
  /** The people it fails for. */
  failsFor: { personId: string; personName: string }[]
  /** Eat-around hints for ones that fit. */
  eatAround: string[]
  aiWarnings: string[]
  /** Per serving, when the recipe has nutrition. */
  nutritionPerServing: ServingNutrition | null
}

/**
 * Recipes matching `q` that pass every attendee's constraints at this meal (fits), and the ones that do not with the
 * reasons (excluded). Plain code: the same dish checker the dining brief uses, with the meal's dishes in place.
 */
export async function searchRecipesForMeal(
  db: Db,
  actor: Actor,
  mealId: string,
  input: { q?: string; course?: string; limit?: number } & NutritionSearch,
) {
  const meal = await requireMeal(db, actor, mealId)
  const ctx = await buildContext(db, actor, meal)
  const { q, course: _course, limit: _limit, ...nutrition } = input
  const filtered = Object.values(nutrition).some((v) => v !== undefined)
  const found =
    q?.trim() || filtered
      ? await searchRecipes(db, actor, { q: q?.trim() || undefined, ...nutrition, limit: 200 })
      : null
  const versions: LoadedVersion[] = found
    ? [
        ...(
          await loadVersions(
            db,
            actor.householdId,
            found.results.flatMap((r) => r.versions.map((v) => v.versionId)),
          )
        ).values(),
      ]
    : await loadAllVersions(db, actor.householdId)
  const leads = new Map<string, LoadedVersion[]>()
  for (const v of versions) leads.set(v.recipe.id, [...(leads.get(v.recipe.id) ?? []), v])
  const order = found ? new Map(found.results.map((r, i) => [r.recipeId, i])) : null
  const checker = createDishChecker(ctx.input)
  const want = input.course ? courseGroup(input.course) : null
  const hits: MealRecipeHit[] = []
  for (const [, vs] of leads) {
    const scored = vs.map((v) => ({ v, c: checker.check(toDishVersion(v)) }))
    // The best version of the recipe: one that fits if any does.
    const best = scored.find((x) => x.c.fits) ?? scored[0]
    const { v, c } = best
    if (want && courseGroup(v.version.course) !== want) continue
    const kashrut = versionKashrut(v)
    const people = new Map<string, string>()
    for (const e of c.exclusions) people.set(e.personId, e.personName)
    for (const e of c.ruleViolations.filter((r) => r.severity === 'strict'))
      people.set(e.personId, e.personName)
    hits.push({
      recipeId: v.recipe.id,
      versionId: v.version.id,
      title: v.recipe.title,
      versionTitle: v.version.title,
      course: v.version.course ?? null,
      kashrut,
      note: c.fits
        ? `${kashrut === 'parve' ? 'pareve' : kashrut} · fits everyone`
        : `${kashrut === 'parve' ? 'pareve' : kashrut} · does not fit`,
      why: c.reasons,
      failsFor: [...people].map(([personId, personName]) => ({ personId, personName })),
      eatAround: c.eatAround.map((e) => e.text),
      aiWarnings: c.aiWarnings.map((w) => w.text),
      nutritionPerServing: perServing(v.version.nutrition, v.version.servings),
    })
  }
  const rank = (h: MealRecipeHit) => order?.get(h.recipeId) ?? 0
  hits.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
  const limit = Math.min(input.limit ?? 30, 100)
  return {
    mealId,
    attendees: ctx.attendees.map((a) => ({ personId: a.person.id, name: a.person.name })),
    fits: hits.filter((h) => !h.why.length).slice(0, limit),
    excluded: hits.filter((h) => h.why.length).slice(0, limit),
    total: hits.length,
    ...(filtered && {
      nutritionNote:
        'Nutrition is per serving. Recipes without figures for the filter were left out; the AI can fill them in on request.',
    }),
    disclaimer: DISCLAIMER,
  }
}
