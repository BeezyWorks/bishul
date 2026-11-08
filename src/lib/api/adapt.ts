/**
 * Server shapes (worker/services/*) to the UI's presentation types (types.ts).
 * Everything the server does not say in the UI's vocabulary is translated here, and nowhere else.
 */
import { clock12, shortHebrew, weekdayName } from '@/lib/dates'
import { DISCLAIMER } from '@/lib/strings'

import {
  COURSES,
  type BriefLine,
  type CalendarDay,
  type CalendarHoliday,
  type Collection,
  type Constraint,
  type ConstraintTagType,
  type Cost,
  type Course,
  type Difficulty,
  type DiningBrief,
  type Fit,
  type Household,
  type IngredientLine,
  type Kind,
  type Meal,
  type MealChip,
  type MealDetail,
  type MealItem,
  type MealPerson,
  type NutritionInfo,
  type MealReview,
  type Occasion,
  type OccasionDay,
  type PantryList,
  type Person,
  type PrepDay,
  type Reason,
  type Recipe,
  type RecipeFilters,
  type RecipeSummary,
  type RecipeVersion,
  type ShoppingLine,
  type SuggestionResult,
} from './types'

// ---------------------------------------------------------------------------------------------------------------
// Small vocabularies

export const asCourse = (c: string | null | undefined): Course =>
  (COURSES as string[]).includes((c ?? '').toLowerCase()) ? (c!.toLowerCase() as Course) : 'other'

export const asKind = (k: string | null | undefined): Kind =>
  k === 'meat' || k === 'dairy' || k === 'parve' ? k : 'parve'

const asKindOrNull = (k: string | null | undefined): Kind | null =>
  k === 'meat' || k === 'dairy' || k === 'parve' ? k : null

const DIFFICULTY_FROM: Record<string, Difficulty> = {
  easy: 'easy',
  average: 'average',
  a_pain: 'a pain',
}
export const difficultyIn = (d: string | null | undefined): Difficulty =>
  DIFFICULTY_FROM[d ?? ''] ?? 'average'
export const difficultyOut = (d: Difficulty) => (d === 'a pain' ? 'a_pain' : d)

export const costIn = (c: number | null | undefined): Cost =>
  c === 3 ? '$$$' : c === 2 ? '$$' : '$'
export const costOut = (c: Cost) => c.length

const FIT_FROM: Record<string, Fit> = {
  fine: 'fine',
  good: 'good',
  especially: 'especially suited',
}

const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
const words = (tag: string) => tag.replace(/[_-]+/g, ' ').trim()

// ---------------------------------------------------------------------------------------------------------------
// Constraints and people

export interface ServerConstraint {
  id: string
  tagType: string
  tag: string
  kind: 'medical' | 'religious' | 'preference'
  severity: 'strict' | 'flexible'
  activeWhen: unknown
  note: string | null
  source: 'self' | 'host' | 'ai'
  layer?: 'own' | 'private' | 'profile'
}

const TAG_TYPE: Record<string, ConstraintTagType> = {
  allergen: 'allergen',
  ingredient: 'ingredient',
  diet: 'diet',
  kashrut_dish: 'kashrut-dish',
  kashrut: 'kashrut-dish',
  kashrut_sourcing: 'kashrut-sourcing',
  sourcing: 'kashrut-sourcing',
  rule: 'combination',
}

export function constraintLabel(tagType: string, tag: string): string {
  const t = titleCase(words(tag))
  switch (tagType) {
    case 'allergen':
      return `${t} allergy`
    case 'ingredient':
      return `No ${words(tag)}`
    case 'diet':
      return t
    case 'kashrut_dish':
    case 'kashrut':
      return /^no /i.test(words(tag)) ? t : `No ${words(tag)}`
    case 'kashrut_sourcing':
    case 'sourcing':
      return t
    default:
      return t
  }
}

export function activeWhenLabel(a: unknown): string {
  if (!a || typeof a !== 'object') return 'always'
  const o = a as { always?: boolean; period?: string; range?: { from: string; to: string } }
  if (o.always) return 'always'
  if (o.period) return titleCase(words(o.period))
  if (o.range) return `${o.range.from} to ${o.range.to}`
  return 'always'
}

