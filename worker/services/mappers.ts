// Database rows <-> @tavshil/core types. Core knows nothing about rows; everything that crosses the line is here.
import {
  PERIOD_NAMES,
  PERSON_RULES,
  SOURCING_STANDARDS,
  type ActiveWhen as CoreActiveWhen,
  type Constraint,
  type ConstraintTag,
  type DataSource,
  type DishIngredient,
  type DishVersion,
  type IngredientLine,
  type MeatDairy,
  type OccasionFit,
  type PeriodName,
} from '@tavshil/core'

import * as s from '../db/schema'
import { invalid, slugOf } from './ctx'
import { PERIOD_ALIASES, normalizeTag } from './translit'

export type ConstraintRow = typeof s.constraints.$inferSelect
export type IngredientRow = typeof s.ingredients.$inferSelect
export type LineRow = typeof s.ingredientLines.$inferSelect
export type VersionRow = typeof s.recipeVersions.$inferSelect
export type RecipeRow = typeof s.recipes.$inferSelect
export type DimensionRow = typeof s.dimensions.$inferSelect

// ---------------------------------------------------------------------------------------------------------------
// Constraints

/** `"Pesach"`, `{ period }`, `{ from, to }` or `{ range }` to the stored shape. */
export function parseActiveWhen(input: unknown): CoreActiveWhen {
  if (input === undefined || input === null || input === 'always') return { always: true }
  if (typeof input === 'string') {
    const key = input.trim().toLowerCase().replace(/[_-]+/g, ' ')
    const period = PERIOD_ALIASES[key]
    if (period) return { period: period as PeriodName }
    throw invalid(
      `Unknown period "${input}". Use always, ${PERIOD_NAMES.join(', ')}, or a { from, to } date range.`,
    )
  }
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    if (o.always) return { always: true }
    if (typeof o.period === 'string') return parseActiveWhen(o.period)
    const range = (o.range ?? o) as { from?: unknown; to?: unknown }
    if (typeof range.from === 'string' && typeof range.to === 'string') {
      if (range.to < range.from) throw invalid('Date range ends before it starts')
      return { range: { from: range.from, to: range.to } }
    }
  }
  throw invalid('Unrecognised active_when')
}

export function constraintTag(row: Pick<ConstraintRow, 'tagType' | 'tag'>): ConstraintTag {
  switch (row.tagType) {
    case 'allergen':
      return { type: 'allergen', value: row.tag }
    case 'ingredient':
      return { type: 'ingredient', value: row.tag }
    case 'diet':
      return { type: 'diet', value: row.tag as 'vegetarian' | 'vegan' | 'pescatarian' }
    case 'kashrut_dish':
      return { type: 'kashrut', value: row.tag }
    case 'kashrut_sourcing':
      return { type: 'sourcing', value: row.tag as (typeof SOURCING_STANDARDS)[number] }
  }
}

export function constraintToCore(row: ConstraintRow): Constraint {
  return {
    tag: constraintTag(row),
    kind: row.kind,
    severity: row.severity,
    activeWhen: row.activeWhen as CoreActiveWhen,
    ...(row.note && { note: row.note }),
    source: row.source,
  }
}

/** An opt-in combination or equipment rule as a (strict, always-on) constraint. */
export function ruleToCore(rule: string, source: Constraint['source'] = 'host'): Constraint {
  return {
    tag: { type: 'rule', value: rule as (typeof PERSON_RULES)[number] },
    kind: 'religious',
    severity: 'strict',
    activeWhen: { always: true },
    source,
  }
}

export const isKnownRule = (rule: string) => (PERSON_RULES as readonly string[]).includes(rule)

export function validateConstraintTag(tagType: string, tag: string): string {
  const t = normalizeTag(tagType, tag)
  if (!t) throw invalid('A constraint needs a tag')
  if (tagType === 'diet' && !['vegetarian', 'vegan', 'pescatarian'].includes(t))
    throw invalid('Diet must be vegetarian, vegan or pescatarian')
  if (tagType === 'kashrut_sourcing' && !(SOURCING_STANDARDS as readonly string[]).includes(t))
    throw invalid(`Sourcing standard must be one of ${SOURCING_STANDARDS.join(', ')}`)
  return t
}

