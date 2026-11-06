import {
  createDishChecker,
  formatQuantity,
  parseQuantity,
  scaleLines,
  toCanonical,
  type DisplayPrefs,
  type Quantity,
} from '@bishul/core'
import { todayIn } from '@beitecha/engine'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  Catalog,
  ensureIngredient,
  findDimension,
  ingredientView,
  loadCatalog,
  setVersionFit,
  type IngredientMeta,
} from './catalog'
import {
  batch,
  conflict,
  inChunks,
  insertMany,
  invalid,
  notFound,
  slugOf,
  ulid,
  unique,
  type Actor,
  type Db,
} from './ctx'
import { householdLocation } from './households'
import {
  contentHash,
  fitFromInput,
  ingredientDataSource,
  toCoreLine,
  toDishVersion,
  versionKashrut,
  type IngredientRow,
  type LoadedVersion,
} from './mappers'
import { loadEffectivePeople, householdPersonIds } from './people'
import { getPrefs } from './prefs'
import { wordVariants } from './translit'

// ---------------------------------------------------------------------------------------------------------------
// Loading

/** Versions (with recipe, lines, ingredients, equipment, dimensions) of this household, by version id. */
export async function loadVersions(
  db: Db,
  householdId: string,
  versionIds: string[],
): Promise<Map<string, LoadedVersion>> {
  const rows = await inChunks(versionIds, (part) =>
    db
      .select({ version: s.recipeVersions, recipe: s.recipes })
      .from(s.recipeVersions)
      .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
      .where(
        and(
          inArray(s.recipeVersions.id, part),
          eq(s.recipes.householdId, householdId),
          isNull(s.recipeVersions.deletedAt),
          isNull(s.recipes.deletedAt),
        ),
      ),
  )
  return hydrate(db, householdId, rows)
}

async function hydrate(
  db: Db,
  householdId: string,
  rows: { version: LoadedVersion['version']; recipe: LoadedVersion['recipe'] }[],
): Promise<Map<string, LoadedVersion>> {
  const ids = rows.map((r) => r.version.id)
  const lines = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.ingredientLines)
      .where(and(inArray(s.ingredientLines.versionId, part), isNull(s.ingredientLines.deletedAt)))
      .orderBy(asc(s.ingredientLines.position)),
  )
  const equipment = await inChunks(ids, (part) =>
    db
      .select()
      .from(s.versionEquipment)
      .where(
        and(inArray(s.versionEquipment.versionId, part), isNull(s.versionEquipment.deletedAt)),
      ),
  )
  const vdims = await inChunks(ids, (part) =>
    db
      .select({ vd: s.versionDimensions, dimension: s.dimensions })
      .from(s.versionDimensions)
      .innerJoin(s.dimensions, eq(s.dimensions.id, s.versionDimensions.dimensionId))
      .where(
        and(
          inArray(s.versionDimensions.versionId, part),
          isNull(s.versionDimensions.deletedAt),
          isNull(s.dimensions.deletedAt),
        ),
      ),
  )
  const ingIds = unique(lines.map((l) => l.ingredientId).filter((x): x is string => !!x))
  const ings = await inChunks(ingIds, (part) =>
    db.select().from(s.ingredients).where(inArray(s.ingredients.id, part)),
  )
  void householdId
  const ingById = new Map(ings.map((i) => [i.id, i]))
  const out = new Map<string, LoadedVersion>()
  for (const r of rows) {
    out.set(r.version.id, {
      version: r.version,
      recipe: r.recipe,
      lines: lines
        .filter((l) => l.versionId === r.version.id)
        .map((l) => ({
          line: l,
          ingredient: l.ingredientId ? (ingById.get(l.ingredientId) ?? null) : null,
        })),
      equipment: equipment.filter((e) => e.versionId === r.version.id),
      dims: vdims
        .filter((d) => d.vd.versionId === r.version.id)
        .map((d) => ({ dimension: d.dimension, fit: d.vd.fit })),
    })
  }
  return out
}

/** Every live version of the household (the candidate pool for suggestions). */
export async function loadAllVersions(db: Db, householdId: string): Promise<LoadedVersion[]> {
  const rows = await db
    .select({ version: s.recipeVersions, recipe: s.recipes })
    .from(s.recipeVersions)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .where(
      and(
        eq(s.recipes.householdId, householdId),
        isNull(s.recipeVersions.deletedAt),
        isNull(s.recipes.deletedAt),
      ),
    )
    .limit(1500)
  return [...(await hydrate(db, householdId, rows)).values()]
}

export async function requireVersion(
  db: Db,
  actor: Actor,
  versionId: string,
): Promise<LoadedVersion> {
  const v = (await loadVersions(db, actor.householdId, [versionId])).get(versionId)
  if (!v) throw notFound('Recipe version')
  return v
}

// ---------------------------------------------------------------------------------------------------------------
// Views

/** What Pesach means for a version: chametz rules it out; kitniyot is listed separately (custom varies). */
export function pesachCheck(v: LoadedVersion) {
  const chametz: string[] = []
  const kitniyot: string[] = []
  const unverified: string[] = []
  for (const l of v.lines) {
    const name = l.ingredient?.name ?? l.line.originalText
    const flags = l.ingredient?.flags ?? {}
    if (flags.chametz?.value) chametz.push(name)
    if (flags.kitniyot?.value) kitniyot.push(name)
    if (!l.ingredient || ingredientDataSource(l.ingredient) === 'ai') unverified.push(name)
  }
  const handFlags = v.version.flags ?? {}
  if (handFlags.chametz?.value) chametz.push('(marked chametz)')
  if (handFlags.kitniyot?.value) kitniyot.push('(marked kitniyot)')
  return {
    friendly: chametz.length === 0,
    chametz: unique(chametz),
    kitniyot: unique(kitniyot),
    /** Ingredients whose flags are AI-filled or unknown: check labels before relying on this. */
    unverified: unique(unverified),
  }
}

