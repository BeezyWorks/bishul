import { isActive } from './calendar'
import type {
  Constraint,
  ConstraintTag,
  DateString,
  DishIngredient,
  DishVersion,
  HouseholdLocation,
  MealKind,
  Minutes,
  Person,
  PersonRule,
  SkipImpact,
  SourcingStandard,
} from './types'

export const DISCLAIMER =
  "Bishul helps you avoid serving the wrong thing, but it is not a guarantee. It's on the host: check labels, " +
  'and confirm allergies with the guest.'

// ---------------------------------------------------------------------------
// Input

export interface DiningBriefInput {
  /** The host household's location: seasons (Pesach, ...) are resolved here. */
  location: HouseholdLocation
  date: DateString
  /** Meal time in minutes since midnight. Lets a period start or end mid-day (a seder after sunset). */
  time?: Minutes
  /** The meal's declared meat / dairy / parve kind. Otherwise derived from the selected dishes. */
  mealKind?: MealKind
  /**
   * Who is coming, with each person's constraints. Merge the host's private-layer additions in first
   * (`mergePrivateLayer`).
   */
  attendees: Person[]
  /** The host household's own persons (all of them, whether or not they are coming), for sourcing comparisons. */
  hostPersons: Person[]
  /** Dishes already on the menu (including brought dishes). */
  selected: DishVersion[]
  /** Dishes being considered for the picker. */
  candidates?: DishVersion[]
}

/** Adds the host's private-layer constraints to a contact (marked as the host's own). */
export function mergePrivateLayer(person: Person, hostAdditions: Constraint[]): Person {
  return {
    ...person,
    constraints: [
      ...person.constraints,
      ...hostAdditions.map((c) => ({ ...c, source: 'host' as const })),
    ],
  }
}

// ---------------------------------------------------------------------------
// Output

export interface ActiveConstraint {
  personId: string
  personName: string
  constraint: Constraint
  /** Medical and religious show as warnings, preferences as hints. */
  display: 'warning' | 'hint'
}

export interface Exclusion {
  dishId: string
  dishTitle: string
  personId: string
  personName: string
  tag: ConstraintTag
  /** Ingredient lines that triggered it (empty when the dish itself is flagged). */
  ingredients: string[]
  text: string
}

export type EatAroundVerdict = 'skip_ok' | 'skip_minor' | 'ruins' | 'unknown'

export interface EatAroundNote {
  dishId: string
  dishTitle: string
  personId: string
  personName: string
  tag: ConstraintTag
  ingredients: string[]
  verdict: EatAroundVerdict
  text: string
}

export interface RuleViolation {
  dishId: string
  dishTitle: string
  personId: string
  personName: string
  rule: PersonRule
  severity: 'strict' | 'flexible'
  text: string
}

export interface MealIssue {
  code:
    | 'meat_and_dairy'
    | 'meal_kind_mismatch'
    | 'dish_meat_and_dairy'
    | 'fish_and_dairy_in_meal'
    | 'fish_and_meat_in_meal'
    | 'equipment_at_meal'
  severity: 'error' | 'warning'
  dishIds: string[]
  personIds: string[]
  text: string
}

export interface SourcingNote {
  standard: SourcingStandard
  persons: { id: string; name: string }[]
  /** Ingredient lines on the menu this applies to. */
  ingredients: string[]
  dishIds: string[]
  text: string
}

export interface AiDataWarning {
  dishId: string
  dishTitle: string
  personId: string
  personName: string
  allergen: string
  /** Ingredients whose "no <allergen>" rests on AI-filled data. */
  ingredients: string[]
  text: string
}

export interface DishCheck {
  dishId: string
  dishTitle: string
  /** False when the dish should be hidden from the picker, with `reasons` saying why. */
  fits: boolean
  reasons: string[]
  exclusions: Exclusion[]
  eatAround: EatAroundNote[]
  ruleViolations: RuleViolation[]
  /** Problems the dish has on its own (meat and dairy ingredients in a single dish). */
  dishIssues: MealIssue[]
  /** Meal-level problems this dish would cause or is part of. */
  mealIssues: MealIssue[]
  aiWarnings: AiDataWarning[]
  /** A brought dish: its ingredients are not known, so nothing was checked. */
  unchecked: boolean
}

