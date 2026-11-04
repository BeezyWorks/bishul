import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  conflict,
  forbidden,
  inChunks,
  invalid,
  notFound,
  slugOf,
  type Actor,
  type Db,
} from './ctx'
import { fitFromInput, type DimensionRow, type IngredientRow } from './mappers'
import { canonicalWord } from './translit'

// ---------------------------------------------------------------------------------------------------------------
// Ingredient catalog (BRIEF §7). Records are created when an AI adds a recipe with an unknown ingredient; AI-filled
// data is labelled so the dining brief can say when an allergy passes only on it.

export interface IngredientMeta {
  category?: 'meat' | 'dairy' | 'parve' | 'fish'
  aliases?: string[]
  /** Allergens this ingredient contains (peanut, sesame, ...). */
  allergens?: string[]
  /** chametz, kitniyot, gebrokts, animal_derived, egg, honey, grain, ...: `true` marks it, `false` says it is not. */
  flags?: string[] | Record<string, boolean>
  densityGPerMl?: number
  gramsPerPiece?: number
  /** Who vouches for this data (default: `ai` for an AI caller, `user` for the web app). */
  source?: s.FlagSource
}

/** How a name is matched: lower-case words, regional spellings folded, plurals dropped. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => canonicalWord(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.replace(/(ie)?s$/, (m) => (m === 'ies' ? 'y' : '')) : w))
    .join(' ')
}

export class Catalog {
  private byKey = new Map<string, IngredientRow>()
  private byId = new Map<string, IngredientRow>()
  constructor(
    rows: IngredientRow[],
    private householdId: string,
  ) {
    // Global entries first so a household's own entry of the same name wins.
    for (const r of [...rows].sort((a, b) => Number(!!a.householdId) - Number(!!b.householdId))) this.add(r)
  }
  add(r: IngredientRow) {
    this.byId.set(r.id, r)
    for (const n of [r.name, ...(r.aliases ?? [])]) this.byKey.set(nameKey(n), r)
  }
  find(name: string): IngredientRow | undefined {
    return this.byKey.get(nameKey(name))
  }
  get(id: string): IngredientRow | undefined {
    return this.byId.get(id)
  }
  get all(): IngredientRow[] {
    return [...this.byId.values()]
  }
  get household() {
    return this.householdId
  }
}

export async function loadCatalog(db: Db, householdId: string): Promise<Catalog> {
  const rows = await db
    .select()
    .from(s.ingredients)
    .where(
      and(
        isNull(s.ingredients.deletedAt),
        or(isNull(s.ingredients.householdId), eq(s.ingredients.householdId, householdId)),
      ),
    )
  return new Catalog(rows, householdId)
}

function flagsOf(
  flags: IngredientMeta['flags'],
  source: s.FlagSource,
): s.IngredientFlags | undefined {
  if (!flags) return undefined
  const entries = Array.isArray(flags) ? flags.map((f) => [f, true] as const) : Object.entries(flags)
  return Object.fromEntries(
    entries.map(([k, v]) => [slugOf(k), { value: v, source } satisfies s.FlagValue]),
  )
}

export function metaToRow(meta: IngredientMeta, source: s.FlagSource) {
  const sources: Record<string, s.FlagSource> = {}
  if (meta.category) sources.category = source
  if (meta.densityGPerMl !== undefined) sources.density = source
  if (meta.gramsPerPiece !== undefined) sources.piece = source
  return {
    ...(meta.aliases && { aliases: meta.aliases }),
    ...(meta.allergens && {
      allergens: meta.allergens.map((tag) => ({ tag: tag.trim().toLowerCase(), source })),
    }),
    ...(meta.flags && { flags: flagsOf(meta.flags, source) }),
    ...(meta.densityGPerMl !== undefined && { densityGPerMl: meta.densityGPerMl }),
    ...(meta.gramsPerPiece !== undefined && { gramsPerPiece: meta.gramsPerPiece }),
    sources,
  }
}

/**
 * The catalog row for an ingredient name, created for the household when it does not exist. A new row with no data
 * is a guess ("parve, no allergens, unverified") and is labelled `ai`, so nothing passes as checked on it.
 */