export function adaptConstraint(c: ServerConstraint, personId: string): Constraint {
  return {
    id: c.id,
    personId,
    tag: c.tag,
    label: constraintLabel(c.tagType, c.tag),
    tagType: TAG_TYPE[c.tagType] ?? 'ingredient',
    kind: c.kind,
    severity: c.severity,
    activeWhen: activeWhenLabel(c.activeWhen),
    note: c.note ?? undefined,
    source: c.source,
    fromProfile: c.layer === 'profile',
  }
}

export interface ServerPersonView {
  id: string
  name: string
  isChild: boolean
  birthDate: string | null
  birthDateApprox: boolean
  spicy?: 'yes' | 'no' | null
  age: number | null
  userId: string | null
  householdId: string
  householdName: string
  relation: string
  link: { realPersonId: string; mode: 'merge' | 'overwrite' } | null
  constraints: ServerConstraint[]
  rules: { id: string; rule: string }[]
  notes: { id: string; text: string }[]
  likes: { versionId: string; title: string; note: string | null; at: number }[]
  dislikes: { versionId: string; title: string; note: string | null; at: number }[]
  served: { date: string; versionId: string; title: string }[]
}

export function adaptPerson(p: ServerPersonView): Person {
  return {
    id: p.id,
    name: p.name,
    householdId: p.householdId,
    relation: p.isChild ? 'Child' : undefined,
    isChild: p.isChild,
    ...(p.age !== null && { age: p.age }),
    ...(p.spicy && { spicy: p.spicy }),
    ...(p.birthDate && { birthDate: p.birthDate, birthDateApprox: p.birthDateApprox }),
    isMember: !!p.userId,
    constraints: p.constraints.map((c) => adaptConstraint(c, p.id)),
    link: p.link ? { profileName: 'a Bishul profile', mode: p.link.mode } : undefined,
    rules: p.rules.map((r) => r.rule),
    notes: p.notes.map((n) => n.text),
    likes: p.likes.map((l) => l.title),
    dislikes: p.dislikes.map((l) => l.title),
    reactions: [
      ...p.likes.map((l) => ({
        versionId: l.versionId,
        title: l.title,
        kind: 'like' as const,
        note: l.note ?? undefined,
      })),
      ...p.dislikes.map((l) => ({
        versionId: l.versionId,
        title: l.title,
        kind: 'dislike' as const,
        note: l.note ?? undefined,
      })),
    ],
    served: p.served.map((s) => ({ date: s.date, versionId: s.versionId, title: s.title })),
  }
}

export interface ServerPeople {
  household: { id: string; name: string; people: ServerPersonView[] }
  contacts: { id: string; name: string; people: ServerPersonView[] }[]
}

export const adaptHousehold = (h: ServerPeople['household']): Household => ({
  id: h.id,
  name: h.name,
  isOwn: true,
  people: h.people.map(adaptPerson),
})
export const adaptContact = (h: ServerPeople['contacts'][number]): Household => ({
  id: h.id,
  name: h.name,
  isOwn: false,
  people: h.people.map(adaptPerson),
})

// ---------------------------------------------------------------------------------------------------------------
// Calendar and occasions

const CIVIL =
  /thanksgiving|independence day|christmas|new year|memorial day|labor day|martin luther|presidents|veterans|columbus|juneteenth|halloween|valentine|mother|father|easter|canada day|bank holiday/i

function holidayOf(name: string, kind?: 'jewish' | 'civil'): CalendarHoliday {
  if (kind !== 'civil' && /^rosh chodesh/i.test(name)) return { name, type: 'rosh-chodesh' }
  return { name, type: kind ?? (CIVIL.test(name) ? 'civil' : 'jewish') }
}

export interface ServerChip {
  id: string
  name: string
  status: 'draft' | 'accepted'
  kind: string | null
  itemCount: number
}
export const adaptChip = (m: ServerChip): MealChip => ({
  id: m.id,
  name: m.name,
  status: m.status,
  kind: asKindOrNull(m.kind),
  itemCount: m.itemCount,
})

interface ServerDay {
  date: string
  hebrew: string
  parasha: string | null
  holidays: string[]
  /** Each holiday marked `jewish` or `civil` by the server. */
  holidayDetails?: { name: string; kind: 'jewish' | 'civil' }[]
  isShabbat: boolean
  isYomTov: boolean
  candleLightingText: string | null
  havdalah: number | null
  meals?: ServerChip[]
}