export interface DiningBrief {
  date: DateString
  /** Declared kind, else derived from the menu; null while undecided. */
  mealKind: MealKind | null
  attendees: { id: string; name: string }[]
  activeConstraints: ActiveConstraint[]
  hardExclusions: Exclusion[]
  eatAround: EatAroundNote[]
  /** Combination and equipment rule violations at dish level. */
  ruleViolations: RuleViolation[]
  /** Meal level: meat with dairy (always an error), fish with dairy and so on. */
  mealIssues: MealIssue[]
  sourcingNotes: SourcingNote[]
  aiWarnings: AiDataWarning[]
  /** Brought dishes that could not be checked against anyone's constraints. */
  uncheckedDishes: { dishId: string; title: string; by: string }[]
  /** Check for each selected dish, then each candidate. */
  dishes: DishCheck[]
  disclaimer: string
}

// ---------------------------------------------------------------------------
// Helpers

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function phraseIn(haystack: string, needle: string): boolean {
  const h = ` ${norm(haystack)} `
  const n = norm(needle)
  return n !== '' && (h.includes(` ${n} `) || h.includes(` ${n}s `) || h.includes(` ${n}es `))
}

function nameMatches(ing: DishIngredient, value: string): boolean {
  return [ing.name, ...(ing.aliases ?? [])].some((n) => phraseIn(n, value))
}

/**
 * Names that give an allergen away even when the catalog row has no allergen data (a new ingredient the AI or a
 * user created without filling it in). A safety net under the catalog's allergen list, never a replacement for it.
 */
const ALLERGEN_NAMES: Record<string, string[]> = {
  sesame: ['sesame', 'tahini', 'tahina', 'halva', 'halvah', 'zaatar', "za'atar", 'gomasio'],
  peanut: ['peanut', 'peanuts', 'groundnut', 'bamba'],
  'tree nuts': [
    'almond',
    'almonds',
    'walnut',
    'walnuts',
    'pecan',
    'pecans',
    'cashew',
    'cashews',
    'pistachio',
    'pistachios',
    'hazelnut',
    'hazelnuts',
    'macadamia',
    'brazil nut',
    'pine nut',
    'pine nuts',
    'marzipan',
    'praline',
    'nutella',
    'frangipane',
  ],
  egg: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue', 'aioli'],
  milk: [
    'milk',
    'butter',
    'cream',
    'cheese',
    'yogurt',
    'yoghurt',
    'ghee',
    'whey',
    'casein',
    'labneh',
  ],
  dairy: [
    'milk',
    'butter',
    'cream',
    'cheese',
    'yogurt',
    'yoghurt',
    'ghee',
    'whey',
    'casein',
    'labneh',
  ],
  fish: [
    'fish',
    'salmon',
    'tuna',
    'cod',
    'tilapia',
    'anchovy',
    'anchovies',
    'sardine',
    'sardines',
    'herring',
    'carp',
    'gefilte',
  ],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'soy sauce', 'tamari'],
  wheat: [
    'wheat',
    'flour',
    'bread',
    'breadcrumbs',
    'matzah',
    'matza',
    'couscous',
    'pasta',
    'semolina',
    'bulgur',
    'farina',
    'challah',
    'panko',
  ],
  gluten: [
    'wheat',
    'flour',
    'bread',
    'breadcrumbs',
    'matzah',
    'matza',
    'couscous',
    'pasta',
    'semolina',
    'bulgur',
    'barley',
    'rye',
    'spelt',
    'farina',
    'challah',
    'panko',
  ],
  mustard: ['mustard'],
  celery: ['celery', 'celeriac'],
}

function allergenNamed(ing: DishIngredient, allergen: string): boolean {
  const names = ALLERGEN_NAMES[allergen] ?? [allergen, allergen.replace(/s$/, '')]
  return names.some((n) => nameMatches(ing, n))
}