export function versionView(v: LoadedVersion, prefs?: DisplayPrefs) {
  const x = v.version
  return {
    id: x.id,
    recipeId: v.recipe.id,
    recipeTitle: v.recipe.title,
    title: x.title,
    description: x.description,
    sourceLinks: x.sourceLinks ?? [],
    servings: x.servings,
    course: x.course,
    form: x.form,
    kashrut: versionKashrut(v),
    kashrutDeclared: x.category,
    difficulty: x.difficulty,
    activeMinutes: x.activeMinutes,
    totalMinutes: x.totalMinutes,
    servingStyle: x.servingStyle,
    holdsOnBlech: x.holdsOnBlech,
    easyToDeliver: x.easyToDeliver,
    cost: x.cost,
    nutrition: x.nutrition,
    prePrep: x.prePrep ?? [],
    steps: x.steps ?? [],
    flags: x.flags ?? {},
    equipment: v.equipment.map((e) => ({ item: e.item, designation: e.designation })),
    dimensions: v.dims.map((d) => ({
      id: d.dimension.id,
      name: d.dimension.name,
      slug: slugOf(d.dimension.name),
      fit: d.fit,
    })),
    ingredients: v.lines.map(({ line, ingredient }) => {
      const q =
        line.quantityMetric !== null
          ? ({
              amount: line.quantityMetric,
              unit: (line.unitMetric ?? 'piece') as Quantity['unit'],
              approx: false,
            } satisfies Quantity)
          : null
      return {
        id: line.id,
        position: line.position,
        section: line.section,
        original: line.originalText,
        quantity: q && { amount: q.amount, unit: q.unit },
        display: q
          ? formatQuantity(q, prefs ?? { system: 'us' }, {
              category: toCoreLine({ line, ingredient }).category,
              density: ingredient?.densityGPerMl ?? null,
            }).text
          : null,
        name: ingredient?.name ?? line.originalText,
        ingredient: ingredient ? ingredientView(ingredient) : null,
        prepNote: line.prepNote,
        skipImpact: line.skipImpact,
        substitutions: line.substitutions ?? [],
      }
    }),
    pesach: pesachCheck(v),
    parentVersionId: x.parentVersionId,
    lineageId: x.lineageId,
    contentHash: x.contentHash,
    updatedAt: x.updatedAt,
    createdAt: x.createdAt,
  }
}

export type VersionView = ReturnType<typeof versionView>

export async function getVersion(db: Db, actor: Actor, versionId: string) {
  const v = await requireVersion(db, actor, versionId)
  const prefs = await getPrefs(db, actor)
  const all = await db
    .select({ id: s.recipeVersions.id, title: s.recipeVersions.title })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.recipeId, v.recipe.id), isNull(s.recipeVersions.deletedAt)))
  return {
    recipe: { id: v.recipe.id, title: v.recipe.title, ownerUserId: v.recipe.ownerUserId },
    version: versionView(v, prefs.display),
    siblings: all.filter((a) => a.id !== versionId),
  }
}

export async function getRecipe(db: Db, actor: Actor, recipeId: string) {
  const [recipe] = await db
    .select()
    .from(s.recipes)
    .where(
      and(
        eq(s.recipes.id, recipeId),
        eq(s.recipes.householdId, actor.householdId),
        isNull(s.recipes.deletedAt),
      ),
    )
  if (!recipe) throw notFound('Recipe')
  const vrows = await db
    .select()
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.recipeId, recipeId), isNull(s.recipeVersions.deletedAt)))
    .orderBy(asc(s.recipeVersions.createdAt))
  const loaded = await loadVersions(
    db,
    actor.householdId,
    vrows.map((v) => v.id),
  )
  const prefs = await getPrefs(db, actor)
  return {
    id: recipe.id,
    title: recipe.title,
    ownerUserId: recipe.ownerUserId,
    versions: vrows.map((v) => versionView(loaded.get(v.id)!, prefs.display)),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Input

export interface IngredientInput {
  /** As written: "2 cups flour, sifted". Parsed when `name` is not given. */
  text?: string
  name?: string
  quantity?: number | string
  unit?: string
  prepNote?: string
  skipImpact?: 'none' | 'minor' | 'ruins'
  substitutions?: { text: string; note?: string }[]
  /** The part of the recipe it belongs to ("Cake", "Chocolate Mousse > Meringue"). Omit for a one-part recipe. */
  section?: string | null
  /** Data for the catalog if this ingredient is new (category, allergens, flags, density). */
  ingredient?: IngredientMeta
}

export type StepInput = string | { text: string; timerMinutes?: number; section?: string | null }

/** Section names are trimmed, tidied and joined with " > " for nesting; empty means no section. */
export function cleanSection(section: string | null | undefined): string | null {
  const parts = (section ?? '')
    .split(/\s*>\s*/)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return parts.length ? parts.join(' > ') : null
}

export interface VersionInput {
  title?: string
  description?: string | null
  sourceLinks?: { url: string; label?: string }[]
  servings?: number | null
  course?: string | null
  form?: string | null
  category?: 'meat' | 'dairy' | 'parve' | null
  difficulty?: 'easy' | 'average' | 'a_pain' | null
  activeMinutes?: number | null
  totalMinutes?: number | null
  servingStyle?: 'hot' | 'room_temperature' | 'cold' | null
  holdsOnBlech?: boolean | null
  easyToDeliver?: boolean | null
  cost?: number | null
  nutrition?: s.Nutrition | null
  prePrep?: { step: string; leadMinutes: number }[]
  steps?: StepInput[]
  flags?: Record<string, boolean>
  equipment?: { item: string; designation?: 'meat' | 'dairy' | 'parve' | 'pesach' | null }[]
  dimensions?: { dimension: string; fit: string }[]
  ingredients?: IngredientInput[]
}

const SCALAR_FIELDS = [
  'description',
  'servings',
  'course',
  'form',
  'category',
  'difficulty',
  'activeMinutes',
  'totalMinutes',
  'servingStyle',
  'holdsOnBlech',
  'easyToDeliver',
  'cost',
  'nutrition',
] as const

/** Stored shape for the JSON-ish fields of a version input. */
function versionPatch(
  input: VersionInput,
  source: s.FlagSource,
): Partial<typeof s.recipeVersions.$inferInsert> {
  const p: Record<string, unknown> = {}
  for (const k of SCALAR_FIELDS) if (input[k] !== undefined) p[k] = input[k]
  if (input.title !== undefined) p.title = input.title
  if (input.sourceLinks !== undefined) p.sourceLinks = input.sourceLinks
  if (input.prePrep !== undefined)
    p.prePrep = input.prePrep.map((x) => ({ step: x.step, lead_minutes: x.leadMinutes }))
  if (input.steps !== undefined)
    p.steps = input.steps.map((x) => {
      if (typeof x === 'string') return { text: x.trim() }
      const section = cleanSection(x.section)
      return {
        text: x.text.trim(),
        ...(x.timerMinutes && { timer_minutes: x.timerMinutes }),
        ...(section && { section }),
      }
    })
  if (input.flags !== undefined)
    p.flags = Object.fromEntries(
      Object.entries(input.flags).map(([k, v]) => [slugOf(k), { value: v, source }]),
    )
  if (typeof p.cost === 'number' && (p.cost < 1 || p.cost > 3))
    throw invalid('cost is 1, 2 or 3 ($, $$, $$$)')
  return p as Partial<typeof s.recipeVersions.$inferInsert>
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing ingredient lines (forgiving)

const ADJECTIVES =
  /^(?:large|medium|small|extra[- ]large|big|heaping|heaped|level|scant|packed|fresh|freshly|good|ripe|cold|warm)\s+/i

export interface ParsedLine {
  name: string
  originalText: string
  quantityMetric: number | null
  unitMetric: 'g' | 'ml' | 'piece' | null
  prepNote: string | null
  skipImpact: 'none' | 'minor' | 'ruins'
}

function inferSkipImpact(text: string): 'none' | 'minor' | 'ruins' {
  if (/\b(optional|garnish|for serving|for garnish|if desired|to serve)\b/i.test(text))
    return 'none'
  if (/\b(to taste|pinch|dash|for dusting|for greasing|for frying)\b/i.test(text)) return 'minor'
  return 'ruins'
}

function splitName(rest: string): { name: string; prep: string | null } {
  let r = rest.trim()
  const paren: string[] = []
  r = r.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    paren.push(inner.trim())
    return ' '
  })
  r = r.replace(/\s+/g, ' ').trim()
  const [head, ...tail] = r.split(/,\s*|\s+-\s+|;\s*/)
  let name = (head ?? '').trim()
  while (ADJECTIVES.test(name)) name = name.replace(ADJECTIVES, '')
  name = name.replace(/\s+(?:to taste|as needed|optional)$/i, '').trim()
  const prep = [...tail.map((t) => t.trim()), ...paren].filter(Boolean).join(', ')
  return { name, prep: prep || null }
}