const havdalahText = (m: number | null) =>
  m === null
    ? undefined
    : clock12(
        `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
      )

export function adaptDay(
  d: ServerDay,
  cooking: { mealId: string; mealName: string; text: string }[] = [],
): CalendarDay {
  return {
    date: d.date,
    hebrew: shortHebrew(d.hebrew),
    parasha: d.parasha ?? undefined,
    holidays: d.holidayDetails
      ? d.holidayDetails.map((h) => holidayOf(h.name, h.kind))
      : d.holidays.map((h) => holidayOf(h)),
    isShabbat: d.isShabbat,
    isYomTov: d.isYomTov,
    candleLighting: d.candleLightingText ? clock12(d.candleLightingText) : undefined,
    havdalah: havdalahText(d.havdalah),
    meals: (d.meals ?? []).map(adaptChip),
    cooking,
  }
}

export interface ServerOccasion {
  title: string
  from: string
  to: string
  hebrew: string
  days: (ServerDay & { isErevShabbat: boolean; meals: ServerChip[] })[]
}

export function adaptOccasion(o: ServerOccasion): Occasion {
  const first = o.days[0]
  const candle = o.days.find((d) => d.candleLightingText)?.candleLightingText
  const days: OccasionDay[] = o.days.map((d) => ({
    date: d.date,
    label: dayLabel(d),
    hebrew: shortHebrew(d.hebrew),
    candleLighting: d.candleLightingText ? clock12(d.candleLightingText) : undefined,
    havdalah: havdalahText(d.havdalah),
    meals: d.meals.map(adaptChip),
  }))
  return {
    id: o.from,
    title: o.title,
    subtitle: [
      o.days.length > 1 ? `${weekdayName(o.from)} to ${weekdayName(o.to)}` : weekdayName(o.from),
      `${shortHebrew(first.hebrew)}${o.days.length > 1 ? ` to ${shortHebrew(o.days[o.days.length - 1].hebrew)}` : ''}`,
      candle ? `candle lighting ${clock12(candle)}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    from: o.from,
    to: o.to,
    days,
  }
}

function dayLabel(d: ServerDay & { isErevShabbat?: boolean }): string | undefined {
  const hol = d.holidays.filter((h) => !/^erev|parashat/i.test(h))
  if (d.isShabbat && !hol.length) return 'Shabbat day'
  if (d.isErevShabbat && !hol.length) return 'Leil Shabbat'
  if (d.isShabbat) return `Shabbat · ${hol.join(', ')}`
  return hol.length ? hol.join(', ') : undefined
}

// ---------------------------------------------------------------------------------------------------------------
// Meals

interface ServerItem {
  id: string
  type: 'dish' | 'brought'
  course: string | null
  versionId: string | null
  recipeId: string | null
  title: string
  versionTitle: string | null
  kashrut: string | null
  scale: number
  servings: number | null
  activeMinutes: number | null
  broughtBy: string | null
  done: boolean
}

interface ServerAttendee {
  personId: string
  name: string
  householdId: string
  householdName: string
  isGuest: boolean
  isChild: boolean
}

export interface ServerMealDetail {
  meal: {
    id: string
    date: string
    name: string
    timeText: string | null
    kind: string | null
    status: 'draft' | 'accepted'
    attendees: ServerAttendee[]
    notComing: ServerAttendee[]
    items: ServerItem[]
    occasions: string[]
    calendar: {
      holidays: string[]
      isShabbat: boolean
      isErevShabbat: boolean
      parasha: string | null
    }
  }
  brief: ServerBrief
  review: {
    handsOnMinutes: number
    issues: string[]
    warnings: string[]
    adjustments: { dish: string; person: string; text: string }[]
    sourcing: string[]
    shopping: string[]
    nextMeal: { id: string; name: string } | null
  }
}

interface ServerBrief {
  mealKind: string | null
  activeConstraints: {
    personId: string
    personName: string
    constraint: {
      tag: { type: string; value: string }
      kind: string
      severity: string
      activeWhen: unknown
      note?: string
      source: string
    }
    display: 'warning' | 'hint'
  }[]
  hardExclusions: { dishTitle: string; personName: string; text: string }[]
  eatAround: { dishId: string; dishTitle: string; personName: string; text: string }[]
  ruleViolations: { personName: string; severity: string; text: string }[]
  mealIssues: { severity: 'error' | 'warning'; text: string }[]
  sourcingNotes: { persons: { name: string }[]; text: string }[]
  aiWarnings: { personName: string; text: string }[]
  disclaimer: string
  hasAllergyConstraints: boolean
  safety: { aiFilledAllergyData: boolean; note: string | null }
}