const IMPACT_RANK: Record<SkipImpact, number> = { none: 0, minor: 1, ruins: 2 }

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const unique = <T>(xs: T[]) => [...new Set(xs)]

const STANDARD_LABEL: Record<SourcingStandard, string> = {
  chalav_yisrael: 'chalav Yisrael',
  pat_yisrael: 'pat Yisrael',
  yashan: 'yashan',
  glatt: 'glatt',
}

/** The kinds of ingredient line each sourcing standard applies to. */
const SOURCING_TARGET: Record<SourcingStandard, (i: DishIngredient) => boolean> = {
  chalav_yisrael: (i) => i.category === 'dairy',
  glatt: (i) => i.category === 'meat',
  pat_yisrael: (i) => i.flags.includes('pat') || i.flags.includes('baked'),
  yashan: (i) => i.flags.includes('grain'),
}

const hasFish = (d: DishVersion) =>
  d.ingredients.some((i) => i.category === 'fish') || (d.flags ?? []).includes('fish')
const hasDairy = (d: DishVersion) =>
  d.kashrut === 'dairy' || d.ingredients.some((i) => i.category === 'dairy')
const hasMeat = (d: DishVersion) =>
  d.kashrut === 'meat' || d.ingredients.some((i) => i.category === 'meat')

function dishFlags(d: DishVersion): string[] {
  return unique([...(d.flags ?? []), ...d.ingredients.flatMap((i) => i.flags)])
}

/** Ingredient lines a (non-rule, non-sourcing) tag matches, and whether the dish itself carries the flag. */
function matchTag(
  dish: DishVersion,
  tag: ConstraintTag,
): { lines: DishIngredient[]; dishLevel: boolean } | null {
  const lines = (pred: (i: DishIngredient) => boolean) => {
    const l = dish.ingredients.filter(pred)
    return l.length ? { lines: l, dishLevel: false } : null
  }
  switch (tag.type) {
    case 'allergen': {
      const v = norm(tag.value)
      return lines((i) => i.allergens.some((a) => norm(a) === v) || allergenNamed(i, v))
    }
    case 'ingredient':
      return lines((i) => nameMatches(i, tag.value))
    case 'diet': {
      const meatish = (i: DishIngredient) =>
        i.category === 'meat' || i.flags.includes('meat_derived')
      if (tag.value === 'pescatarian') return lines(meatish)
      if (tag.value === 'vegetarian') return lines((i) => meatish(i) || i.category === 'fish')
      return lines(
        (i) =>
          meatish(i) ||
          i.category === 'fish' ||
          i.category === 'dairy' ||
          ['animal_derived', 'egg', 'honey'].some((f) => i.flags.includes(f)),
      )
    }
    case 'kashrut': {
      const ing = dish.ingredients.filter((i) => i.flags.includes(tag.value))
      const dishLevel = (dish.flags ?? []).includes(tag.value)
      return ing.length || dishLevel ? { lines: ing, dishLevel } : null
    }
    default:
      return null
  }
}

function tagLabel(tag: ConstraintTag): string {
  switch (tag.type) {
    case 'allergen':
      return `${tag.value} allergy`
    case 'ingredient':
      return `no ${tag.value}`
    case 'diet':
      return tag.value
    case 'kashrut':
      return tag.value
    case 'rule':
      return tag.value.replace(/_/g, ' ')
    case 'sourcing':
      return STANDARD_LABEL[tag.value]
  }
}

function describeMatch(tag: ConstraintTag, lines: DishIngredient[], dishLevel: boolean): string {
  const names = lines.map((l) => l.name)
  switch (tag.type) {
    case 'allergen':
      return `contains ${tag.value} (${listJoin(names)})`
    case 'ingredient':
      return `contains ${listJoin(names)}`
    case 'diet':
      return `is not ${tag.value} (${listJoin(names)})`
    case 'kashrut':
      return names.length
        ? `is flagged ${tag.value} (${listJoin(names)})`
        : `is flagged ${tag.value}`
    default:
      return dishLevel ? 'is flagged' : ''
  }
}

// ---------------------------------------------------------------------------
// The checker

interface Ctx {
  input: DiningBriefInput
  active: ActiveConstraint[]
}