export async function ensureIngredient(
  db: Db,
  catalog: Catalog,
  name: string,
  meta: IngredientMeta | undefined,
  source: s.FlagSource,
): Promise<{ row: IngredientRow; created: boolean }> {
  const found = catalog.find(name)
  if (found) return { row: found, created: false }
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw invalid('An ingredient needs a name')
  const src = meta?.source ?? source
  const m = metaToRow(meta ?? {}, src)
  if (!meta?.category) m.sources.category = 'ai'
  const [row] = await db
    .insert(s.ingredients)
    .values({
      householdId: catalog.household,
      name: clean.charAt(0).toUpperCase() + clean.slice(1),
      category: meta?.category ?? 'parve',
      ...m,
    })
    .returning()
  catalog.add(row)
  return { row, created: true }
}

export function ingredientView(row: IngredientRow) {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    category: row.category,
    allergens: row.allergens ?? [],
    flags: row.flags ?? {},
    densityGPerMl: row.densityGPerMl,
    gramsPerPiece: row.gramsPerPiece,
    sources: row.sources ?? {},
    scope: row.householdId ? 'household' : 'global',
    aiFilled:
      (row.allergens ?? []).some((a) => a.source === 'ai') ||
      Object.values(row.flags ?? {}).some((f) => f?.source === 'ai') ||
      Object.values(row.sources ?? {}).some((x) => x === 'ai'),
  }
}

export async function listIngredients(db: Db, actor: Actor, q?: string) {
  const rows = await db
    .select()
    .from(s.ingredients)
    .where(
      and(
        isNull(s.ingredients.deletedAt),
        or(isNull(s.ingredients.householdId), eq(s.ingredients.householdId, actor.householdId)),
        q ? like(sql`lower(${s.ingredients.name})`, `%${q.toLowerCase()}%`) : undefined,
      ),
    )
    .orderBy(asc(s.ingredients.name))
    .limit(200)
  return rows.map(ingredientView)
}

export interface UpdateIngredientInput {
  id?: string
  name?: string
  rename?: string
  /** Who is vouching for the data. A person correcting a flag is `user`; the AI filling a gap is `ai`. */
  source?: s.FlagSource
  meta: IngredientMeta
}

/** Corrects an ingredient's category, allergens, flags, aliases or density. Changing a shared entry makes your own copy. */
export async function updateIngredient(db: Db, actor: Actor, input: UpdateIngredientInput) {
  const catalog = await loadCatalog(db, actor.householdId)
  const row = input.id ? catalog.get(input.id) : input.name ? catalog.find(input.name) : undefined
  if (!row) throw notFound('Ingredient')
  const source = input.source ?? (actor.via === 'mcp' ? 'user' : 'user')
  const m = metaToRow(input.meta, source)
  const patch: Partial<typeof s.ingredients.$inferInsert> = {
    ...(input.meta.category && { category: input.meta.category }),
    ...(input.rename && { name: input.rename }),
    ...(m.aliases && { aliases: m.aliases }),
    ...(m.allergens && { allergens: m.allergens }),
    ...(m.flags && { flags: { ...(row.flags ?? {}), ...m.flags } }),
    ...(m.densityGPerMl !== undefined && { densityGPerMl: m.densityGPerMl }),
    ...(m.gramsPerPiece !== undefined && { gramsPerPiece: m.gramsPerPiece }),
    sources: { ...(row.sources ?? {}), ...m.sources },
  }
  if (!row.householdId) {
    const [copy] = await db
      .insert(s.ingredients)
      .values({
        householdId: actor.householdId,
        name: row.name,
        aliases: row.aliases,
        category: row.category,
        allergens: row.allergens,
        flags: row.flags,
        densityGPerMl: row.densityGPerMl,
        gramsPerPiece: row.gramsPerPiece,
        sources: row.sources,
        ...patch,
      })
      .returning()
    return ingredientView(copy)
  }
  const [updated] = await db
    .update(s.ingredients)
    .set(patch)
    .where(eq(s.ingredients.id, row.id))
    .returning()
  return ingredientView(updated)
}

// ---------------------------------------------------------------------------------------------------------------
// Dimensions (BRIEF §6.1)