// ---------------------------------------------------------------------------------------------------------------
// Ingredients and dishes

type Sourced = { source: s.FlagSource }

/** The weakest provenance among everything the catalog row claims: ai beats user beats seed. */
export function ingredientDataSource(ing: IngredientRow | null): DataSource {
  if (!ing) return 'ai'
  // No allergen data and no recorded source: nobody has checked it, so it is as unverified as AI data.
  if (!ing.allergens?.length && !Object.keys(ing.sources ?? {}).length) return 'ai'
  const all: Sourced[] = [
    ...(ing.allergens ?? []),
    ...Object.values(ing.flags ?? {}).filter((f): f is s.FlagValue => !!f),
    ...Object.values(ing.sources ?? {}).map((source) => ({ source })),
  ]
  if (all.some((x) => x.source === 'ai')) return 'ai'
  if (all.some((x) => x.source === 'user')) return 'user'
  return 'seed'
}

export const ingredientFlagList = (ing: IngredientRow | null): string[] =>
  Object.entries(ing?.flags ?? {})
    .filter(([, v]) => v?.value)
    .map(([k]) => k)

/** Flags the catalog row explicitly says do not apply: they stop core's name-based inference for that flag. */
export const ingredientFlagsOff = (ing: IngredientRow | null): string[] =>
  Object.entries(ing?.flags ?? {})
    .filter(([, v]) => v && !v.value)
    .map(([k]) => k)

export function toDishIngredient(line: LineRow, ing: IngredientRow | null): DishIngredient {
  return {
    name: ing?.name ?? line.originalText,
    ...(ing?.aliases?.length && { aliases: ing.aliases }),
    category: ing?.category ?? 'parve',
    allergens: (ing?.allergens ?? []).map((a) => a.tag),
    flags: ingredientFlagList(ing),
    ...(ingredientFlagsOff(ing).length && { flagsOff: ingredientFlagsOff(ing) }),
    dataSource: ingredientDataSource(ing),
    skipImpact: line.skipImpact,
  }
}

export const fitToCore = (fit: 'fine' | 'good' | 'especially'): OccasionFit =>
  fit === 'especially' ? 'especially_suited' : fit

export const fitFromInput = (fit: string): 'fine' | 'good' | 'especially' => {
  const f = fit.toLowerCase().replace(/[_\s-]+/g, ' ')
  if (f === 'fine' || f === 'good') return f
  if (f === 'especially' || f === 'especially suited') return 'especially'
  throw invalid(`fit must be fine, good or especially suited, got "${fit}"`)
}

export interface LoadedVersion {
  version: VersionRow
  recipe: RecipeRow
  lines: { line: LineRow; ingredient: IngredientRow | null }[]
  equipment: (typeof s.versionEquipment.$inferSelect)[]
  dims: { dimension: DimensionRow; fit: 'fine' | 'good' | 'especially' }[]
  /** Free-form keywords: as typed, and the folded key they match on. */
  tags: { tag: string; key: string }[]
}

/** Meat / dairy / parve of a version: as declared, else from its ingredients. */
export function versionKashrut(v: LoadedVersion): MeatDairy {
  if (v.version.category) return v.version.category
  const cats = v.lines.map((l) => l.ingredient?.category)
  if (cats.includes('meat')) return 'meat'
  if (cats.includes('dairy')) return 'dairy'
  return 'parve'
}