function resolveActive(input: DiningBriefInput): ActiveConstraint[] {
  const out: ActiveConstraint[] = []
  for (const p of input.attendees) {
    for (const c of p.constraints) {
      if (!isActive(c.activeWhen, input.date, input.location, input.time)) continue
      out.push({
        personId: p.id,
        personName: p.name,
        constraint: c,
        display: c.kind === 'preference' ? 'hint' : 'warning',
      })
    }
  }
  return out
}

/** Meat, dairy or parve for a meal: declared, else from what is on the menu (meat and dairy together: null). */
function effectiveKind(declared: MealKind | undefined, dishes: DishVersion[]): MealKind | null {
  if (declared) return declared
  const meat = dishes.some((d) => d.kashrut === 'meat')
  const dairy = dishes.some((d) => d.kashrut === 'dairy')
  if (meat && dairy) return null
  if (meat) return 'meat'
  if (dairy) return 'dairy'
  return dishes.length ? 'parve' : null
}

const rulesOf = (ctx: Ctx, rule: PersonRule) =>
  ctx.active.filter((a) => a.constraint.tag.type === 'rule' && a.constraint.tag.value === rule)

function dishLevelChecks(ctx: Ctx, dish: DishVersion, kind: MealKind | null) {
  const exclusions: Exclusion[] = []
  const eatAround: EatAroundNote[] = []
  const ruleViolations: RuleViolation[] = []
  const aiWarnings: AiDataWarning[] = []
  const dishIssues: MealIssue[] = []

  if (dish.brought) return { exclusions, eatAround, ruleViolations, aiWarnings, dishIssues }

  if (
    dish.ingredients.some((i) => i.category === 'meat') &&
    dish.ingredients.some((i) => i.category === 'dairy')
  ) {
    dishIssues.push({
      code: 'dish_meat_and_dairy',
      severity: 'error',
      dishIds: [dish.id],
      personIds: [],
      text: `${dish.title} has both meat and dairy ingredients`,
    })
  }

  for (const a of ctx.active) {
    const { constraint: c, personId, personName } = a
    const tag = c.tag
    if (tag.type === 'sourcing') continue

    if (tag.type === 'rule') {
      const text = ruleText(tag.value, dish, kind)
      if (text)
        ruleViolations.push({
          dishId: dish.id,
          dishTitle: dish.title,
          personId,
          personName,
          rule: tag.value,
          severity: c.severity,
          text: `${personName} (${tagLabel(tag)}): ${text}`,
        })
      continue
    }

    const m = matchTag(dish, tag)
    if (m) {
      const names = m.lines.map((l) => l.name)
      if (c.severity === 'strict') {
        exclusions.push({
          dishId: dish.id,
          dishTitle: dish.title,
          personId,
          personName,
          tag,
          ingredients: names,
          text: `${personName} (${tagLabel(tag)}): ${dish.title} ${describeMatch(tag, m.lines, m.dishLevel)}`,
        })
      } else {
        const worst = m.lines.reduce<SkipImpact | null>(
          (w, l) => (w === null || IMPACT_RANK[l.skipImpact] > IMPACT_RANK[w] ? l.skipImpact : w),
          null,
        )
        const verdict: EatAroundVerdict =
          worst === null
            ? 'unknown'
            : worst === 'none'
              ? 'skip_ok'
              : worst === 'minor'
                ? 'skip_minor'
                : 'ruins'
        const what = names.length ? listJoin(names) : 'the flagged part'
        const text =
          verdict === 'skip_ok'
            ? `${personName} can skip the ${what}`
            : verdict === 'skip_minor'
              ? `${personName} can skip the ${what} with a minor loss`
              : verdict === 'ruins'
                ? `${personName} can't skip the ${what} without ruining ${dish.title}`
                : `${personName} would have to avoid ${dish.title}'s ${what}; skipping it is not rated`
        eatAround.push({
          dishId: dish.id,
          dishTitle: dish.title,
          personId,
          personName,
          tag,
          ingredients: names,
          verdict,
          text,
        })
      }
    } else if (tag.type === 'allergen' && c.severity === 'strict') {
      // It passes. Say so loudly where that rests on AI-filled data.
      const ai = dish.ingredients.filter((i) => i.dataSource === 'ai').map((i) => i.name)
      if (ai.length)
        aiWarnings.push({
          dishId: dish.id,
          dishTitle: dish.title,
          personId,
          personName,
          allergen: tag.value,
          ingredients: ai,
          text: `${personName} (${tag.value} allergy): ${dish.title} passes, but the allergen data for ${listJoin(ai)} was filled in by AI. Check the labels.`,
        })
    }
  }
  return { exclusions, eatAround, ruleViolations, aiWarnings, dishIssues }
}