export const dimensionView = (d: DimensionRow) => ({
  id: d.id,
  name: d.name,
  slug: slugOf(d.name),
  kind: d.kind,
  builtIn: !d.householdId,
})

export async function listDimensions(db: Db, actor: Actor) {
  const rows = await db
    .select()
    .from(s.dimensions)
    .where(
      and(
        isNull(s.dimensions.deletedAt),
        or(isNull(s.dimensions.householdId), eq(s.dimensions.householdId, actor.householdId)),
      ),
    )
    .orderBy(asc(s.dimensions.createdAt), asc(s.dimensions.name))
  return rows.map(dimensionView)
}

/** A dimension by id, name or slug (built-ins and your own). */
export async function findDimension(
  db: Db,
  actor: Actor,
  ref: string,
): Promise<DimensionRow | undefined> {
  const rows = await db
    .select()
    .from(s.dimensions)
    .where(
      and(
        isNull(s.dimensions.deletedAt),
        or(isNull(s.dimensions.householdId), eq(s.dimensions.householdId, actor.householdId)),
      ),
    )
  const slug = slugOf(ref)
  return (
    rows.find((d) => d.id === ref) ??
    rows.find((d) => d.householdId && slugOf(d.name) === slug) ??
    rows.find((d) => slugOf(d.name) === slug)
  )
}

export async function createDimension(db: Db, actor: Actor, name: string) {
  const clean = name.trim()
  if (!clean) throw invalid('A dimension needs a name')
  if (await findDimension(db, actor, clean)) throw conflict(`There is already a dimension called "${clean}"`)
  const [row] = await db
    .insert(s.dimensions)
    .values({ householdId: actor.householdId, name: clean, kind: 'custom' })
    .returning()
  return dimensionView(row)
}

export async function renameDimension(db: Db, actor: Actor, ref: string, name: string) {
  const d = await findDimension(db, actor, ref)
  if (!d) throw notFound('Dimension')
  if (!d.householdId) throw forbidden('Built-in dimensions cannot be renamed')
  const [row] = await db.update(s.dimensions).set({ name }).where(eq(s.dimensions.id, d.id)).returning()
  return dimensionView(row)
}

export async function deleteDimension(db: Db, actor: Actor, ref: string) {
  const d = await findDimension(db, actor, ref)
  if (!d) throw notFound('Dimension')
  if (!d.householdId) throw forbidden('Built-in dimensions cannot be deleted')
  await db.batch([
    db.update(s.versionDimensions).set({ deletedAt: Date.now() }).where(eq(s.versionDimensions.dimensionId, d.id)),
    db.update(s.dimensions).set({ deletedAt: Date.now() }).where(eq(s.dimensions.id, d.id)),
  ])
  return { deleted: true }
}

/** Sets (or, with `fit` null, clears) how well a version suits a dimension. */
export async function setVersionFit(
  db: Db,
  actor: Actor,
  versionId: string,
  dimensionRef: string,
  fit: string | null,
  options: { createIfMissing?: boolean } = {},
) {
  let d = await findDimension(db, actor, dimensionRef)
  if (!d && options.createIfMissing && fit) {
    await createDimension(db, actor, dimensionRef)
    d = await findDimension(db, actor, dimensionRef)
  }
  if (!d) throw notFound(`Dimension "${dimensionRef}"`)
  const [existing] = await db
    .select()
    .from(s.versionDimensions)
    .where(and(eq(s.versionDimensions.versionId, versionId), eq(s.versionDimensions.dimensionId, d.id)))
  if (fit === null) {
    if (existing)
      await db.update(s.versionDimensions).set({ deletedAt: Date.now() }).where(eq(s.versionDimensions.id, existing.id))
    return { dimension: dimensionView(d), fit: null }
  }
  const f = fitFromInput(fit)
  if (existing)
    await db.update(s.versionDimensions).set({ fit: f, deletedAt: null }).where(eq(s.versionDimensions.id, existing.id))
  else await db.insert(s.versionDimensions).values({ versionId, dimensionId: d.id, fit: f })
  return { dimension: dimensionView(d), fit: f }
}

export { inChunks }
