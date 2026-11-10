// The menu → course → dish view, tile summaries, headcounts and the problems a hosted page shows per meal.
import type { ActiveConstraint, DiningBrief } from './diningBrief'
import type { Constraint, ConstraintTag, SourcingStandard } from './types'

// ---------------------------------------------------------------------------
// Courses

/** The courses a new hosted meal starts with: main, sides (soups and salads too) and dessert. */
export const DEFAULT_COURSES = ['main', 'side', 'dessert'] as const

const COURSE_ALIASES: Record<string, string> = {
  appetizer: 'side',
  appetiser: 'side',
  first: 'side',
  starter: 'side',
  soup: 'side',
  salad: 'side',
  vegetable: 'side',
  starch: 'side',
  entree: 'main',
  sweet: 'dessert',
}

/**
 * The course group a stored course belongs to. Recipes carry finer courses (soup, salad, side): in the menu view
 * they all sit under Sides, between the main and the dessert, on screen and on the printed menu. Other names stay
 * as they are.
 */
export function courseGroup(course: string | null | undefined): string {
  const c = (course ?? '').trim().toLowerCase()
  if (!c) return 'main'
  return COURSE_ALIASES[c] ?? c
}

const GROUP_RANK: Record<string, number> = { main: 0, side: 2, dessert: 9 }
const rankOf = (g: string): number => GROUP_RANK[g] ?? 5

const GROUP_LABEL: Record<string, string> = { side: 'Sides' }

export const courseLabel = (group: string): string =>
  GROUP_LABEL[group] ?? group.charAt(0).toUpperCase() + group.slice(1)

export interface MenuGroup<T> {
  /** `main`, `side`, `dessert`, or a custom course. */
  course: string
  /** `Main`, `Sides`, `Dessert`. */
  label: string
  items: T[]
}

/** Dishes grouped by course, courses in serving order (main, sides, others, dessert), dishes in menu order. */
export function groupMenu<T extends { position: number; course?: string | null }>(
  items: readonly T[],
): MenuGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const groups = new Map<string, T[]>()
  for (const it of sorted) {
    const g = courseGroup(it.course)
    groups.set(g, [...(groups.get(g) ?? []), it])
  }
  return [...groups.entries()]
    .map(([course, list], i) => ({ course, label: courseLabel(course), items: list, i }))
    .sort((a, b) => rankOf(a.course) - rankOf(b.course) || a.i - b.i)
    .map(({ i: _i, ...g }) => g)
}

/** `groupMenu` with the default courses present even when empty, for an editable menu. */
export function groupMenuWithDefaults<T extends { position: number; course?: string | null }>(
  items: readonly T[],
  defaults: readonly string[] = DEFAULT_COURSES,
): MenuGroup<T>[] {
  const have = groupMenu(items)
  const missing = defaults.filter((d) => !have.some((g) => g.course === d))
  return [
    ...have,
    ...missing.map((course) => ({ course, label: courseLabel(course), items: [] })),
  ].sort((a, b) => rankOf(a.course) - rankOf(b.course))
}

/**
 * A meal tile's summary: the main course's dishes in menu order; with no main, the first course that has dishes;
 * with no dishes, empty (the UI shows "Not planned"). Returns the dish titles.
 */
export function menuSummary<T extends { position: number; course?: string | null }>(
  items: readonly T[],
  title: (item: T) => string,
): string[] {
  const groups = groupMenu(items)
  const g = groups.find((x) => x.course === 'main') ?? groups[0]
  return g ? g.items.map(title) : []
}

// ---------------------------------------------------------------------------
// Headcounts

export interface Headcount {
  adults: number
  children: number
  total: number
}

/** Adults and children among those present. Members marked absent are not counted. */
export function headcount(people: readonly { isChild: boolean; present: boolean }[]): Headcount {
  let adults = 0
  let children = 0
  for (const p of people) {
    if (!p.present) continue
    if (p.isChild) children++
    else adults++
  }
  return { adults, children, total: adults + children }
}

export function sumHeadcounts(counts: readonly Headcount[]): Headcount {
  const adults = counts.reduce((n, c) => n + c.adults, 0)
  const children = counts.reduce((n, c) => n + c.children, 0)
  return { adults, children, total: adults + children }
}