function ruleText(rule: PersonRule, dish: DishVersion, kind: MealKind | null): string | null {
  switch (rule) {
    case 'no_fish_dairy':
      return hasFish(dish) && hasDairy(dish) ? `${dish.title} combines fish and dairy` : null
    case 'no_fish_meat':
      return hasFish(dish) && hasMeat(dish) ? `${dish.title} combines fish and meat` : null
    case 'no_parve_from_dairy_at_meat': {
      const eq = (dish.equipment ?? []).filter((e) => e.designation === 'dairy')
      return dish.kashrut === 'parve' && kind === 'meat' && eq.length
        ? `${dish.title} is parve but uses dairy equipment (${listJoin(eq.map((e) => e.name))}) at a meat meal`
        : null
    }
    case 'no_parve_from_meat_at_dairy': {
      const eq = (dish.equipment ?? []).filter((e) => e.designation === 'meat')
      return dish.kashrut === 'parve' && kind === 'dairy' && eq.length
        ? `${dish.title} is parve but uses meat equipment (${listJoin(eq.map((e) => e.name))}) at a dairy meal`
        : null
    }
    case 'pesach_equipment_only': {
      const eq = (dish.equipment ?? []).filter((e) => e.designation !== 'pesach')
      return eq.length
        ? `${dish.title} uses equipment not kept for Pesach (${listJoin(eq.map((e) => e.name))})`
        : null
    }
  }
}