/** One ingredient line as an AI or a person would paste it. */
export function parseIngredient(input: IngredientInput): ParsedLine {
  if (input.name) {
    const text =
      input.text ??
      [input.quantity ?? '', input.unit ?? '', input.name].filter((x) => x !== '').join(' ')
    let q: { amount: number; unit: 'g' | 'ml' | 'piece' } | null = null
    if (input.quantity !== undefined && input.quantity !== '') {
      const amount =
        typeof input.quantity === 'number'
          ? input.quantity
          : (parseQuantity(String(input.quantity))?.amount ?? Number.NaN)
      if (Number.isFinite(amount)) {
        const canon = input.unit ? toCanonical(amount, input.unit) : null
        q = canon ? { amount: canon.amount, unit: canon.unit } : { amount, unit: 'piece' }
      }
    }
    const { name, prep } = splitName(input.name)
    return {
      name: name || input.name,
      originalText: text.trim(),
      quantityMetric: q?.amount ?? null,
      unitMetric: q?.unit ?? null,
      prepNote: input.prepNote ?? prep,
      skipImpact: input.skipImpact ?? inferSkipImpact(text),
    }
  }
  const text = (input.text ?? '').trim().replace(/^[-*••]\s*/, '')
  if (!text) throw invalid('An ingredient needs text or a name')
  const parsed = parseQuantity(text)
  const { name, prep } = splitName(parsed ? parsed.rest : text)
  return {
    name: name || text,
    originalText: text,
    quantityMetric: parsed?.amount ?? null,
    unitMetric: parsed?.unit ?? null,
    prepNote: input.prepNote ?? prep,
    skipImpact: input.skipImpact ?? inferSkipImpact(text),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Writing versions

interface BuiltLine {
  row: typeof s.ingredientLines.$inferInsert
  name: string
  created: boolean
  matched: string | null
}

async function buildLines(
  db: Db,
  actor: Actor,
  catalog: Catalog,
  versionId: string,
  inputs: IngredientInput[],
): Promise<BuiltLine[]> {
  const source: s.FlagSource = actor.via === 'web' ? 'user' : 'ai'
  const out: BuiltLine[] = []
  let position = 0
  for (const input of inputs) {
    const p = parseIngredient(input)
    const { row, created } = await ensureIngredient(db, catalog, p.name, input.ingredient, source)
    out.push({
      name: row.name,
      created,
      matched: created ? null : row.name,
      row: {
        versionId,
        position: position++,
        section: cleanSection(input.section),
        quantityMetric: p.quantityMetric,
        unitMetric: p.unitMetric,
        originalText: p.originalText,
        ingredientId: row.id,
        prepNote: p.prepNote,
        skipImpact: p.skipImpact,
        substitutions: input.substitutions ?? null,
      },
    })
  }
  return out
}

function hashContent(
  recipeTitle: string,
  p: Partial<typeof s.recipeVersions.$inferInsert>,
  lines: BuiltLine[],
) {
  return contentHash({
    recipe: recipeTitle.trim().toLowerCase(),
    title: p.title,
    description: p.description,
    servings: p.servings,
    course: p.course,
    category: p.category,
    steps: p.steps,
    ingredients: lines.map((l) => [
      l.name.toLowerCase(),
      l.row.quantityMetric,
      l.row.unitMetric,
      l.row.section ?? null,
    ]),
  })
}

async function replaceChildren(
  db: Db,
  actor: Actor,
  versionId: string,
  input: VersionInput,
  built: BuiltLine[] | null,
) {
  const now = Date.now()
  if (built) {
    await db
      .update(s.ingredientLines)
      .set({ deletedAt: now })
      .where(and(eq(s.ingredientLines.versionId, versionId), isNull(s.ingredientLines.deletedAt)))
    await insertMany(
      db,
      s.ingredientLines,
      built.map((b) => b.row),
    )
  }
  if (input.equipment) {
    await db
      .update(s.versionEquipment)
      .set({ deletedAt: now })
      .where(and(eq(s.versionEquipment.versionId, versionId), isNull(s.versionEquipment.deletedAt)))
    await insertMany(
      db,
      s.versionEquipment,
      input.equipment.map((e) => ({ versionId, item: e.item, designation: e.designation ?? null })),
    )
  }
  if (input.dimensions) {
    const wanted = new Map<string, string>()
    for (const d of input.dimensions) wanted.set(d.dimension, d.fit)
    const existing = await db
      .select()
      .from(s.versionDimensions)
      .where(
        and(eq(s.versionDimensions.versionId, versionId), isNull(s.versionDimensions.deletedAt)),
      )
    const keep = new Set<string>()
    for (const [ref, fit] of wanted) {
      const dim = await findDimension(db, actor, ref)
      if (dim) keep.add(dim.id)
      await setVersionFit(db, actor, versionId, ref, fit, { createIfMissing: true })
      if (!dim) {
        const made = await findDimension(db, actor, ref)
        if (made) keep.add(made.id)
      }
    }
    for (const e of existing)
      if (!keep.has(e.dimensionId))
        await db
          .update(s.versionDimensions)
          .set({ deletedAt: now })
          .where(eq(s.versionDimensions.id, e.id))
  }
}

async function writeEdit(db: Db, actor: Actor, versionId: string, summary: string, diff: unknown) {
  await db.insert(s.versionEdits).values({
    versionId,
    userId: actor.userId,
    via: actor.via,
    summary,
    diff: diff as never,
  })
}

export interface SaveRecipeInput extends VersionInput {
  /** Recipe title ("Brownies"). Required to create a recipe. */
  recipeTitle?: string
  /** Add a new version to this recipe. */
  recipeId?: string
  /** Edit this version in place (versions are mutable; every edit is kept in the history). */
  versionId?: string
}

export interface SaveRecipeResult {
  created: boolean
  version: VersionView
  newIngredients: string[]
}

export async function saveRecipe(
  db: Db,
  actor: Actor,
  input: SaveRecipeInput,
): Promise<SaveRecipeResult> {
  const source: s.FlagSource = actor.via === 'web' ? 'user' : 'ai'
  const catalog = await loadCatalog(db, actor.householdId)
  const patch = versionPatch(input, source)

  if (input.versionId) {
    const cur = await requireVersion(db, actor, input.versionId)
    const built = input.ingredients
      ? await buildLines(db, actor, catalog, cur.version.id, input.ingredients)
      : null
    const changed: Record<string, [unknown, unknown]> = {}
    for (const [k, v] of Object.entries(patch)) {
      const before = (cur.version as Record<string, unknown>)[k]
      if (JSON.stringify(before ?? null) !== JSON.stringify(v ?? null))
        changed[k] = [before ?? null, v ?? null]
    }
    if (input.recipeTitle && input.recipeTitle !== cur.recipe.title)
      changed.recipeTitle = [cur.recipe.title, input.recipeTitle]
    const withSection = (text: string, section: string | null | undefined) =>
      section ? `[${section}] ${text}` : text
    const linesBefore = cur.lines.map((l) => withSection(l.line.originalText, l.line.section))
    const linesAfter = built?.map((b) => withSection(b.row.originalText, b.row.section))
    const linesChanged = !!linesAfter && JSON.stringify(linesBefore) !== JSON.stringify(linesAfter)
    const extra = {
      ...(input.equipment && { equipment: true }),
      ...(input.dimensions && { dimensions: true }),
    }
    if (!Object.keys(changed).length && !linesChanged && !Object.keys(extra).length)
      return { created: false, version: versionView(cur), newIngredients: [] }

    const title = input.recipeTitle ?? cur.recipe.title
    const hash = await hashContent(
      title,
      { ...cur.version, ...patch } as never,
      built ??
        cur.lines.map((l) => ({
          name: l.ingredient?.name ?? l.line.originalText,
          created: false,
          matched: null,
          row: l.line as never,
        })),
    )
    if (input.recipeTitle)
      await db
        .update(s.recipes)
        .set({ title: input.recipeTitle })
        .where(eq(s.recipes.id, cur.recipe.id))
    await db
      .update(s.recipeVersions)
      .set({ ...patch, contentHash: hash })
      .where(eq(s.recipeVersions.id, cur.version.id))
    await replaceChildren(db, actor, cur.version.id, input, built)
    const fields = [
      ...Object.keys(changed),
      ...(linesChanged ? ['ingredients'] : []),
      ...Object.keys(extra),
    ]
    await writeEdit(db, actor, cur.version.id, `Edited ${fields.join(', ')}`, {
      changed,
      ...(linesChanged && { ingredients: { before: linesBefore, after: linesAfter } }),
      ...extra,
    })
    const fresh = await requireVersion(db, actor, cur.version.id)
    return {
      created: false,
      version: versionView(fresh, (await getPrefs(db, actor)).display),
      newIngredients: (built ?? []).filter((b) => b.created).map((b) => b.name),
    }
  }

  // Create: a new recipe, or a new version of an existing one.
  let recipeId = input.recipeId
  let recipeTitle = input.recipeTitle ?? ''
  if (recipeId) {
    const [r] = await db
      .select()
      .from(s.recipes)
      .where(
        and(
          eq(s.recipes.id, recipeId),
          eq(s.recipes.householdId, actor.householdId),
          isNull(s.recipes.deletedAt),
        ),
      )
    if (!r) throw notFound('Recipe')
    recipeTitle = r.title
  } else {
    if (!input.recipeTitle?.trim()) throw invalid('A new recipe needs a recipeTitle')
    const [r] = await db
      .insert(s.recipes)
      .values({
        ownerUserId: actor.userId,
        householdId: actor.householdId,
        title: input.recipeTitle.trim(),
      })
      .returning({ id: s.recipes.id })
    recipeId = r.id
  }
  const versionId = ulid()
  const built = await buildLines(db, actor, catalog, versionId, input.ingredients ?? [])
  const vtitle = input.title?.trim() || recipeTitle
  const hash = await hashContent(recipeTitle, { ...patch, title: vtitle }, built)
  await db.insert(s.recipeVersions).values({
    id: versionId,
    recipeId,
    lineageId: ulid(),
    contentHash: hash,
    ...patch,
    title: vtitle,
  })
  await replaceChildren(db, actor, versionId, input, built)
  await writeEdit(db, actor, versionId, 'Created', { created: true })
  const fresh = await requireVersion(db, actor, versionId)
  return {
    created: true,
    version: versionView(fresh, (await getPrefs(db, actor)).display),
    newIngredients: built.filter((b) => b.created).map((b) => b.name),
  }
}

/** Soft-deletes a version (or the whole recipe when it was the last one). */
export async function deleteVersion(db: Db, actor: Actor, versionId: string) {
  const v = await requireVersion(db, actor, versionId)
  const now = Date.now()
  const siblings = await db
    .select({ id: s.recipeVersions.id })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.recipeId, v.recipe.id), isNull(s.recipeVersions.deletedAt)))
  const stmts: unknown[] = [
    db.update(s.recipeVersions).set({ deletedAt: now }).where(eq(s.recipeVersions.id, versionId)),
  ]
  if (siblings.length <= 1)
    stmts.push(db.update(s.recipes).set({ deletedAt: now }).where(eq(s.recipes.id, v.recipe.id)))
  await db.batch(stmts as never)
  await writeEdit(db, actor, versionId, 'Deleted', { deleted: true })
  return { deleted: true }
}