/** `2 adults, 1 child`; `4 adults`; `1 child`; empty string for nobody. */
export function countsText(c: Pick<Headcount, 'adults' | 'children'>): string {
  const parts: string[] = []
  if (c.adults) parts.push(`${c.adults} ${c.adults === 1 ? 'adult' : 'adults'}`)
  if (c.children) parts.push(`${c.children} ${c.children === 1 ? 'child' : 'children'}`)
  return parts.join(', ')
}

/** `Jochanan away`, `Jochanan and Rivka away`, `3 away`. Empty for nobody. */
export function awayText(names: readonly string[]): string {
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} away`
  if (names.length === 2) return `${names[0]} and ${names[1]} away`
  return `${names.length} away`
}

// ---------------------------------------------------------------------------
// Constraint text

const STANDARD_TEXT: Record<SourcingStandard, string> = {
  chalav_yisrael: 'chalav Yisrael',
  pat_yisrael: 'pat Yisrael',
  yashan: 'yashan',
  glatt: 'glatt',
}

/** A constraint as short text: `tree nuts`, `vegetarian`, `no mushrooms`, `chalav Yisrael`. */
export function constraintText(tag: ConstraintTag): string {
  switch (tag.type) {
    case 'allergen':
    case 'diet':
      return tag.value.replace(/_/g, ' ')
    case 'ingredient':
    case 'kashrut':
      return `no ${tag.value.replace(/_/g, ' ')}`
    case 'rule':
      return tag.value.replace(/_/g, ' ')
    case 'sourcing':
      return STANDARD_TEXT[tag.value]
    case 'trait':
      return 'no spicy food'
  }
}

export interface ConstraintLabel {
  text: string
  /** A strict allergy (or other strict medical allergen): shown in the danger color. */
  strictAllergy: boolean
  strict: boolean
}

export const isStrictAllergy = (c: Constraint): boolean =>
  c.tag.type === 'allergen' && c.severity === 'strict'

/** The distinct constraints of some people as text, strict allergies first. */
export function constraintLabels(constraints: readonly Constraint[]): ConstraintLabel[] {
  const byText = new Map<string, ConstraintLabel>()
  for (const c of constraints) {
    const text = constraintText(c.tag)
    const prev = byText.get(text)
    const next: ConstraintLabel = {
      text,
      strictAllergy: isStrictAllergy(c) || !!prev?.strictAllergy,
      strict: c.severity === 'strict' || !!prev?.strict,
    }
    byText.set(text, next)
  }
  return [...byText.values()].sort(
    (a, b) => Number(b.strictAllergy) - Number(a.strictAllergy) || a.text.localeCompare(b.text),
  )
}

// ---------------------------------------------------------------------------
// Problems per meal

export interface MealProblem {
  /**
   * `allergy`: a dish contains an allergen someone is strictly allergic to (the flagged dish is named).
   * `exclusion`: a dish is ruled out for someone (diet, kashrut) · `rule`: a combination rule ·
   * `meal`: a problem of the meal as a whole (meat with dairy) · `gap`: someone has no main course they can eat.
   */
  kind: 'allergy' | 'exclusion' | 'rule' | 'meal' | 'gap'
  severity: 'error' | 'warning'
  text: string
  dishId?: string
  dishTitle?: string
  /** The menu items to highlight (and offer "Replace dish" on). */
  itemIds: string[]
  personId?: string
  personName?: string
  /** For a `gap`: the course that has nothing for them. */
  course?: string
}

export interface MealProblems {
  problems: MealProblem[]
  /** Dishes whose allergy result rests on AI-filled ingredient data: "check the label". */
  aiNotes: { dishId: string; dishTitle: string; itemIds: string[]; text: string }[]
  /** Brought dishes that could not be checked at all. */
  unchecked: { dishId: string; title: string; by: string; itemIds: string[] }[]
  counts: { allergies: number; gaps: number; other: number; total: number }
}

export interface MealProblemItem {
  /** The meal item id. */
  id: string
  /** The id the dining brief knows the dish by: the recipe version id, or the item id for a brought dish. */
  dishId: string
  course: string | null
}

/**
 * The problems of one meal, from its dining brief: allergies (naming the flagged dish), ruled-out dishes, rule and
 * meal-level problems, and gaps (a guest with no main course they can eat).
 */
export function mealProblems(brief: DiningBrief, items: readonly MealProblemItem[]): MealProblems {
  const itemsOf = (dishId: string) => items.filter((i) => i.dishId === dishId).map((i) => i.id)
  const problems: MealProblem[] = []

  for (const e of brief.hardExclusions) {
    // A strict diet (vegetarian) rules out the meat dishes without being a problem; a missing main shows as a gap.
    if (e.tag.type === 'diet') continue
    problems.push({
      kind: e.tag.type === 'allergen' ? 'allergy' : 'exclusion',
      severity: 'error',
      text: e.text,
      dishId: e.dishId,
      dishTitle: e.dishTitle,
      itemIds: itemsOf(e.dishId),
      personId: e.personId,
      personName: e.personName,
    })
  }
  for (const v of brief.ruleViolations) {
    problems.push({
      kind: 'rule',
      severity: v.severity === 'strict' ? 'error' : 'warning',
      text: v.text,
      dishId: v.dishId,
      dishTitle: v.dishTitle,
      itemIds: itemsOf(v.dishId),
      personId: v.personId,
      personName: v.personName,
    })
  }
  for (const i of brief.mealIssues) {
    problems.push({
      kind: 'meal',
      severity: i.severity,
      text: i.text,
      ...(i.dishIds[0] && { dishId: i.dishIds[0] }),
      itemIds: i.dishIds.flatMap(itemsOf),
    })
  }

  // Gaps: a main course exists, and for some guest every main is ruled out or ruins it for them.
  // Sides still count as something to eat (the group also holds soups and salads, which do not).
  const mains = items.filter(
    (i) =>
      courseGroup(i.course) === 'main' ||
      ['side', 'vegetable', 'starch'].includes((i.course ?? '').trim().toLowerCase()),
  )
  if (mains.length) {
    const checks = new Map(brief.dishes.map((d) => [d.dishId, d]))
    const people = new Map<string, { name: string; active: ActiveConstraint[] }>()
    for (const a of brief.activeConstraints) {
      const p = people.get(a.personId) ?? { name: a.personName, active: [] }
      p.active.push(a)
      people.set(a.personId, p)
    }
    for (const [personId, p] of people) {
      const blocked = (dishId: string): boolean => {
        const c = checks.get(dishId)
        if (!c) return false
        if (c.unchecked) return false
        return (
          c.exclusions.some((e) => e.personId === personId) ||
          c.eatAround.some((e) => e.personId === personId && e.verdict === 'ruins')
        )
      }
      if (!mains.every((m) => blocked(m.dishId))) continue
      const hit = [
        ...mains.flatMap((m) => checks.get(m.dishId)?.exclusions ?? []),
        ...mains.flatMap((m) => checks.get(m.dishId)?.eatAround ?? []),
      ].filter((e) => e.personId === personId)
      const labels = [...new Set(hit.map((e) => constraintText(e.tag)))]
      const diet = hit.find((e) => e.tag.type === 'diet')
      problems.push({
        kind: 'gap',
        severity: 'warning',
        text: diet
          ? `There is no ${constraintText(diet.tag)} main for ${p.name}`
          : `There is no main ${p.name} can eat (${labels.join(', ')})`,
        itemIds: mains.map((m) => m.id),
        personId,
        personName: p.name,
        course: 'main',
      })
    }
  }

  const aiNotes = brief.aiWarnings.map((w) => ({
    dishId: w.dishId,
    dishTitle: w.dishTitle,
    itemIds: itemsOf(w.dishId),
    text: w.text,
  }))
  const unchecked = brief.uncheckedDishes.map((u) => ({
    dishId: u.dishId,
    title: u.title,
    by: u.by,
    itemIds: itemsOf(u.dishId),
  }))
  const allergies = problems.filter((p) => p.kind === 'allergy').length
  const gaps = problems.filter((p) => p.kind === 'gap').length
  return {
    problems,
    aiNotes,
    unchecked,
    counts: {
      allergies,
      gaps,
      other: problems.length - allergies - gaps,
      total: problems.length,
    },
  }
}

/** Which food notes a printed menu may carry for a meal: never names, only the food. */
export function foodNotes(constraints: readonly Constraint[]): string[] {
  const notes: string[] = []
  const allergens = new Set<string>()
  for (const c of constraints) {
    if (c.tag.type === 'allergen' && c.severity === 'strict')
      allergens.add(c.tag.value.replace(/_/g, ' '))
  }
  for (const a of [...allergens].sort()) notes.push(`${a.replace(/s$/, '')}-free meal`)
  return notes
}