/** Problems with a set of dishes served together. */
function mealLevelIssues(
  ctx: Ctx,
  dishes: DishVersion[],
  declared: MealKind | undefined,
): MealIssue[] {
  const issues: MealIssue[] = []
  const meat = dishes.filter((d) => d.kashrut === 'meat')
  const dairy = dishes.filter((d) => d.kashrut === 'dairy')
  if (meat.length && dairy.length) {
    issues.push({
      code: 'meat_and_dairy',
      severity: 'error',
      dishIds: [...meat, ...dairy].map((d) => d.id),
      personIds: [],
      text: `Meat (${listJoin(meat.map((d) => d.title))}) and dairy (${listJoin(dairy.map((d) => d.title))}) in the same meal`,
    })
  }
  if (declared && declared !== 'parve') {
    const wrong = dishes.filter((d) => d.kashrut !== 'parve' && d.kashrut !== declared)
    if (wrong.length) {
      issues.push({
        code: 'meal_kind_mismatch',
        severity: 'error',
        dishIds: wrong.map((d) => d.id),
        personIds: [],
        text: `This is a ${declared} meal but ${listJoin(wrong.map((d) => `${d.title} (${d.kashrut})`))} ${wrong.length === 1 ? 'is' : 'are'} not`,
      })
    }
  } else if (declared === 'parve') {
    const wrong = dishes.filter((d) => d.kashrut !== 'parve')
    if (wrong.length)
      issues.push({
        code: 'meal_kind_mismatch',
        severity: 'error',
        dishIds: wrong.map((d) => d.id),
        personIds: [],
        text: `This is a parve meal but ${listJoin(wrong.map((d) => `${d.title} (${d.kashrut})`))} ${wrong.length === 1 ? 'is' : 'are'} not`,
      })
  }

  const checked = dishes
  const pairIssue = (
    rule: PersonRule,
    code: MealIssue['code'],
    left: (d: DishVersion) => boolean,
    right: (d: DishVersion) => boolean,
    label: string,
  ) => {
    const who = rulesOf(ctx, rule)
    if (!who.length) return
    const a = checked.filter(left)
    const b = checked.filter(right)
    // Only different dishes: one dish holding both is a dish-level violation already.
    const pairs = a.flatMap((x) => b.filter((y) => y.id !== x.id).map((y) => [x, y] as const))
    if (!pairs.length) return
    const dishIds = unique(pairs.flatMap(([x, y]) => [x.id, y.id]))
    const strict = who.filter((w) => w.constraint.severity === 'strict')
    const group = strict.length ? strict : who
    issues.push({
      code,
      severity: strict.length ? 'error' : 'warning',
      dishIds,
      personIds: group.map((w) => w.personId),
      text: `${listJoin(group.map((w) => w.personName))} ${group.length === 1 ? "doesn't" : "don't"} eat ${label}, and this meal has both (${listJoin(
        unique(pairs.flatMap(([x, y]) => [x.title, y.title])),
      )})`,
    })
  }
  pairIssue('no_fish_dairy', 'fish_and_dairy_in_meal', hasFish, hasDairy, 'fish with dairy')
  pairIssue('no_fish_meat', 'fish_and_meat_in_meal', hasFish, hasMeat, 'fish with meat')

  // Equipment rules depend on the meal's kind.
  const kind = effectiveKind(declared, dishes)
  for (const d of dishes) {
    for (const rule of [
      'no_parve_from_dairy_at_meat',
      'no_parve_from_meat_at_dairy',
      'pesach_equipment_only',
    ] as const) {
      const text = d.brought ? null : ruleText(rule, d, kind)
      const who = rulesOf(ctx, rule)
      if (!text || !who.length) continue
      const strict = who.filter((w) => w.constraint.severity === 'strict')
      const group = strict.length ? strict : who
      issues.push({
        code: 'equipment_at_meal',
        severity: strict.length ? 'error' : 'warning',
        dishIds: [d.id],
        personIds: group.map((w) => w.personId),
        text: `${listJoin(group.map((w) => w.personName))}: ${text}`,
      })
    }
  }
  return issues
}

const issueKey = (i: MealIssue) =>
  `${i.code}|${[...i.dishIds].sort().join(',')}|${[...i.personIds].sort().join(',')}`

export interface DishChecker {
  /** Full check of one dish against everyone coming, in the context of the dishes already selected. */
  check(dish: DishVersion): DishCheck
  /** Whether the picker should show the dish. */
  fits(dish: DishVersion): boolean
  activeConstraints: ActiveConstraint[]
}

/** Prepares a dish checker for a meal. `fitsDish` for the picker is `createDishChecker(input).fits`. */
export function createDishChecker(input: DiningBriefInput): DishChecker {
  const ctx: Ctx = { input, active: resolveActive(input) }
  const baseline = mealLevelIssues(ctx, input.selected, input.mealKind)
  const baselineKeys = new Set(baseline.map(issueKey))
  const selectedIds = new Set(input.selected.map((d) => d.id))

  const check = (dish: DishVersion): DishCheck => {
    const inMenu = selectedIds.has(dish.id)
    const withDish = inMenu ? input.selected : [...input.selected, dish]
    const kind = effectiveKind(input.mealKind, withDish)
    const d = dishLevelChecks(ctx, dish, kind)
    // For a dish already on the menu, its meal-level problems are the baseline ones it takes part in; for a
    // candidate, the new problems it would cause.
    const mealIssues = inMenu
      ? baseline.filter((i) => i.dishIds.includes(dish.id))
      : mealLevelIssues(ctx, withDish, input.mealKind).filter((i) => !baselineKeys.has(issueKey(i)))
    const hard = d.ruleViolations.filter((v) => v.severity === 'strict')
    const reasons = [
      ...d.exclusions.map((e) => e.text),
      ...hard.map((v) => v.text),
      ...d.dishIssues.map((i) => i.text),
      ...mealIssues.filter((i) => i.severity === 'error').map((i) => i.text),
    ]
    return {
      dishId: dish.id,
      dishTitle: dish.title,
      fits: reasons.length === 0,
      reasons,
      exclusions: d.exclusions,
      eatAround: d.eatAround,
      ruleViolations: d.ruleViolations,
      dishIssues: d.dishIssues,
      mealIssues,
      aiWarnings: d.aiWarnings,
      unchecked: !!dish.brought,
    }
  }
  return { check, fits: (dish) => check(dish).fits, activeConstraints: ctx.active }
}

