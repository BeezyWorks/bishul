import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'

import * as s from '../db/schema'
import { batch, conflict, forbidden, invalid, notFound, ulid, type Actor, type Db } from './ctx'
import { ftsQuery } from './recipes'
import { importSnapshots, recipeSnapshot, type SnapshotVersion } from './sharing'
import { tagKey } from './tags'

// ---------------------------------------------------------------------------------------------------------------
// Public recipes (BRIEF §10). An author can publish a recipe: a separate public copy (a dish with all its versions)
// that anyone can find by search, rate and save to their own book. The private recipe stays the source of truth.
// The public row is a projection of it, rebuilt by `syncPublic` at the end of every write to the private recipe,
// so the author edits once and the service does both writes. A saved copy is independent but keeps a link back
// (`recipes.source_public_recipe_id`) and the original's lineage.

type PublicRow = typeof s.publicRecipes.$inferSelect

/** Bayesian average: a recipe with one 5-star rating does not outrank one with fifty 4.6s. Prior: 3 stars, weight 3. */
const PRIOR_STARS = 3
const PRIOR_WEIGHT = 3

const versionsOf = (row: PublicRow) => (row.snapshot.versions ?? []) as SnapshotVersion[]

function author(row: PublicRow) {
  return row.anonymous ? null : { name: row.authorName ?? 'A Tavshil cook' }
}

function rating(row: PublicRow) {
  return {
    count: row.ratingCount,
    average: row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null,
  }
}

function summary(row: PublicRow) {
  const lead = versionsOf(row)[0]
  return {
    id: row.id,
    title: row.title,
    author: author(row),
    anonymous: row.anonymous,
    description: lead?.description ?? null,
    course: row.course,
    kashrut: row.category,
    difficulty: row.difficulty,
    cost: row.cost,
    totalMinutes: row.totalMinutes,
    servings: lead?.servings ?? null,
    tags: lead?.tags ?? [],
    versionCount: versionsOf(row).length,
    rating: rating(row),
    saves: row.saveCount,
    publishedAt: row.publishedAt,
  }
}

/** The text FTS indexes for a public recipe: the same fields recipe_fts holds, from the snapshot. */
function searchText(title: string, versions: SnapshotVersion[]) {
  const words = (xs: (string | null | undefined)[]) => xs.filter(Boolean).join(' ')
  return {
    title: words([title, ...versions.map((v) => v.title)]),
    description: words(versions.map((v) => v.description)),
    ingredients: words(
      versions.flatMap((v) =>
        v.ingredients.flatMap((i) => [i.original, i.name, ...(i.catalog?.aliases ?? [])]),
      ),
    ),
    tags: words(versions.flatMap((v) => (v.tags ?? []).flatMap((t) => [t, tagKey(t)]))),
  }
}

async function findByRecipe(db: Db, recipeId: string) {
  const [row] = await db
    .select()
    .from(s.publicRecipes)
    .where(eq(s.publicRecipes.recipeId, recipeId))
  return row
}

async function requireLive(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(s.publicRecipes)
    .where(and(eq(s.publicRecipes.id, id), isNull(s.publicRecipes.deletedAt)))
  if (!row) throw notFound('Public recipe')
  return row
}

/** The D1 binding under the drizzle handle. */
const client = (db: Db) => (db as unknown as { $client: D1Database }).$client

/** A drizzle statement or raw SQL as a prepared D1 statement, so both kinds can share one atomic batch. */
function prepared(db: Db, stmt: { toSQL(): { sql: string; params: unknown[] } }) {
  const q = stmt.toSQL()
  return client(db)
    .prepare(q.sql)
    .bind(...q.params)
}
const rawSql = (db: Db, q: string, ...params: unknown[]) =>
  client(db)
    .prepare(q)
    .bind(...params)
const ftsDelete = (db: Db, id: string) =>
  rawSql(db, 'DELETE FROM public_recipe_fts WHERE public_id = ?', id)