export function toDishVersion(v: LoadedVersion): DishVersion {
  const flags = Object.entries(v.version.flags ?? {})
    .filter(([, f]) => f?.value)
    .map(([k]) => k)
  return {
    id: v.version.id,
    recipeId: v.recipe.id,
    title:
      v.version.title && v.version.title !== v.recipe.title
        ? `${v.recipe.title} (${v.version.title})`
        : v.recipe.title,
    kashrut: versionKashrut(v),
    ...(v.version.course && { course: v.version.course }),
    ...(v.version.form && { form: v.version.form }),
    ingredients: v.lines.map((l) => toDishIngredient(l.line, l.ingredient)),
    ...(v.equipment.length && {
      equipment: v.equipment
        .filter((e) => e.designation)
        .map((e) => ({ name: e.item, designation: e.designation! })),
    }),
    ...(flags.length && { flags }),
    ...(v.version.difficulty && { difficulty: v.version.difficulty }),
    ...(v.dims.length && {
      occasionFit: Object.fromEntries(
        v.dims.map((d) => [slugOf(d.dimension.name), fitToCore(d.fit)]),
      ),
    }),
  }
}

/** A brought dish as core wants it: counts for the meal's kashrut, ingredients unknown. */
export function broughtToDish(item: typeof s.mealItems.$inferSelect): DishVersion {
  return {
    id: item.id,
    title: item.description ?? 'Brought dish',
    kashrut: item.kashrut ?? 'parve',
    ...(item.course && { course: item.course }),
    ingredients: [],
    brought: { by: item.broughtBy ?? 'a guest' },
  }
}

// Ingredient display categories (flour, sugar, liquid, ...) for per-category unit overrides, from the name.
const DISPLAY_CATEGORIES: [string, RegExp][] = [
  ['flour', /\b(flour|matzo? meal|matzah meal|cake meal|semolina|cornstarch|starch)\b/i],
  ['sugar', /\b(sugar|honey|syrup|molasses|stevia)\b/i],
  ['liquid', /\b(milk|water|oil|juice|wine|broth|stock|cream|vinegar|sauce|coffee|tea|seltzer)\b/i],
  [
    'spice',
    /\b(salt|pepper|cumin|paprika|cinnamon|turmeric|oregano|spice|garlic powder|za'?atar|nutmeg)\b/i,
  ],
]
export const displayCategory = (name: string): string | undefined =>
  DISPLAY_CATEGORIES.find(([, re]) => re.test(name))?.[0]

// The catalog has no "non-linear when scaled" field, so scaling warnings are keyed off the name (an adapter; core
// takes the hint as data).
export function nonLinearOf(name: string): 'leavening' | 'salt' | 'spice' | undefined {
  if (/\b(baking powder|baking soda|bicarbonate|yeast|leaven|cream of tartar)\b/i.test(name))
    return 'leavening'
  if (/\b(salt)\b/i.test(name)) return 'salt'
  if (
    /\b(cumin|paprika|cinnamon|turmeric|oregano|spice|cayenne|chili|chilli|pepper|nutmeg|clove|za'?atar|curry|ginger|cardamom|saffron)\b/i.test(
      name,
    )
  )
    return 'spice'
  return undefined
}

const UNIT_FROM_DB: Record<string, 'g' | 'ml' | 'piece'> = {
  g: 'g',
  ml: 'ml',
  piece: 'piece',
  pc: 'piece',
}
export const canonicalUnit = (u: string | null | undefined): 'g' | 'ml' | 'piece' =>
  UNIT_FROM_DB[u ?? ''] ?? 'piece'

export function toCoreLine(l: { line: LineRow; ingredient: IngredientRow | null }): IngredientLine {
  const name = l.ingredient?.name ?? l.line.originalText
  return {
    ingredientId: l.ingredient?.id ?? `line:${l.line.id}`,
    name,
    amount: l.line.quantityMetric ?? null,
    unit: canonicalUnit(l.line.unitMetric),
    original: l.line.originalText,
    ...(l.line.prepNote && { prepNote: l.line.prepNote }),
    skipImpact: l.line.skipImpact,
    ...(displayCategory(name) && { category: displayCategory(name) }),
    density: l.ingredient?.densityGPerMl ?? null,
    ...(nonLinearOf(name) && { nonLinear: nonLinearOf(name) }),
  }
}

/** SHA-256 over the content that makes a version what it is (for finding duplicates across households). */
export async function contentHash(content: unknown): Promise<string> {
  const text = JSON.stringify(content)
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