// ---------------------------------------------------------------------------
// Sourcing

function sourcingNotes(input: DiningBriefInput, active: ActiveConstraint[]): SourcingNote[] {
  const hostKeeps = new Set<SourcingStandard>()
  for (const p of input.hostPersons)
    for (const c of p.constraints)
      if (
        c.tag.type === 'sourcing' &&
        isActive(c.activeWhen, input.date, input.location, input.time)
      )
        hostKeeps.add(c.tag.value)

  const hostIds = new Set(input.hostPersons.map((p) => p.id))
  const notes: SourcingNote[] = []
  for (const standard of Object.keys(STANDARD_LABEL) as SourcingStandard[]) {
    if (hostKeeps.has(standard)) continue
    const persons = active
      .filter(
        (a) =>
          a.constraint.tag.type === 'sourcing' &&
          a.constraint.tag.value === standard &&
          !hostIds.has(a.personId),
      )
      .map((a) => ({ id: a.personId, name: a.personName }))
    if (!persons.length) continue
    const lines = input.selected.flatMap((d) =>
      d.brought
        ? []
        : d.ingredients
            .filter(SOURCING_TARGET[standard])
            .map((i) => ({ dishId: d.id, name: i.name })),
    )
    const ingredients = unique(lines.map((l) => l.name))
    const who = listJoin(
      unique(persons.map((p) => p.id)).map((id) => persons.find((p) => p.id === id)!.name),
    )
    notes.push({
      standard,
      persons: unique(persons.map((p) => p.id)).map((id) => persons.find((p) => p.id === id)!),
      ingredients,
      dishIds: unique(lines.map((l) => l.dishId)),
      text: ingredients.length
        ? `${who} keep${persons.length === 1 ? 's' : ''} ${STANDARD_LABEL[standard]}: buy ${STANDARD_LABEL[standard]} ${listJoin(ingredients)}`
        : `${who} keep${persons.length === 1 ? 's' : ''} ${STANDARD_LABEL[standard]}: buy ${STANDARD_LABEL[standard]} where it applies`,
    })
  }
  return notes
}

// ---------------------------------------------------------------------------
// The brief

export function buildDiningBrief(input: DiningBriefInput): DiningBrief {
  const checker = createDishChecker(input)
  const all = [
    ...input.selected,
    ...(input.candidates ?? []).filter((c) => !input.selected.some((s) => s.id === c.id)),
  ]
  const dishes = all.map(checker.check)
  const active = checker.activeConstraints
  const selectedChecks = dishes.slice(0, input.selected.length)

  const hasRestriction = active.some(
    (a) => a.constraint.tag.type !== 'sourcing' && a.constraint.severity === 'strict',
  )
  return {
    date: input.date,
    mealKind: effectiveKind(input.mealKind, input.selected),
    attendees: input.attendees.map((p) => ({ id: p.id, name: p.name })),
    activeConstraints: active,
    hardExclusions: dishes.flatMap((d) => d.exclusions),
    eatAround: dishes.flatMap((d) => d.eatAround),
    ruleViolations: dishes.flatMap((d) => d.ruleViolations),
    mealIssues: [
      ...selectedChecks.flatMap((d) => d.dishIssues),
      ...mealLevelIssues({ input, active }, input.selected, input.mealKind),
    ],
    sourcingNotes: sourcingNotes(input, active),
    aiWarnings: dishes.flatMap((d) => d.aiWarnings),
    uncheckedDishes: hasRestriction
      ? input.selected
          .filter((d) => d.brought)
          .map((d) => ({ dishId: d.id, title: d.title, by: d.brought!.by }))
      : [],
    dishes,
    disclaimer: DISCLAIMER,
  }
}