/** Writes the public row and its search row together (one D1 batch, so they never disagree). */
async function writeRow(
  db: Db,
  id: string,
  existing: PublicRow | undefined,
  fields: {
    recipeId: string
    ownerUserId: string
    anonymous: boolean
    authorName: string | null
    title: string
    versions: SnapshotVersion[]
  },
) {
  const lead = fields.versions[0]
  const tags = fields.versions.flatMap((v) => (v.tags ?? []).map(tagKey)).filter(Boolean)
  const cols = {
    ownerUserId: fields.ownerUserId,
    anonymous: fields.anonymous,
    authorName: fields.anonymous ? null : fields.authorName,
    title: fields.title,
    snapshot: { versions: fields.versions } as s.PublicSnapshot,
    course: lead?.course ?? null,
    category: lead?.category ?? null,
    difficulty: lead?.difficulty ?? null,
    cost: lead?.cost ?? null,
    totalMinutes: lead?.totalMinutes ?? lead?.activeMinutes ?? null,
    tagKeys: `|${[...new Set(tags)].join('|')}|`,
    deletedAt: null,
    updatedAt: Date.now(),
  }
  const text = searchText(fields.title, fields.versions)
  await client(db).batch([
    prepared(
      db,
      existing
        ? db.update(s.publicRecipes).set(cols).where(eq(s.publicRecipes.id, id))
        : db
            .insert(s.publicRecipes)
            .values({ id, recipeId: fields.recipeId, publishedAt: Date.now(), ...cols }),
    ),
    ftsDelete(db, id),
    rawSql(
      db,
      'INSERT INTO public_recipe_fts (public_id, title, description, ingredients, tags) VALUES (?, ?, ?, ?, ?)',
      id,
      text.title,
      text.description,
      text.ingredients,
      text.tags,
    ),
  ])
}

async function liveRecipe(db: Db, recipeId: string) {
  const [r] = await db
    .select()
    .from(s.recipes)
    .where(and(eq(s.recipes.id, recipeId), isNull(s.recipes.deletedAt)))
  return r
}

export interface PublishInput {
  recipeId: string
  /** Hide the author's name. Default: shown. Sending it again changes it. */
  anonymous?: boolean
  /** The name shown as the author (the signed-in user's display name). Ignored when anonymous. */
  authorName?: string | null
}

/** Publishes a recipe, or updates how it is shown (anonymous, name). Only its author can publish it. */
export async function publishRecipe(db: Db, actor: Actor, input: PublishInput) {
  const recipe = await liveRecipe(db, input.recipeId)
  if (!recipe || recipe.householdId !== actor.householdId) throw notFound('Recipe')
  if (recipe.ownerUserId !== actor.userId)
    throw forbidden('Only the person who wrote a recipe can make it public')
  const snap = await recipeSnapshot(db, recipe.householdId, 'dish', recipe.id)
  if (!snap) throw notFound('Recipe')
  const existing = await findByRecipe(db, recipe.id)
  const id = existing?.id ?? ulid()
  await writeRow(db, id, existing, {
    recipeId: recipe.id,
    ownerUserId: actor.userId,
    anonymous: input.anonymous ?? existing?.anonymous ?? false,
    authorName: input.authorName ?? existing?.authorName ?? null,
    title: recipe.title,
    versions: (snap.snapshot as { versions: SnapshotVersion[] }).versions,
  })
  return getPublicRecipe(db, id, actor)
}

/** Soft-deletes the public row and drops its search row, together. */
async function unlist(db: Db, id: string) {
  await client(db).batch([
    prepared(
      db,
      db.update(s.publicRecipes).set({ deletedAt: Date.now() }).where(eq(s.publicRecipes.id, id)),
    ),
    ftsDelete(db, id),
  ])
}

/** Takes a recipe off the public list. Copies other people saved stay with them; ratings are kept. */
export async function unpublishRecipe(db: Db, actor: Actor, recipeId: string) {
  const row = await findByRecipe(db, recipeId)
  if (!row || row.deletedAt || row.ownerUserId !== actor.userId) throw notFound('Public recipe')
  await unlist(db, row.id)
  return { unpublished: true }
}

/**
 * Called at the end of every write to a private recipe (save, variation, delete). If the recipe is published, the
 * public copy is rebuilt from it; if the recipe is gone, it is unpublished. A no-op for recipes that are not public.
 * Idempotent: publishing again repairs a public copy that a failed sync left behind.
 */