const CORE_TAG: Record<string, string> = {
  allergen: 'allergen',
  ingredient: 'ingredient',
  diet: 'diet',
  kashrut: 'kashrut_dish',
  sourcing: 'kashrut_sourcing',
  rule: 'rule',
}

function briefLines(b: ServerBrief): BriefLine[] {
  const lines: BriefLine[] = []
  // Group active constraints by what they say, so "Peanut allergy" lists everyone it applies to.
  const groups = new Map<string, { names: string[]; c: ServerBrief['activeConstraints'][number] }>()
  for (const a of b.activeConstraints) {
    const key = `${a.constraint.tag.type}:${a.constraint.tag.value}:${a.constraint.severity}`
    const g = groups.get(key) ?? { names: [], c: a }
    g.names.push(a.personName)
    groups.set(key, g)
  }
  for (const [key, { names, c }] of groups) {
    const type = CORE_TAG[c.constraint.tag.type] ?? c.constraint.tag.type
    const label = constraintLabel(type, c.constraint.tag.value)
    const strict = c.constraint.severity === 'strict'
    if (c.constraint.tag.type === 'sourcing') continue // said better by the sourcing notes below
    if (c.constraint.kind === 'preference')
      lines.push({
        id: key,
        tone: 'preference',
        text: `${label}. Dishes still show; you will see a note.`,
        people: names,
      })
    else if (c.constraint.kind === 'medical')
      lines.push({
        id: key,
        tone: strict ? 'danger' : 'warn',
        text: strict
          ? `${label}: dishes with ${words(c.constraint.tag.value)} are hidden.${c.constraint.note ? ` ${c.constraint.note}` : ''}`
          : `${label}: can eat around it, with a note on the dish.`,
        people: names,
      })
    else
      lines.push({
        id: key,
        tone: 'warn',
        text: strict
          ? `${label}: dishes that break it are hidden.`
          : `${label}: can eat around it, with a note on the dish.`,
        people: names,
      })
  }
  b.sourcingNotes.forEach((n, i) =>
    lines.push({
      id: `src-${i}`,
      tone: 'info',
      text: n.text,
      people: n.persons.map((p) => p.name),
    }),
  )
  b.hardExclusions.forEach((e, i) =>
    lines.push({ id: `excl-${i}`, tone: 'danger', text: e.text, people: [e.personName] }),
  )
  b.ruleViolations.forEach((v, i) =>
    lines.push({
      id: `rule-${i}`,
      tone: v.severity === 'strict' ? 'danger' : 'warn',
      text: v.text,
      people: [v.personName],
    }),
  )
  b.mealIssues.forEach((m, i) =>
    lines.push({
      id: `issue-${i}`,
      tone: m.severity === 'error' ? 'danger' : 'warn',
      text: m.text,
      people: [],
    }),
  )
  b.aiWarnings.forEach((w, i) =>
    lines.push({
      id: `ai-${i}`,
      tone: 'info',
      text: w.text,
      people: [w.personName],
      aiFilled: true,
    }),
  )
  const order = { danger: 0, warn: 1, info: 2, preference: 3 } as const
  return lines.sort((a, b2) => order[a.tone] - order[b2.tone])
}

export function adaptBrief(b: ServerBrief): DiningBrief {
  return {
    lines: briefLines(b),
    hasAllergy: b.hasAllergyConstraints || b.aiWarnings.length > 0,
    disclaimer: b.disclaimer || DISCLAIMER,
  }
}

function adaptItem(it: ServerItem, brief: ServerBrief): MealItem {
  return {
    id: it.id,
    course: asCourse(it.course),
    title: it.title,
    versionLabel: it.versionTitle ?? undefined,
    recipeId: it.recipeId ?? undefined,
    versionId: it.versionId ?? undefined,
    scale: it.scale ?? 1,
    servings: it.servings ?? 0,
    kind: asKind(it.kashrut),
    activeMin: it.activeMinutes ?? 0,
    broughtBy: it.broughtBy ?? undefined,
    done: it.done,
    adjustments: it.versionId
      ? brief.eatAround.filter((e) => e.dishId === it.versionId).map((e) => e.text)
      : [],
  }
}