// ---------------------------------------------------------------------------------------------------------------
// Variations

export interface SaveVariationInput extends VersionInput {
  fromVersionId: string
  /** The variation's name: "fudgy", "pesach", "2x". */
  title: string
}

/** A new version of the same recipe, copied from `fromVersionId` with changes applied. Keeps the lineage. */
export async function saveVariation(
  db: Db,
  actor: Actor,
  input: SaveVariationInput,
): Promise<SaveRecipeResult> {
  const src = await requireVersion(db, actor, input.fromVersionId)
  const sourceKind: s.FlagSource = actor.via === 'web' ? 'user' : 'ai'
  const catalog = await loadCatalog(db, actor.householdId)
  const patch = versionPatch(input, sourceKind)
  const base = src.version
  const versionId = ulid()
  const built = input.ingredients
    ? await buildLines(db, actor, catalog, versionId, input.ingredients)
    : src.lines.map((l, i): BuiltLine => ({
        name: l.ingredient?.name ?? l.line.originalText,
        created: false,
        matched: null,
        row: {
          versionId,
          position: i,
          section: l.line.section,
          quantityMetric: l.line.quantityMetric,
          unitMetric: l.line.unitMetric,
          originalText: l.line.originalText,
          ingredientId: l.line.ingredientId,
          prepNote: l.line.prepNote,
          skipImpact: l.line.skipImpact,
          substitutions: l.line.substitutions,
        },
      }))
  const copied: Partial<typeof s.recipeVersions.$inferInsert> = {
    description: base.description,
    sourceLinks: base.sourceLinks,
    servings: base.servings,
    course: base.course,
    form: base.form,
    category: base.category,
    difficulty: base.difficulty,
    activeMinutes: base.activeMinutes,
    totalMinutes: base.totalMinutes,
    servingStyle: base.servingStyle,
    holdsOnBlech: base.holdsOnBlech,
    easyToDeliver: base.easyToDeliver,
    cost: base.cost,
    nutrition: base.nutrition,
    prePrep: base.prePrep,
    steps: base.steps,
    flags: base.flags,
  }
  const merged = { ...copied, ...patch, title: input.title }
  const hash = await hashContent(src.recipe.title, merged, built)
  await db.insert(s.recipeVersions).values({
    id: versionId,
    recipeId: src.recipe.id,
    parentVersionId: base.id,
    lineageId: base.lineageId,
    contentHash: hash,
    ...merged,
  })
  const children: VersionInput = {
    equipment:
      input.equipment ?? src.equipment.map((e) => ({ item: e.item, designation: e.designation })),
    dimensions:
      input.dimensions ?? src.dims.map((d) => ({ dimension: d.dimension.id, fit: d.fit })),
  }
  await replaceChildren(db, actor, versionId, children, built)
  await writeEdit(db, actor, versionId, `Variation of "${base.title}"`, { forkedFrom: base.id })
  const fresh = await requireVersion(db, actor, versionId)
  return {
    created: true,
    version: versionView(fresh, (await getPrefs(db, actor)).display),
    newIngredients: built.filter((b) => b.created).map((b) => b.name),
  }
}