export async function syncPublic(db: Db, recipeId: string) {
  const row = await findByRecipe(db, recipeId)
  if (!row || row.deletedAt) return
  const recipe = await liveRecipe(db, recipeId)
  const snap = recipe && (await recipeSnapshot(db, recipe.householdId, 'dish', recipeId))
  if (!recipe || !snap) {
    await unlist(db, row.id)
    return
  }
  await writeRow(db, row.id, row, {
    recipeId,
    ownerUserId: row.ownerUserId,
    anonymous: row.anonymous,
    authorName: row.authorName,
    title: recipe.title,
    versions: (snap.snapshot as { versions: SnapshotVersion[] }).versions,
  })
}

/** Which of the actor's recipes are public, with their ratings. */
export async function listMyPublic(db: Db, actor: Actor) {
  const rows = await db
    .select()
    .from(s.publicRecipes)
    .where(and(eq(s.publicRecipes.ownerUserId, actor.userId), isNull(s.publicRecipes.deletedAt)))
  return {
    recipes: rows.map((r) => ({ ...summary(r), recipeId: r.recipeId })),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

/** One public recipe with all its versions. `viewer` adds the viewer's own rating and whether they saved a copy. */
export async function getPublicRecipe(db: Db, id: string, viewer?: Actor | null) {
  const row = await requireLive(db, id)
  const mine = viewer?.userId ? row.ownerUserId === viewer.userId : false
  let myRating: number | null = null
  let savedAs: string | null = null
  if (viewer?.userId) {
    const [r] = await db
      .select({ stars: s.publicRecipeRatings.stars })
      .from(s.publicRecipeRatings)
      .where(
        and(
          eq(s.publicRecipeRatings.publicRecipeId, id),
          eq(s.publicRecipeRatings.userId, viewer.userId),
          isNull(s.publicRecipeRatings.deletedAt),
        ),
      )
    myRating = r?.stars ?? null
    savedAs = (await existingCopy(db, viewer, id)) ?? null
  }
  return {
    ...summary(row),
    versions: versionsOf(row),
    isMine: mine,
    myRating,
    savedAs,
    ...(mine && { recipeId: row.recipeId }),
  }
}

export interface PublicSearchInput {
  q?: string
  course?: string
  kashrut?: 'meat' | 'dairy' | 'parve'
  difficulty?: 'easy' | 'average' | 'a_pain'
  maxCost?: number
  maxMinutes?: number
  tags?: string[]
  sort?: 'relevance' | 'popular' | 'top_rated' | 'newest' | 'a_z' | 'quickest'
  limit?: number
  offset?: number
}

/**
 * Search the public recipes. Text search is the same as the private search (FTS5, transliteration aliases), and the
 * filters that do not depend on a household work the same way, on the lead version. Safe-for, Pesach, dimension and
 * nutrition filters need a household's data or the loaded version, so they are not offered here.
 */
export async function searchPublic(db: Db, input: PublicSearchInput) {
  const match = input.q ? ftsQuery(input.q) : null
  const where: SQL[] = [sql`p.deleted_at IS NULL`]
  if (match) where.push(sql`public_recipe_fts MATCH ${match}`)
  if (input.course) where.push(sql`lower(p.course) = ${input.course.toLowerCase()}`)
  if (input.kashrut) where.push(sql`p.category = ${input.kashrut}`)
  if (input.difficulty) where.push(sql`p.difficulty = ${input.difficulty}`)
  if (input.maxCost) where.push(sql`p.cost <= ${input.maxCost}`)
  if (input.maxMinutes) where.push(sql`p.total_minutes <= ${input.maxMinutes}`)
  for (const t of input.tags ?? []) {
    const k = tagKey(t)
    if (k)
      where.push(sql`p.tag_keys LIKE ${'%|' + k.replace(/[%_\\]/g, '\\$&') + '|%'} ESCAPE '\\'`)
  }
  const from = match
    ? sql`public_recipes p JOIN public_recipe_fts ON public_recipe_fts.public_id = p.id`
    : sql`public_recipes p`
  const whereSql = sql.join(where, sql` AND `)
  const score = sql`(p.rating_sum + ${PRIOR_STARS * PRIOR_WEIGHT}) * 1.0 / (p.rating_count + ${PRIOR_WEIGHT})`
  const sort = input.sort ?? (match ? 'relevance' : 'popular')
  const order =
    sort === 'relevance' && match
      ? sql`public_recipe_fts.rank, p.title`
      : sort === 'top_rated'
        ? sql`${score} DESC, p.rating_count DESC, p.title`
        : sort === 'newest'
          ? sql`p.published_at DESC`
          : sort === 'a_z'
            ? sql`lower(p.title)`
            : sort === 'quickest'
              ? sql`p.total_minutes IS NULL, p.total_minutes, p.title`
              : sql`(p.rating_count + p.save_count) DESC, ${score} DESC, p.title`
  const limit = Math.min(input.limit ?? 30, 100)
  const offset = input.offset ?? 0
  const [{ n }] = await db.all<{ n: number }>(
    sql`SELECT count(*) AS n FROM ${from} WHERE ${whereSql}`,
  )
  const ids = await db.all<{ id: string }>(
    sql`SELECT p.id AS id FROM ${from} WHERE ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
  )
  const rows = ids.length
    ? await db
        .select()
        .from(s.publicRecipes)
        .where(
          sql`${s.publicRecipes.id} IN (${sql.join(
            ids.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
        )
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return {
    total: n,
    results: ids.map((r) => summary(byId.get(r.id)!)),
    disclaimer:
      'Public recipes are written by other people and are not checked. Ingredient data may be AI-filled: read the labels, and confirm allergies with the guest.',
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Saving a copy and rating

async function existingCopy(db: Db, actor: Actor, publicId: string) {
  const [r] = await db
    .select({ id: s.recipes.id })
    .from(s.recipes)
    .where(
      and(
        eq(s.recipes.householdId, actor.householdId),
        eq(s.recipes.sourcePublicRecipeId, publicId),
        isNull(s.recipes.deletedAt),
      ),
    )
  return r?.id
}

/** Saves a public recipe to the actor's household as an independent copy that links back to the public original. */
export async function savePublicRecipe(db: Db, actor: Actor, id: string) {
  const row = await requireLive(db, id)
  const original = await liveRecipe(db, row.recipeId)
  if (original?.householdId === actor.householdId)
    throw conflict('This recipe is already in your household')
  const have = await existingCopy(db, actor, id)
  if (have) return { recipeId: have, alreadySaved: true as const }
  const saved = await importSnapshots(db, actor, row.title, versionsOf(row), id)
  await db
    .update(s.publicRecipes)
    .set({ saveCount: sql`${s.publicRecipes.saveCount} + 1` })
    .where(eq(s.publicRecipes.id, id))
  return { ...saved, alreadySaved: false as const }
}

/** Rates a public recipe 1-5 stars (changing your rating replaces it); null removes it. Not your own recipe. */
export async function ratePublicRecipe(db: Db, actor: Actor, id: string, stars: number | null) {
  const row = await requireLive(db, id)
  if (row.ownerUserId === actor.userId) throw forbidden("You can't rate your own recipe")
  if (stars !== null && (!Number.isInteger(stars) || stars < 1 || stars > 5))
    throw invalid('Stars must be a whole number from 1 to 5')
  const R = s.publicRecipeRatings
  const stmts: unknown[] = [
    stars === null
      ? db
          .update(R)
          .set({ deletedAt: Date.now() })
          .where(and(eq(R.publicRecipeId, id), eq(R.userId, actor.userId)))
      : db
          .insert(R)
          .values({ publicRecipeId: id, userId: actor.userId, stars })
          .onConflictDoUpdate({
            target: [R.publicRecipeId, R.userId],
            set: { stars, deletedAt: null, updatedAt: Date.now() },
          }),
    db
      .update(s.publicRecipes)
      .set({
        ratingCount: sql`(SELECT count(*) FROM public_recipe_ratings WHERE public_recipe_id = ${id} AND deleted_at IS NULL)`,
        ratingSum: sql`(SELECT coalesce(sum(stars), 0) FROM public_recipe_ratings WHERE public_recipe_id = ${id} AND deleted_at IS NULL)`,
      })
      .where(eq(s.publicRecipes.id, id)),
  ]
  await batch(db, stmts)
  const fresh = await requireLive(db, id)
  return { myRating: stars, rating: rating(fresh) }
}

/** For a recipe saved from a public one: the link back to the original, or null. */
export async function originalOf(db: Db, recipeId: string) {
  const [r] = await db
    .select({ source: s.recipes.sourcePublicRecipeId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId))
  if (!r?.source) return null
  const [row] = await db.select().from(s.publicRecipes).where(eq(s.publicRecipes.id, r.source))
  if (!row) return null
  return {
    publicRecipeId: row.id,
    title: row.title,
    author: author(row),
    available: !row.deletedAt,
  }
}