/** Constraints for the Who step: what applies on the meal's date, from the dining brief. */
function briefPerson(a: ServerAttendee, brief: ServerBrief): Person {
  const mine = brief.activeConstraints.filter((c) => c.personId === a.personId)
  return {
    id: a.personId,
    name: a.name,
    householdId: a.householdId,
    relation: a.isChild ? 'Child' : a.isGuest ? a.householdName : undefined,
    isChild: a.isChild,
    constraints: mine.map((c, i) => ({
      id: `${a.personId}:${i}`,
      personId: a.personId,
      tag: c.constraint.tag.value,
      label: constraintLabel(
        CORE_TAG[c.constraint.tag.type] ?? c.constraint.tag.type,
        c.constraint.tag.value,
      ),
      tagType: TAG_TYPE[CORE_TAG[c.constraint.tag.type] ?? ''] ?? 'ingredient',
      kind: c.constraint.kind as Constraint['kind'],
      severity: c.constraint.severity as Constraint['severity'],
      activeWhen: activeWhenLabel(c.constraint.activeWhen),
      note: c.constraint.note,
      source: c.constraint.source as Constraint['source'],
      fromProfile: false,
    })),
    notes: [],
    likes: [],
    dislikes: [],
    served: [],
  }
}

export function adaptMealDetail(d: ServerMealDetail): MealDetail {
  const { meal, brief, review } = d
  const items = meal.items.map((i) => adaptItem(i, brief))
  const declared = asKindOrNull(meal.kind)
  const kind: Kind = declared ?? asKindOrNull(brief.mealKind) ?? derivedKind(items) ?? 'parve'
  const people: MealPerson[] = [
    ...meal.attendees.map((a) => ({
      person: briefPerson(a, brief),
      coming: true,
      isGuest: a.isGuest,
      householdName: a.householdName,
    })),
    ...meal.notComing.map((a) => ({
      person: briefPerson(a, brief),
      coming: false,
      isGuest: false,
      householdName: a.householdName,
    })),
  ]
  const m: Meal = {
    id: meal.id,
    date: meal.date,
    name: meal.name,
    kind,
    kindDeclared: !!declared,
    status: meal.status,
    time: meal.timeText ?? '',
    notComing: meal.notComing.map((a) => a.personId),
    guestIds: meal.attendees.filter((a) => a.isGuest).map((a) => a.personId),
    items,
  }
  const r: MealReview = {
    handsOnMin: review.handsOnMinutes,
    adjustments: review.adjustments.map((a) => ({ item: a.dish, text: `${a.person}: ${a.text}` })),
    issues: review.issues,
    warnings: review.warnings,
    sourcing: review.sourcing,
    shopping: review.shopping,
    nextMealId: review.nextMeal?.id,
    nextMealName: review.nextMeal?.name,
  }
  const hol = meal.calendar.holidays.filter((h) => !/^erev|parashat/i.test(h))
  const occasionLabel =
    meal.calendar.isShabbat && meal.calendar.parasha
      ? `Shabbat ${meal.calendar.parasha}`
      : (hol[0] ??
        (meal.calendar.isErevShabbat && meal.calendar.parasha
          ? `Shabbat ${meal.calendar.parasha}`
          : undefined))
  return { meal: m, people, brief: adaptBrief(brief), review: r, occasionLabel }
}