export async function getRecipeHistory(db: Db, actor: Actor, versionId: string) {
  await requireVersion(db, actor, versionId)
  const edits = await db
    .select()
    .from(s.versionEdits)
    .where(eq(s.versionEdits.versionId, versionId))
    .orderBy(desc(s.versionEdits.at))
    .limit(100)
  return edits.map((e) => ({
    id: e.id,
    at: e.at,
    userId: e.userId,
    via: e.via,
    summary: e.summary,
    diff: e.diff,
  }))
}

// ---------------------------------------------------------------------------------------------------------------
// Import (forgiving)

export interface ImportRecipeInput {
  title?: string
  /** Everything pasted, if it is not already split: title, ingredients and method as one blob. */
  text?: string
  ingredients?: (string | IngredientInput)[] | string
  steps?: StepInput[] | string
  servings?: number
  description?: string
  sourceLinks?: { url: string; label?: string }[]
  course?: string
  form?: string
  category?: 'meat' | 'dairy' | 'parve'
  difficulty?: 'easy' | 'average' | 'a_pain'
  activeMinutes?: number
  totalMinutes?: number
  /** Catalog data for ingredients the AI knows, keyed by ingredient name as written in the lines. */
  ingredientData?: Record<string, IngredientMeta>
  /** Parse and report, without saving. */
  dryRun?: boolean
}

const STEP_NUM = /^\s*(?:step\s*)?\d+\s*[.):-]\s*/i

export interface PastedLine {
  text: string
  section?: string
}

const URL_LINE = /^<?(https?:\/\/\S+?)>?$/i
const FOR_THE = /^(?:for\s+(?:the\s+)?)?(.+?)\s*:$/i

/**
 * Pulls a title, ingredient lines and steps out of a pasted blob. Best effort; the AI is expected to structure it.
 * Under the Ingredients and Preparation headings, deeper headings ("## Cake", "### Meringue") or "For the cake:"
 * lines start a section; a heading one level down nests inside the one above.
 */
