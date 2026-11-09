/** Nutrition as stored on a recipe version (per serving, or for the whole recipe when `perServing` is false). */
export interface NutritionFacts {
  perServing?: boolean
  calories?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  fiberG?: number
  sugarG?: number
  sodiumMg?: number
  source?: 'ai' | 'user'
}

/** Per-serving figures; a field is undefined when unknown. */
export type ServingNutrition = Omit<NutritionFacts, 'perServing' | 'source'>

const FIELDS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg'] as const

/**
 * The figures for one serving. When the data is for the whole recipe (`perServing` false) it is divided by
 * `servings`; without servings that cannot be done, so everything is unknown (null).
 */
export function perServing(
  n: NutritionFacts | null | undefined,
  servings: number | null | undefined,
): ServingNutrition | null {
  if (!n) return null
  const whole = n.perServing === false
  if (whole && !(servings && servings > 0)) return null
  const div = whole ? (servings as number) : 1
  const out: ServingNutrition = {}
  for (const f of FIELDS) {
    const v = n[f]
    if (typeof v === 'number' && Number.isFinite(v)) out[f] = Math.round((v / div) * 10) / 10
  }
  return Object.keys(out).length ? out : null
}

/**
 * Plain-language goals as fixed thresholds per serving, so "high protein" means the same thing everywhere.
 * Protein and fiber follow common "high" labelling levels, rounded for a dish rather than a packaged food.
 */
export const NUTRITION_GOALS = {
  high_protein: { field: 'proteinG', min: 20 },
  high_fiber: { field: 'fiberG', min: 5 },
  low_calorie: { field: 'calories', max: 400 },
  low_carb: { field: 'carbsG', max: 20 },
  low_sodium: { field: 'sodiumMg', max: 400 },
  low_sugar: { field: 'sugarG', max: 5 },
} as const satisfies Record<string, { field: keyof ServingNutrition; min?: number; max?: number }>

export type NutritionGoal = keyof typeof NUTRITION_GOALS
export const NUTRITION_GOAL_NAMES = Object.keys(NUTRITION_GOALS) as NutritionGoal[]

export interface NutritionRange {
  minProteinG?: number
  minFiberG?: number
  maxCalories?: number
  maxCarbsG?: number
  maxSodiumMg?: number
  maxSugarG?: number
}

/** Goals plus explicit limits, as one list of per-serving bounds. Explicit limits win over a goal's threshold. */
export function nutritionBounds(
  goals: readonly NutritionGoal[] = [],
  range: NutritionRange = {},
): { field: keyof ServingNutrition; min?: number; max?: number }[] {
  const b = new Map<keyof ServingNutrition, { min?: number; max?: number }>()
  const put = (field: keyof ServingNutrition, k: 'min' | 'max', v: number) => {
    const cur = b.get(field) ?? {}
    cur[k] = v
    b.set(field, cur)
  }
  for (const g of goals) {
    const d: { field: keyof ServingNutrition; min?: number; max?: number } = NUTRITION_GOALS[g]
    if (d.min !== undefined) put(d.field, 'min', d.min)
    if (d.max !== undefined) put(d.field, 'max', d.max)
  }
  if (range.minProteinG !== undefined) put('proteinG', 'min', range.minProteinG)
  if (range.minFiberG !== undefined) put('fiberG', 'min', range.minFiberG)
  if (range.maxCalories !== undefined) put('calories', 'max', range.maxCalories)
  if (range.maxCarbsG !== undefined) put('carbsG', 'max', range.maxCarbsG)
  if (range.maxSodiumMg !== undefined) put('sodiumMg', 'max', range.maxSodiumMg)
  if (range.maxSugarG !== undefined) put('sugarG', 'max', range.maxSugarG)
  return [...b].map(([field, v]) => ({ field, ...v }))
}

/**
 * Whether one serving meets every bound. `unknown` means a bounded figure is missing, which is neither a pass
 * nor a fail: the caller drops those and says how many it dropped.
 */
export function meetsBounds(
  n: ServingNutrition | null,
  bounds: ReturnType<typeof nutritionBounds>,
): 'yes' | 'no' | 'unknown' {
  let unknown = false
  for (const { field, min, max } of bounds) {
    const v = n?.[field]
    if (v === undefined) {
      unknown = true
      continue
    }
    if (min !== undefined && v < min) return 'no'
    if (max !== undefined && v > max) return 'no'
  }
  return unknown ? 'unknown' : 'yes'
}

/** Which goals one serving meets (only goals whose figure is known). */
export function goalsMet(n: ServingNutrition | null): NutritionGoal[] {
  return NUTRITION_GOAL_NAMES.filter((g) => meetsBounds(n, nutritionBounds([g])) === 'yes')
}

export interface MealNutrition {
  /** What one person gets from one serving of every dish that has figures. */
  perPerson: ServingNutrition
  /** For each figure, the dishes that have no value for it (so the total for it is a floor, not the whole). */
  missing: Partial<Record<keyof ServingNutrition, string[]>>
}

/** A meal's nutrition for one person eating one serving of each dish. Dishes without figures are named, not guessed. */
export function mealNutrition(
  dishes: readonly { title: string; nutrition: ServingNutrition | null }[],
): MealNutrition {
  const perPerson: ServingNutrition = {}
  const missing: MealNutrition['missing'] = {}
  for (const f of FIELDS) {
    for (const d of dishes) {
      const v = d.nutrition?.[f]
      if (v === undefined) (missing[f] ??= []).push(d.title)
      else perPerson[f] = Math.round(((perPerson[f] ?? 0) + v) * 10) / 10
    }
  }
  return { perPerson, missing }
}

/**
 * The figures to store: always per serving, so editing a recipe's servings later never changes them. Whole-recipe
 * figures are divided by `servings` here; without servings that is impossible, so it returns null (the caller
 * rejects it). Per-serving figures pass through.
 */
export function normalizeNutrition(
  n: NutritionFacts,
  servings: number | null | undefined,
): NutritionFacts | null {
  const per = n.perServing === false ? perServing(n, servings) : perServing(n, 1)
  if (n.perServing === false && !per && FIELDS.some((f) => n[f] !== undefined)) return null
  return { ...per, perServing: true, ...(n.source && { source: n.source }) }
}

/**
 * Per-serving figures after the same dish is split into a different number of servings: the whole dish keeps its
 * total, so each serving gets `from / to` of what it had (4 to 8 servings halves them).
 */
export function resplitNutrition(n: NutritionFacts, from: number, to: number): NutritionFacts {
  const out: NutritionFacts = { perServing: true, ...(n.source && { source: n.source }) }
  const per = perServing(n, from)
  for (const f of FIELDS) {
    const v = per?.[f]
    if (v !== undefined) out[f] = Math.round(((v * from) / to) * 10) / 10
  }
  return out
}