function derivedKind(items: MealItem[]): Kind | null {
  if (items.some((i) => i.kind === 'meat')) return 'meat'
  if (items.some((i) => i.kind === 'dairy')) return 'dairy'
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Suggestions

interface ServerSuggestions {
  suggestions: {
    versionId: string
    recipeId: string
    title: string
    versionTitle: string | null
    course: string | null
    kashrut: string
    activeMinutes: number | null
    totalMinutes: number | null
    reasons: { code: string; text: string }[]
    eatAround: string[]
    aiWarnings: string[]
  }[]
  hidden: { recipeId: string; title: string; why: string[] }[]
  hasAllergyChecks: boolean
}

const REASON_TONE: Record<string, Reason['tone']> = {
  liked: 'good',
  pantry: 'good',
  not_served: 'good',
  occasion: 'info',
  eat_around: 'warn',
  disliked: 'warn',
  served_recently: 'muted',
}

export function adaptSuggestions(course: Course, d: ServerSuggestions): SuggestionResult {
  return {
    course,
    hasAllergyChecks: d.hasAllergyChecks,
    fits: d.suggestions.map((s) => ({
      recipeId: s.recipeId,
      versionId: s.versionId,
      title: s.title,
      versionLabel: s.versionTitle ?? '',
      kind: asKind(s.kashrut),
      course: asCourse(s.course),
      activeMin: s.activeMinutes ?? 0,
      totalMin: s.totalMinutes ?? s.activeMinutes ?? 0,
      reasons: [
        ...s.reasons.map((r) => ({ tone: REASON_TONE[r.code] ?? ('info' as const), text: r.text })),
        ...s.aiWarnings.map((w) => ({ tone: 'warn' as const, text: w })),
      ],
      adjustment: s.eatAround[0],
    })),
    hidden: d.hidden.map((h) => ({ recipeId: h.recipeId, title: h.title, why: h.why.join(' ') })),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

interface ServerVersion {
  id: string
  recipeId: string
  recipeTitle: string
  title: string
  description: string | null
  sourceLinks: { url: string; label?: string }[]
  servings: number | null
  course: string | null
  form: string | null
  kashrut: string
  difficulty: string | null
  activeMinutes: number | null
  totalMinutes: number | null
  servingStyle: string | null
  holdsOnBlech: boolean | null
  easyToDeliver: boolean | null
  cost: number | null
  nutrition?: NutritionInfo | null
  prePrep: { step: string; lead_minutes: number }[]
  steps: {
    text: string
    timer_minutes?: number
    section?: string
    uses?: { line: number; portion?: number }[]
  }[]
  flags: Record<string, { value: boolean } | undefined>
  equipment: { item: string; designation: string | null }[]
  dimensions: { name: string; fit: string }[]
  ingredients: {
    id: string
    section?: string | null
    original: string
    quantity: { amount: number; unit: string } | null
    name: string
    ingredient: {
      allergens: { tag: string }[]
      flags: Record<string, { value: boolean } | undefined>
      densityGPerMl: number | null
      aiFilled: boolean
    } | null
    prepNote: string | null
    skipImpact: 'none' | 'minor' | 'ruins'
  }[]
  pesach: { friendly: boolean; kitniyot?: string[] }
  parentVersionId: string | null
}

const UNIT: Record<string, IngredientLine['unit']> = { g: 'g', ml: 'ml', piece: 'pc', pc: 'pc' }

function adaptLine(l: ServerVersion['ingredients'][number]): IngredientLine {
  const ing = l.ingredient
  return {
    id: l.id,
    name: l.name,
    amount: l.quantity?.amount ?? 0,
    unit: UNIT[l.quantity?.unit ?? 'piece'] ?? 'pc',
    original: l.original,
    prep: l.prepNote ?? undefined,
    skipImpact: l.skipImpact,
    allergens: (ing?.allergens ?? []).map((a) => a.tag),
    flags: Object.entries(ing?.flags ?? {})
      .filter(([, v]) => v?.value)
      .map(([k]) => k),
    density: ing?.densityGPerMl ?? undefined,
    aiFilled: ing?.aiFilled || undefined,
    unquantified: l.quantity ? undefined : true,
    section: l.section || undefined,
  }
}

export function adaptVersion(
  v: ServerVersion,
  extras: {
    history?: { at: number; via: string; summary: string }[]
    reactions?: RecipeVersion['reactions']
  } = {},
): RecipeVersion {
  const ingredients = v.ingredients.map(adaptLine)
  const label = v.title && v.title !== v.recipeTitle ? v.title : 'Original'
  return {
    id: v.id,
    recipeId: v.recipeId,
    label,
    parentId: v.parentVersionId ?? undefined,
    description: v.description ?? '',
    servings: v.servings ?? 4,
    kind: asKind(v.kashrut),
    difficulty: difficultyIn(v.difficulty),
    activeMin: v.activeMinutes ?? 0,
    totalMin: v.totalMinutes ?? v.activeMinutes ?? 0,
    prePrep: v.prePrep.map((p) => ({
      text: p.step,
      leadHours: Math.round((p.lead_minutes / 60) * 10) / 10,
      passive: false,
    })),
    serving:
      v.servingStyle === 'room_temperature'
        ? 'room temperature'
        : v.servingStyle === 'cold'
          ? 'cold'
          : 'hot',
    holdsOnBlech: !!v.holdsOnBlech,
    easyToDeliver: !!v.easyToDeliver,
    equipment: v.equipment.map((e) => ({
      name: e.item,
      designation: (e.designation ?? 'parve') as Kind | 'pesach',
    })),
    flags: Object.entries(v.flags ?? {})
      .filter(([, f]) => f?.value)
      .map(([k]) => k),
    cost: costIn(v.cost),
    nutrition: v.nutrition ?? undefined,
    occasionFit: v.dimensions.map((d) => ({
      dimension: d.name,
      fit: FIT_FROM[d.fit] ?? 'fine',
    })),
    source: v.sourceLinks[0]
      ? { label: v.sourceLinks[0].label ?? v.sourceLinks[0].url, url: v.sourceLinks[0].url }
      : undefined,
    pesachFriendly: v.pesach.friendly,
    pesachKitniyot: v.pesach.friendly && !!v.pesach.kitniyot?.length,
    ingredients,
    steps: v.steps.map((s, i) => ({
      id: `${v.id}:${i}`,
      text: s.text,
      timerSec: s.timer_minutes ? Math.round(s.timer_minutes * 60) : undefined,
      ingredientIds: (s.uses ?? []).flatMap((u) =>
        ingredients[u.line] ? [ingredients[u.line].id] : [],
      ),
      portions: Object.fromEntries(
        (s.uses ?? []).flatMap((u) =>
          ingredients[u.line] && u.portion ? [[ingredients[u.line].id, u.portion]] : [],
        ),
      ),
      section: s.section || undefined,
    })),
    reactions: extras.reactions ?? [],
    history: (extras.history ?? []).map((h) => ({
      date: new Date(h.at).toISOString().slice(0, 10),
      by: h.via === 'web' ? 'You' : h.via === 'mcp' ? 'Your AI' : 'API',
      summary: h.summary,
    })),
  }
}

export function adaptRecipe(
  r: { id: string; title: string; versions: ServerVersion[] },
  extras: (versionId: string) => Parameters<typeof adaptVersion>[1] = () => ({}),
): Recipe {
  const first = r.versions[0]
  return {
    id: r.id,
    title: r.title,
    aliases: [],
    course: asCourse(first?.course),
    form: first?.form ?? '',
    versions: r.versions.map((v) => adaptVersion(v, extras(v.id))),
  }
}

interface ServerResult {
  recipeId: string
  versionId: string
  title: string
  versionTitle: string
  course: string | null
  form: string | null
  kashrut: string
  difficulty: string | null
  cost: number | null
  activeMinutes: number | null
  totalMinutes: number | null
  pesachFriendly: boolean
  pesachKitniyotFree?: boolean
  dimensions: { name: string; fit: string }[]
  lastServed: string | null
  versionCount: number
  unsafeFor?: { personId: string; personName: string; reasons: string[] }[]
  /** Every matching version of the recipe, the lead one first. */
  versions?: { kashrut: string }[]
}

/** The server returns one result per recipe, led by its best-ranked version; the library lists dishes. */
export function adaptResults(results: ServerResult[]): RecipeSummary[] {
  return results.map((r) => {
    const group = r.versions?.length ? r.versions : [r]
    return {
      id: r.recipeId,
      title: r.title,
      course: asCourse(r.course),
      form: r.form ?? '',
      kinds: [...new Set(group.map((g) => asKind(g.kashrut)))],
      versionCount: r.versionCount,
      defaultVersionId: r.versionId,
      activeMin: r.activeMinutes ?? 0,
      totalMin: r.totalMinutes ?? r.activeMinutes ?? 0,
      difficulty: difficultyIn(r.difficulty),
      cost: costIn(r.cost),
      pesachFriendly: r.pesachFriendly,
      pesachKitniyot: r.pesachFriendly && r.pesachKitniyotFree === false,
      lastServed: r.lastServed ?? undefined,
      fits: r.dimensions.map((d) => ({ dimension: d.name, fit: FIT_FROM[d.fit] ?? 'fine' })),
      unsafeFor: (r.unsafeFor ?? []).map((u) => ({
        personId: u.personId,
        personName: u.personName,
        reason: u.reasons.join('; '),
      })),
    }
  })
}

const SORT_OUT: Record<string, string> = {
  relevance: 'relevance',
  quickest: 'quickest',
  easiest: 'easiest',
  'longest-unserved': 'longest_unserved',
  'a-z': 'a_z',
}
const SORT_IN: Record<string, RecipeFilters['sort']> = {
  relevance: 'relevance',
  quickest: 'quickest',
  easiest: 'easiest',
  longest_unserved: 'longest-unserved',
  a_z: 'a-z',
}

/** UI filters to the server's search parameters (also the stored shape of a collection). */
export function filtersOut(
  f: RecipeFilters,
): Record<string, string | number | boolean | string[] | undefined> {
  return {
    course: f.course,
    kashrut: f.kind,
    safeFor: f.safeFor?.length ? f.safeFor : undefined,
    pesach: f.pesachFriendly || undefined,
    maxMinutes: f.underMinutes,
    notServedWeeks: f.notServedWeeks,
    difficulty: f.difficulty ? difficultyOut(f.difficulty) : undefined,
    maxCost: f.cost ? costOut(f.cost) : undefined,
    dimension: f.dimension,
    sort: f.sort ? SORT_OUT[f.sort] : undefined,
  }
}

export function filtersIn(spec: Record<string, unknown>): RecipeFilters {
  const f: RecipeFilters = {}
  if (typeof spec.course === 'string') f.course = asCourse(spec.course)
  if (typeof spec.kashrut === 'string') f.kind = asKind(spec.kashrut)
  if (Array.isArray(spec.safeFor)) f.safeFor = spec.safeFor as string[]
  if (spec.pesach) f.pesachFriendly = true
  if (typeof spec.maxMinutes === 'number') f.underMinutes = spec.maxMinutes
  if (typeof spec.notServedWeeks === 'number') f.notServedWeeks = spec.notServedWeeks
  if (typeof spec.difficulty === 'string') f.difficulty = difficultyIn(spec.difficulty)
  if (typeof spec.maxCost === 'number') f.cost = costIn(spec.maxCost)
  if (typeof spec.dimension === 'string') f.dimension = spec.dimension
  if (typeof spec.sort === 'string') f.sort = SORT_IN[spec.sort]
  return f
}

export const adaptCollection = (c: {
  id: string
  name: string
  filters: Record<string, unknown>
}): Collection => ({ id: c.id, name: c.name, filters: filtersIn(c.filters ?? {}) })

// ---------------------------------------------------------------------------------------------------------------
// Shopping, prep, pantry

interface ServerShoppingLine {
  key: string
  manual: boolean
  name: string
  toBuy: { text: string }[]
  unquantified: boolean
  have: { text: string }[]
  covered: boolean
  checked: boolean
  note: string | null
  sourcingNotes: string[]
}

export function adaptShopping(lines: ServerShoppingLine[]): ShoppingLine[] {
  return lines
    .filter((l) => l.manual || !l.covered)
    .map((l) => ({
      id: l.key,
      name: l.name,
      need: l.manual ? '' : l.toBuy.length ? l.toBuy.map((q) => q.text).join(' + ') : 'as needed',
      have: l.have.length ? l.have.map((h) => h.text).join(' + ') : undefined,
      note: [...l.sourcingNotes, l.note].filter(Boolean).join(' · ') || undefined,
      checked: l.checked,
      custom: l.manual || undefined,
    }))
}

interface ServerPrepDay {
  date: string
  holidays: string[]
  notes: string[]
  meals: { mealId: string; label: string }[]
  tasks: {
    mealId: string
    label: string
    dish: string
    kind: 'active' | 'passive' | 'setup'
    startText: string | null
    notes: string[]
  }[]
  flags: { text: string }[]
}

export function adaptPrep(days: ServerPrepDay[]): PrepDay[] {
  return days.map((d) => {
    const mealName = (id: string) => d.meals.find((m) => m.mealId === id)?.label ?? ''
    return {
      id: d.date,
      label: weekdayName(d.date),
      date: d.date,
      tasks: d.tasks.map((t, i) => ({
        id: `${d.date}-${i}`,
        time: clock12(t.startText),
        text:
          t.dish && !t.label.toLowerCase().includes(t.dish.toLowerCase())
            ? `${t.label} (${t.dish})`
            : t.label,
        mealName: mealName(t.mealId),
        passive: t.kind === 'passive' || undefined,
      })),
      note: [...d.notes, ...d.flags.map((f) => f.text)].join('. ') || undefined,
    }
  })
}

interface ServerPantry {
  today: string
  items: {
    id: string
    name: string
    display: string
    expiresOn: string | null
    effectiveExpiry: string | null
    expired: boolean
    expiringSoon: boolean
    heldFor: { name: string }[]
  }[]
}

export function adaptPantry(p: ServerPantry): PantryList {
  return {
    today: p.today,
    items: p.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.display,
      // The effective expiry is earlier for chametz before Pesach; that is the date that matters.
      expires: i.effectiveExpiry ?? i.expiresOn ?? undefined,
      heldFor: i.heldFor.length ? i.heldFor.map((h) => h.name).join(', ') : undefined,
      expired: i.expired,
      expiringSoon: i.expiringSoon,
    })),
  }
}