export function parsePasted(text: string): {
  title?: string
  ingredients: PastedLine[]
  steps: PastedLine[]
  servings?: number
  sourceLinks: { url: string }[]
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const IH = /^(?:#+\s*)?\**ingredients?\**:?$/i
  const SH =
    /^(?:#+\s*)?\**(?:instructions?|directions?|method|steps?|preparation|procedure)\**:?$/i
  const ingredients: PastedLine[] = []
  const steps: PastedLine[] = []
  const sourceLinks: { url: string }[] = []
  let title: string | undefined
  let servings: number | undefined
  let mode: 'pre' | 'ing' | 'step' = 'pre'
  // Section names by heading depth below the Ingredients / Preparation heading.
  let stack: string[] = []
  const sawHeaders = lines.some((l) => IH.test(l) || SH.test(l))
  const put = (list: PastedLine[], text: string) => {
    const section = cleanSection(stack.join(' > '))
    list.push({ text, ...(section && { section }) })
  }
  for (const raw of lines) {
    const line = raw.replace(/^#+\s*/, '')
    const url = URL_LINE.exec(raw.replace(/^[-*•]\s*/, ''))
    if (url) {
      sourceLinks.push({ url: url[1] })
      continue
    }
    const sv = /\b(?:serves|servings?|yields?|makes)\s*:?\s*(\d+)/i.exec(line)
    if (sv && !servings && line.length < 60) servings = +sv[1]
    if (IH.test(raw)) {
      mode = 'ing'
      stack = []
      continue
    }
    if (SH.test(raw)) {
      mode = 'step'
      stack = []
      continue
    }
    if (sawHeaders) {
      if (mode === 'pre') {
        if (!title && !sv) title = line.replace(/\**/g, '')
        continue
      }
      const heading = /^(#{2,6})\s+(.+)$/.exec(raw)
      const forThe =
        !heading && !parseQuantity(line) ? FOR_THE.exec(line.replace(/\*+/g, '')) : null
      if (heading || forThe) {
        const depth = heading ? heading[1].length - 2 : 0
        stack = [...stack.slice(0, depth), (heading ? heading[2] : forThe![1]).replace(/\*+/g, '')]
        continue
      }
      if (mode === 'ing') put(ingredients, line.replace(/^[-*•]\s*/, ''))
      else put(steps, line.replace(STEP_NUM, '').replace(/^[-*•]\s*/, ''))
      continue
    }
    // No headers: the first short line is the title, quantity-led lines are ingredients, the rest steps.
    if (!title && !sv && line.length < 80 && !parseQuantity(line) && !/[.!]$/.test(line)) {
      title = line
      continue
    }
    if (STEP_NUM.test(line) || line.length > 70) steps.push({ text: line.replace(STEP_NUM, '') })
    else if (/^[-*•]/.test(raw) || parseQuantity(line))
      ingredients.push({ text: line.replace(/^[-*•]\s*/, '') })
    else steps.push({ text: line })
  }
  return { title, ingredients, steps, servings, sourceLinks }
}

export async function importRecipe(db: Db, actor: Actor, input: ImportRecipeInput) {
  let title = input.title
  let ingredients = input.ingredients
  let steps = input.steps
  let servings = input.servings
  let sourceLinks = input.sourceLinks
  if (input.text && (!ingredients || !steps)) {
    const p = parsePasted(input.text)
    title ??= p.title
    ingredients ??= p.ingredients
    steps ??= p.steps
    servings ??= p.servings
    if (!sourceLinks?.length && p.sourceLinks.length) sourceLinks = p.sourceLinks
  }
  if (!title?.trim()) throw invalid('Give the recipe a title')
  const lines = (typeof ingredients === 'string' ? ingredients.split(/\r?\n/) : (ingredients ?? []))
    .map((x) => (typeof x === 'string' ? { text: x } : x))
    .filter((x) => (x.text ?? x.name ?? '').trim())
  const stepList = (typeof steps === 'string' ? steps.split(/\r?\n/) : (steps ?? []))
    .map((x) => (typeof x === 'string' ? { text: x.replace(STEP_NUM, '').trim() } : x))
    .filter((x) => x.text)
  const data = Object.fromEntries(
    Object.entries(input.ingredientData ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  const withMeta: IngredientInput[] = lines.map((l) => {
    const p = parseIngredient(l)
    return { ...l, ingredient: l.ingredient ?? data[p.name.toLowerCase()] }
  })
  const preview = withMeta.map((l) => {
    const p = parseIngredient(l)
    return {
      line: p.originalText,
      name: p.name,
      quantity: p.quantityMetric,
      unit: p.unitMetric,
      prepNote: p.prepNote,
      skipImpact: p.skipImpact,
      section: cleanSection(l.section),
    }
  })
  if (input.dryRun)
    return { saved: false, parsed: { title, servings, ingredients: preview, steps: stepList } }
  const res = await saveRecipe(db, actor, {
    recipeTitle: title,
    title,
    description: input.description,
    sourceLinks,
    servings,
    course: input.course,
    form: input.form,
    category: input.category,
    difficulty: input.difficulty,
    activeMinutes: input.activeMinutes,
    totalMinutes: input.totalMinutes,
    ingredients: withMeta,
    steps: stepList,
  })
  const unverified = res.version.ingredients
    .filter((i) => i.ingredient?.aiFilled)
    .map((i) => i.name)
  return {
    saved: true,
    version: res.version,
    newIngredients: res.newIngredients,
    /** Catalog entries that rest on AI-filled or default data. Their allergen and kashrut flags need a person's check. */
    needsReview: unique(unverified),
    unquantified: res.version.ingredients.filter((i) => !i.quantity).map((i) => i.original),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Scaling

export interface ScaleInput {
  versionId: string
  factor?: number
  toServings?: number
  pan?: string | boolean
  cookTimeMinutes?: number
  /** Save the result as a new version with this name (an explicit action). */
  saveAs?: string
}

export async function scaleRecipe(db: Db, actor: Actor, input: ScaleInput) {
  const v = await requireVersion(db, actor, input.versionId)
  const prefs = (await getPrefs(db, actor)).display
  const target =
    input.factor !== undefined
      ? { factor: input.factor }
      : input.toServings !== undefined
        ? { fromServings: v.version.servings ?? 0, toServings: input.toServings }
        : null
  if (!target) throw invalid('Give factor or toServings')
  if ('fromServings' in target && !target.fromServings)
    throw invalid('This recipe has no servings, so give a factor instead')
  const res = scaleLines(v.lines.map(toCoreLine), target, {
    pan: input.pan,
    cookTimeMinutes: input.cookTimeMinutes ?? v.version.activeMinutes ?? undefined,
  })
  const lines = res.lines.map((l, i) => {
    const q =
      l.amount !== null
        ? ({ amount: l.amount, unit: l.unit, approx: l.approx ?? false } as Quantity)
        : null
    const fmt = (qq: Quantity | null) =>
      qq
        ? formatQuantity(qq, prefs, { category: l.category, density: l.density ?? null }).text
        : null
    return {
      name: l.name,
      original: v.lines[i].line.originalText,
      base: fmt(
        l.baseAmount !== null
          ? ({ amount: l.baseAmount, unit: l.unit, approx: false } as Quantity)
          : null,
      ),
      scaled: fmt(q),
      quantity: q && { amount: q.amount, unit: q.unit },
      rounded: l.rounded,
      prepNote: l.prepNote,
    }
  })
  let saved: SaveRecipeResult | undefined
  if (input.saveAs) {
    saved = await saveVariation(db, actor, {
      fromVersionId: v.version.id,
      title: input.saveAs,
      servings: v.version.servings ? Math.round(v.version.servings * res.factor) : undefined,
      ingredients: res.lines.map((l, i) => {
        const orig = v.lines[i]
        const text =
          l.amount !== null
            ? `${formatQuantity({ amount: l.amount, unit: l.unit, approx: false }, prefs, { category: l.category, density: l.density ?? null }).text} ${l.name}`
            : orig.line.originalText
        return {
          text: l.amount !== null && orig.ingredient ? undefined : text,
          name: orig.ingredient?.name ?? l.name,
          quantity: l.amount !== null ? l.amount : undefined,
          unit: l.amount !== null ? (l.unit === 'piece' ? undefined : l.unit) : undefined,
          prepNote: orig.line.prepNote ?? undefined,
          skipImpact: orig.line.skipImpact,
        } satisfies IngredientInput
      }),
    })
  }
  return {
    versionId: v.version.id,
    title: v.recipe.title,
    factor: res.factor,
    servings: v.version.servings ? Math.round(v.version.servings * res.factor * 10) / 10 : null,
    lines,
    warnings: res.warnings,
    saved: saved?.version ?? null,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Search

export interface SearchInput {
  q?: string
  course?: string
  kashrut?: 'meat' | 'dairy' | 'parve'
  /** Person ids (your household or contacts): flags what they cannot have, via the dish checker. */
  safeFor?: string[]
  /** Only show dishes none of `safeFor` are excluded from (default: show all and mark them). */
  onlySafe?: boolean
  /** Date the check is for (seasons such as Pesach resolve here). Default today. */
  date?: string
  pesach?: boolean
  maxMinutes?: number
  notServedWeeks?: number
  difficulty?: 'easy' | 'average' | 'a_pain'
  maxCost?: number
  /** A dimension name or id. */
  dimension?: string
  minFit?: 'fine' | 'good' | 'especially'
  collectionId?: string
  sort?: 'relevance' | 'quickest' | 'easiest' | 'longest_unserved' | 'a_z'
  limit?: number
  offset?: number
}

const FIT_RANK = { fine: 1, good: 2, especially: 3 } as const
const DIFF_RANK = { easy: 0, average: 1, a_pain: 2 } as const

/** An FTS5 MATCH expression for the words of `q`, folding other transliterations (Shabbos, kitniyos) together. */
export function ftsQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
  if (!words.length) return null
  return words
    .map(
      (w) =>
        `(${wordVariants(w)
          .map((v) => `"${v}"*`)
          .join(' OR ')})`,
    )
    .join(' AND ')
}

export async function searchRecipes(db: Db, actor: Actor, input: SearchInput) {
  if (input.collectionId) {
    const [c] = await db
      .select()
      .from(s.collections)
      .where(
        and(
          eq(s.collections.id, input.collectionId),
          eq(s.collections.householdId, actor.householdId),
          isNull(s.collections.deletedAt),
        ),
      )
    if (!c) throw notFound('Collection')
    input = { ...(c.filters as SearchInput), ...stripUndefined(input) }
  }
  const loc = await householdLocation(db, actor.householdId)
  const today = todayIn(loc.timeZone)
  const date = input.date ?? today

  // 1. Candidate versions: FTS when there is text, else everything.
  let ids: string[] | null = null
  const match = input.q ? ftsQuery(input.q) : null
  if (match) {
    const rows = await db.all<{ version_id: string }>(sql`
      SELECT recipe_fts.version_id AS version_id
      FROM recipe_fts JOIN recipes r ON r.id = recipe_fts.recipe_id
      WHERE recipe_fts MATCH ${match} AND r.household_id = ${actor.householdId} AND r.deleted_at IS NULL
      ORDER BY recipe_fts.rank LIMIT 300`)
    ids = rows.map((r) => r.version_id)
    if (!ids.length) return { total: 0, results: [], disclaimer: null }
  }
  const pool = ids
    ? [...(await loadVersions(db, actor.householdId, ids)).values()]
    : await loadAllVersions(db, actor.householdId)
  const order = ids ? new Map(ids.map((id, i) => [id, i])) : null

  // 2. Cheap filters.
  let hits = pool.filter((v) => {
    const x = v.version
    if (input.course && (x.course ?? '').toLowerCase() !== input.course.toLowerCase()) return false
    if (input.kashrut && versionKashrut(v) !== input.kashrut) return false
    if (input.difficulty && x.difficulty !== input.difficulty) return false
    if (input.maxCost && (x.cost ?? 0) > input.maxCost) return false
    if (input.maxMinutes && (x.totalMinutes ?? x.activeMinutes ?? 0) > input.maxMinutes)
      return false
    if (input.pesach && !pesachCheck(v).friendly) return false
    return true
  })
  if (input.dimension) {
    const dim = await findDimension(db, actor, input.dimension)
    if (!dim) return { total: 0, results: [], disclaimer: null }
    const min = FIT_RANK[input.minFit ?? 'good']
    hits = hits.filter((v) =>
      v.dims.some((d) => d.dimension.id === dim.id && FIT_RANK[d.fit] >= min),
    )
  }

  // 3. Serving history (this household's layer).
  const served = await servedMap(
    db,
    actor.householdId,
    hits.map((v) => v.version.id),
  )
  if (input.notServedWeeks) {
    const cutoff = new Date(
      Date.parse(`${today}T00:00:00Z`) - input.notServedWeeks * 7 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10)
    hits = hits.filter((v) => {
      const last = served.get(v.version.id)
      return !last || last < cutoff
    })
  }

  // 4. Safe for: the core dish checker, with each person's constraints and this host's private layer.
  let unsafe = new Map<string, { personId: string; personName: string; reasons: string[] }[]>()
  let checked = false
  if (input.safeFor?.length) {
    const people = await loadEffectivePeople(db, actor, input.safeFor)
    if (people.length !== unique(input.safeFor).length) throw notFound('Person')
    const host = await loadEffectivePeople(
      db,
      actor,
      await householdPersonIds(db, actor.householdId),
    )
    checked = true
    for (const p of people) {
      const checker = createDishChecker({
        location: loc,
        date,
        attendees: [p.person],
        hostPersons: host.map((h) => h.person),
        selected: [],
      })
      for (const v of hits) {
        const c = checker.check(toDishVersion(v))
        if (!c.fits) {
          const list = unsafe.get(v.version.id) ?? []
          list.push({ personId: p.person.id, personName: p.person.name, reasons: c.reasons })
          unsafe.set(v.version.id, list)
        }
      }
    }
    if (input.onlySafe) hits = hits.filter((v) => !unsafe.has(v.version.id))
  }

  // 5. Sort.
  const sort = input.sort ?? (order ? 'relevance' : 'a_z')
  const title = (v: LoadedVersion) => v.recipe.title.toLowerCase()
  hits.sort((a, b) => {
    switch (sort) {
      case 'relevance':
        return (
          (order?.get(a.version.id) ?? 0) - (order?.get(b.version.id) ?? 0) ||
          title(a).localeCompare(title(b))
        )
      case 'quickest':
        return (a.version.totalMinutes ?? 9999) - (b.version.totalMinutes ?? 9999)
      case 'easiest':
        return (
          DIFF_RANK[a.version.difficulty ?? 'average'] -
            DIFF_RANK[b.version.difficulty ?? 'average'] || title(a).localeCompare(title(b))
        )
      case 'longest_unserved':
        return (
          (served.get(a.version.id) ?? '').localeCompare(served.get(b.version.id) ?? '') ||
          title(a).localeCompare(title(b))
        )
      default:
        return title(a).localeCompare(title(b)) || a.version.title.localeCompare(b.version.title)
    }
  })

  const total = hits.length
  const page = hits.slice(input.offset ?? 0, (input.offset ?? 0) + Math.min(input.limit ?? 50, 200))
  const counts = new Map<string, number>()
  for (const v of pool) counts.set(v.recipe.id, (counts.get(v.recipe.id) ?? 0) + 1)
  return {
    total,
    results: page.map((v) => ({
      recipeId: v.recipe.id,
      versionId: v.version.id,
      title: v.recipe.title,
      versionTitle: v.version.title,
      course: v.version.course,
      form: v.version.form,
      kashrut: versionKashrut(v),
      difficulty: v.version.difficulty,
      cost: v.version.cost,
      servings: v.version.servings,
      activeMinutes: v.version.activeMinutes,
      totalMinutes: v.version.totalMinutes,
      pesachFriendly: pesachCheck(v).friendly,
      dimensions: v.dims.map((d) => ({ name: d.dimension.name, fit: d.fit })),
      lastServed: served.get(v.version.id) ?? null,
      versionCount: counts.get(v.recipe.id) ?? 1,
      ...(checked && { unsafeFor: unsafe.get(v.version.id) ?? [] }),
    })),
    disclaimer: checked
      ? "Bishul helps you avoid serving the wrong thing, but it is not a guarantee. It's on the host: check labels, and confirm allergies with the guest."
      : null,
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Most recent day each version was served to anyone, from this household's serving history. */
export async function servedMap(
  db: Db,
  householdId: string,
  versionIds: string[],
): Promise<Map<string, string>> {
  const rows = await inChunks(versionIds, (part) =>
    db
      .select({ versionId: s.servedLog.versionId, last: sql<string>`max(${s.servedLog.servedOn})` })
      .from(s.servedLog)
      .where(
        and(
          inArray(s.servedLog.versionId, part),
          eq(s.servedLog.layerHouseholdId, householdId),
          isNull(s.servedLog.deletedAt),
        ),
      )
      .groupBy(s.servedLog.versionId),
  )
  return new Map(rows.map((r) => [r.versionId, r.last]))
}

/** Sets how well a version suits a dimension, checking the version is yours. */
export async function setRecipeFit(
  db: Db,
  actor: Actor,
  versionId: string,
  dimension: string,
  fit: string | null,
) {
  await requireVersion(db, actor, versionId)
  if (fit !== null) fitFromInput(fit)
  return setVersionFit(db, actor, versionId, dimension, fit, { createIfMissing: true })
}

// ---------------------------------------------------------------------------------------------------------------
// Collections (saved filters)

export async function listCollections(db: Db, actor: Actor) {
  const rows = await db
    .select()
    .from(s.collections)
    .where(and(eq(s.collections.householdId, actor.householdId), isNull(s.collections.deletedAt)))
    .orderBy(asc(s.collections.name))
  return rows.map((c) => ({ id: c.id, name: c.name, filters: c.filters }))
}

export async function saveCollection(
  db: Db,
  actor: Actor,
  input: { id?: string; name: string; filters: s.RecipeFilterSpec },
) {
  if (input.id) {
    const res = await db
      .update(s.collections)
      .set({ name: input.name, filters: input.filters })
      .where(and(eq(s.collections.id, input.id), eq(s.collections.householdId, actor.householdId)))
      .returning()
    if (!res.length) throw notFound('Collection')
    return { id: res[0].id, name: res[0].name, filters: res[0].filters }
  }
  const [c] = await db
    .insert(s.collections)
    .values({ householdId: actor.householdId, name: input.name, filters: input.filters })
    .returning()
  return { id: c.id, name: c.name, filters: c.filters }
}

export async function deleteCollection(db: Db, actor: Actor, id: string) {
  const res = await db
    .update(s.collections)
    .set({ deletedAt: Date.now() })
    .where(and(eq(s.collections.id, id), eq(s.collections.householdId, actor.householdId)))
    .returning({ id: s.collections.id })
  if (!res.length) throw notFound('Collection')
  return { deleted: true }
}
