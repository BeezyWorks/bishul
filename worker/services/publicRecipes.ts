import { meetsBounds, nutritionBounds, perServing } from '@tavshil/core'
import { and, asc, desc, eq, exists, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import * as s from '../db/schema'
import {
  batch,
  conflict,
  forbidden,
  inChunks,
  invalid,
  notFound,
  ulid,
  type Actor,
  type Db,
} from './ctx'
import { versionKashrut, type LoadedVersion } from './mappers'
import { ftsQuery, loadPublicVersions, type SearchInput } from './recipes'
import { importSnapshots, recipeSnapshot, type SnapshotVersion } from './sharing'
import { tagKey } from './tags'

// ---------------------------------------------------------------------------------------------------------------
// Public recipes (BRIEF §10). An author can publish a recipe: anyone can then find it by search, read it, rate it
// and save a copy to their own book. Nothing is copied. `public_recipes` is only the publication record (who, how
// it is shown, ratings, saves); the content is the private recipe, read live the way a live share link reads it, and
// search runs on the same trigger-maintained `recipe_fts` as the private search. So editing the private recipe
// reaches the public one with no extra write. A recipe is listed while its record is live, the recipe is live and it
// still has a live version; deleting the recipe or its last version just stops it appearing. A saved copy is
// independent but keeps a link back (`recipes.source_public_recipe_id`) and the original's lineage.

type PublicRow = typeof s.publicRecipes.$inferSelect

/** Bayesian average: a recipe with one 5-star rating does not outrank one with fifty 4.6s. Prior: 3 stars, weight 3. */
const PRIOR_STARS = 3
const PRIOR_WEIGHT = 3

/** The most candidates a search that has to check nutrition in code will load. */
const NUTRITION_SCAN_LIMIT = 1000

const DISCLAIMER =
  'Public recipes are written by other people and are not checked. Ingredient data may be AI-filled: read the labels, and confirm allergies with the guest.'

function rating(row: PublicRow) {
  return {
    count: row.ratingCount,
    average: row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null,
  }
}

/** True when the private recipe has at least one live version (a recipe without one is not listed). */
const hasLiveVersion = exists(
  sql`(SELECT 1 FROM ${s.recipeVersions} WHERE ${s.recipeVersions.recipeId} = ${s.publicRecipes.recipeId} AND ${s.recipeVersions.deletedAt} IS NULL)`,
)

/** The public record and its private recipe, when it is listed: record live, recipe live, a live version left. */
async function listedRows(db: Db, where: SQL | undefined) {
  return db
    .select({ row: s.publicRecipes, recipe: s.recipes })
    .from(s.publicRecipes)
    .innerJoin(s.recipes, eq(s.recipes.id, s.publicRecipes.recipeId))
    .where(
      and(isNull(s.publicRecipes.deletedAt), isNull(s.recipes.deletedAt), hasLiveVersion, where),
    )
}

async function requireListed(db: Db, id: string) {
  const [found] = await listedRows(db, eq(s.publicRecipes.id, id))
  if (!found) throw notFound('Public recipe')
  return found
}

async function findByRecipe(db: Db, recipeId: string) {
  const [row] = await db
    .select()
    .from(s.publicRecipes)
    .where(eq(s.publicRecipes.recipeId, recipeId))
  return row
}

async function liveRecipe(db: Db, recipeId: string) {
  const [r] = await db
    .select()
    .from(s.recipes)
    .where(and(eq(s.recipes.id, recipeId), isNull(s.recipes.deletedAt)))
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Authors, summaries

/**
 * The names to show as authors, from the owners' profiles (never stored with the recipe). An owner with no live
 * profile (the account was deleted) has no name, and the recipe shows as anonymous.
 */
async function authorNames(db: Db, rows: PublicRow[]) {
  const owners = rows.filter((r) => !r.anonymous).map((r) => r.ownerUserId)
  const people = await inChunks(owners, (part) =>
    db
      .select({ userId: s.persons.userId, name: s.persons.name })
      .from(s.persons)
      .where(and(inArray(s.persons.userId, part), isNull(s.persons.deletedAt)))
      .orderBy(asc(s.persons.createdAt), asc(s.persons.id)),
  )
  const names = new Map<string, string>()
  for (const p of people) if (p.userId && !names.has(p.userId)) names.set(p.userId, p.name)
  return (row: PublicRow) => {
    const name = row.anonymous ? undefined : names.get(row.ownerUserId)
    return name ? { name } : null
  }
}

/** What a signed-in viewer has on these recipes: their rating and the copy they saved. */
async function viewerInfo(db: Db, viewer: Actor | null | undefined, ids: string[]) {
  const ratings = new Map<string, number>()
  const copies = new Map<string, string>()
  if (!viewer?.userId || !ids.length) return { ratings, copies }
  const R = s.publicRecipeRatings
  for (const r of await inChunks(ids, (part) =>
    db
      .select({ id: R.publicRecipeId, stars: R.stars })
      .from(R)
      .where(
        and(inArray(R.publicRecipeId, part), eq(R.userId, viewer.userId), isNull(R.deletedAt)),
      ),
  ))
    ratings.set(r.id, r.stars)
  for (const c of await inChunks(ids, (part) =>
    db
      .select({ id: s.recipes.id, source: s.recipes.sourcePublicRecipeId })
      .from(s.recipes)
      .where(
        and(
          inArray(s.recipes.sourcePublicRecipeId, part),
          eq(s.recipes.householdId, viewer.householdId),
          isNull(s.recipes.deletedAt),
        ),
      ),
  ))
    if (c.source) copies.set(c.source, c.id)
  return { ratings, copies }
}

interface Entry {
  row: PublicRow
  leadId: string
  versionCount: number
}

/** The first live version of each recipe (the earliest created, as `recipeSnapshot` orders them) and the counts. */
async function leadEntries(db: Db, rows: PublicRow[]): Promise<Entry[]> {
  const vs = await inChunks(
    rows.map((r) => r.recipeId),
    (part) =>
      db
        .select({ id: s.recipeVersions.id, recipeId: s.recipeVersions.recipeId })
        .from(s.recipeVersions)
        .where(and(inArray(s.recipeVersions.recipeId, part), isNull(s.recipeVersions.deletedAt)))
        .orderBy(asc(s.recipeVersions.createdAt), asc(s.recipeVersions.id)),
  )
  const lead = new Map<string, string>()
  const count = new Map<string, number>()
  for (const v of vs) {
    if (!lead.has(v.recipeId)) lead.set(v.recipeId, v.id)
    count.set(v.recipeId, (count.get(v.recipeId) ?? 0) + 1)
  }
  return rows.flatMap((row) => {
    const leadId = lead.get(row.recipeId)
    return leadId ? [{ row, leadId, versionCount: count.get(row.recipeId) ?? 1 }] : []
  })
}

/**
 * Summaries for a list of public recipes, from the lead version's live data, loaded in bulk. `loaded` holds lead
 * versions the caller already has. A signed-in `viewer` also gets `isMine`, `myRating` and `savedAs` on each.
 */
async function summarize(
  db: Db,
  entries: Entry[],
  viewer?: Actor | null,
  loaded?: Map<string, LoadedVersion>,
) {
  const have = loaded ?? new Map<string, LoadedVersion>()
  const missing = entries.map((e) => e.leadId).filter((id) => !have.has(id))
  if (missing.length) for (const [k, v] of await loadPublicVersions(db, missing)) have.set(k, v)
  const authorOf = await authorNames(
    db,
    entries.map((e) => e.row),
  )
  const mine = await viewerInfo(
    db,
    viewer,
    entries.map((e) => e.row.id),
  )
  return entries.flatMap(({ row, leadId, versionCount }) => {
    const lead = have.get(leadId)
    if (!lead) return []
    const x = lead.version
    const isMine = !!viewer?.userId && row.ownerUserId === viewer.userId
    return [
      {
        id: row.id,
        title: lead.recipe.title,
        author: authorOf(row),
        anonymous: row.anonymous,
        description: x.description,
        course: x.course,
        kashrut: versionKashrut(lead),
        difficulty: x.difficulty,
        cost: x.cost,
        totalMinutes: x.totalMinutes ?? x.activeMinutes ?? null,
        servings: x.servings,
        tags: lead.tags.map((t) => t.tag),
        nutritionPerServing: perServing(x.nutrition, x.servings),
        versionCount,
        rating: rating(row),
        saves: row.saveCount,
        publishedAt: row.publishedAt,
        ...(viewer?.userId && {
          isMine,
          myRating: mine.ratings.get(row.id) ?? null,
          savedAs: mine.copies.get(row.id) ?? null,
        }),
        ...(isMine && { recipeId: row.recipeId }),
      },
    ]
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Publishing

export interface PublishInput {
  recipeId: string
  /** Hide the author's name. Default: shown. Sending it again changes it. */
  anonymous?: boolean
}

/**
 * Publishes a recipe, or changes how it is shown (anonymous). Only its author can publish it. The name shown is
 * always the author's profile name. Publishing again after unpublishing brings back the ratings.
 */
export async function publishRecipe(db: Db, actor: Actor, input: PublishInput) {
  const recipe = await liveRecipe(db, input.recipeId)
  if (!recipe || recipe.householdId !== actor.householdId) throw notFound('Recipe')
  if (recipe.ownerUserId !== actor.userId)
    throw forbidden('Only the person who wrote a recipe can make it public')
  const [version] = await db
    .select({ id: s.recipeVersions.id })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.recipeId, recipe.id), isNull(s.recipeVersions.deletedAt)))
    .limit(1)
  if (!version) throw notFound('Recipe')
  const existing = await findByRecipe(db, recipe.id)
  const now = Date.now()
  let id = existing?.id
  if (existing) {
    await db
      .update(s.publicRecipes)
      .set({
        anonymous: input.anonymous ?? existing.anonymous,
        updatedAt: now,
        // A republished recipe is new again for the "newest" sort.
        ...(existing.deletedAt && { deletedAt: null, publishedAt: now }),
      })
      .where(eq(s.publicRecipes.id, existing.id))
  } else {
    id = ulid()
    await db.insert(s.publicRecipes).values({
      id,
      recipeId: recipe.id,
      ownerUserId: actor.userId,
      anonymous: input.anonymous ?? false,
      publishedAt: now,
    })
  }
  return getPublicRecipe(db, id!, actor)
}

/** Takes a recipe off the public list. Copies other people saved stay with them; ratings are kept. */
export async function unpublishRecipe(db: Db, actor: Actor, recipeId: string) {
  const row = await findByRecipe(db, recipeId)
  if (!row || row.deletedAt || row.ownerUserId !== actor.userId) throw notFound('Public recipe')
  await db
    .update(s.publicRecipes)
    .set({ deletedAt: Date.now() })
    .where(eq(s.publicRecipes.id, row.id))
  return { unpublished: true }
}

/** Which of the actor's recipes are public, with their ratings and saves. */
export async function listMyPublic(db: Db, actor: Actor) {
  const found = await listedRows(db, eq(s.publicRecipes.ownerUserId, actor.userId))
  const entries = await leadEntries(
    db,
    found.map((f) => f.row),
  )
  const recipes = await summarize(db, entries, actor)
  return { recipes: recipes.sort((a, b) => b.publishedAt - a.publishedAt) }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

/**
 * One public recipe with all its versions, read live from the private recipe. A signed-in `viewer` also gets their
 * own rating, the copy they saved and whether it is theirs.
 */
export async function getPublicRecipe(db: Db, id: string, viewer?: Actor | null) {
  const { row, recipe } = await requireListed(db, id)
  const snap = await recipeSnapshot(db, recipe.householdId, 'dish', recipe.id)
  if (!snap) throw notFound('Public recipe')
  const versions = (snap.snapshot as { versions: SnapshotVersion[] }).versions
  const [entry] = await leadEntries(db, [row])
  const [summary] = entry ? await summarize(db, [entry], viewer) : []
  if (!summary) throw notFound('Public recipe')
  return { ...summary, versionCount: versions.length, versions }
}

export interface PublicSearchInput extends Pick<
  SearchInput,
  | 'q'
  | 'course'
  | 'kashrut'
  | 'difficulty'
  | 'maxCost'
  | 'maxMinutes'
  | 'tags'
  | 'nutrition'
  | 'minProteinG'
  | 'minFiberG'
  | 'maxCalories'
  | 'maxCarbsG'
  | 'maxSodiumMg'
  | 'maxSugarG'
  | 'limit'
  | 'offset'
> {
  sort?: 'relevance' | 'popular' | 'top_rated' | 'newest' | 'a_z' | 'quickest'
}

/** Meat / dairy / parve of the lead version in SQL: as declared, else from its ingredients (as `versionKashrut`). */
const leadKashrut = sql`CASE
  WHEN lv.category IS NOT NULL THEN lv.category
  WHEN EXISTS (SELECT 1 FROM ingredient_lines il JOIN ingredients i ON i.id = il.ingredient_id
    WHERE il.version_id = lv.id AND il.deleted_at IS NULL AND i.category = 'meat') THEN 'meat'
  WHEN EXISTS (SELECT 1 FROM ingredient_lines il JOIN ingredients i ON i.id = il.ingredient_id
    WHERE il.version_id = lv.id AND il.deleted_at IS NULL AND i.category = 'dairy') THEN 'dairy'
  ELSE 'parve' END`

/**
 * Search the public recipes. Text search is the private search's (the `recipe_fts` index, transliteration aliases),
 * one result per recipe. The filters apply to the lead version (the earliest live version), like the private
 * search: course, kashrut, difficulty, cost, time and tags in SQL; nutrition per serving on the loaded lead version,
 * as the private search does. Safe-for, Pesach and dimension filters need a household's data and are not offered.
 * A signed-in `viewer` also gets `isMine`, `myRating` and `savedAs` on each result.
 */
export async function searchPublic(db: Db, input: PublicSearchInput, viewer?: Actor | null) {
  const match = input.q ? ftsQuery(input.q) : null
  if (input.q && !match) return { total: 0, results: [], disclaimer: DISCLAIMER }
  const where: SQL[] = [sql`p.deleted_at IS NULL`, sql`r.deleted_at IS NULL`]
  if (match) where.push(sql`recipe_fts MATCH ${match}`)
  if (input.course !== undefined) where.push(sql`lower(lv.course) = ${input.course.toLowerCase()}`)
  if (input.kashrut !== undefined) where.push(sql`${leadKashrut} = ${input.kashrut}`)
  if (input.difficulty !== undefined) where.push(sql`lv.difficulty = ${input.difficulty}`)
  // A recipe with no cost or time on record is not ruled out, as in the private search.
  if (input.maxCost !== undefined) where.push(sql`coalesce(lv.cost, 0) <= ${input.maxCost}`)
  if (input.maxMinutes !== undefined)
    where.push(sql`coalesce(lv.total_minutes, lv.active_minutes, 0) <= ${input.maxMinutes}`)
  for (const k of new Set((input.tags ?? []).map(tagKey).filter(Boolean)))
    where.push(
      sql`EXISTS (SELECT 1 FROM version_tags vt WHERE vt.version_id = lv.id AND vt.key = ${k} AND vt.deleted_at IS NULL)`,
    )
  const from = sql`FROM public_recipes p
    JOIN recipes r ON r.id = p.recipe_id
    JOIN versions lv ON lv.id = (SELECT v2.id FROM versions v2 WHERE v2.recipe_id = p.recipe_id
      AND v2.deleted_at IS NULL ORDER BY v2.created_at, v2.id LIMIT 1)
    ${match ? sql`JOIN recipe_fts ON recipe_fts.recipe_id = p.recipe_id` : sql``}
    WHERE ${sql.join(where, sql` AND `)}
    GROUP BY p.id`

  const score = sql`(p.rating_sum + ${PRIOR_STARS * PRIOR_WEIGHT}) * 1.0 / (p.rating_count + ${PRIOR_WEIGHT})`
  const minutes = sql`coalesce(lv.total_minutes, lv.active_minutes)`
  const sort = input.sort ?? (match ? 'relevance' : 'popular')
  const order =
    sort === 'relevance' && match
      ? sql`min(recipe_fts.rank), r.title`
      : sort === 'top_rated'
        ? sql`${score} DESC, p.rating_count DESC, r.title`
        : sort === 'newest'
          ? sql`p.published_at DESC`
          : sort === 'a_z'
            ? sql`lower(r.title)`
            : sort === 'quickest'
              ? sql`${minutes} IS NULL, ${minutes}, r.title`
              : sql`(p.rating_count + p.save_count) DESC, ${score} DESC, r.title`

  const limit = Math.min(input.limit ?? 30, 100)
  const offset = input.offset ?? 0
  const bounds = nutritionBounds(input.nutrition, input)
  const pick = sql`SELECT p.id AS id, lv.id AS lead_id`

  let page: { id: string; lead_id: string }[]
  let total: number
  let loaded: Map<string, LoadedVersion> | undefined
  let unknownNutrition = 0
  if (bounds.length) {
    // Nutrition is worked out per serving in code, so the candidates are loaded and checked, then paged.
    const cands = await db.all<{ id: string; lead_id: string }>(
      sql`${pick} ${from} ORDER BY ${order} LIMIT ${NUTRITION_SCAN_LIMIT}`,
    )
    loaded = await loadPublicVersions(
      db,
      cands.map((c) => c.lead_id),
    )
    const kept = cands.filter((c) => {
      const v = loaded!.get(c.lead_id)
      if (!v) return false
      const r = meetsBounds(perServing(v.version.nutrition, v.version.servings), bounds)
      if (r === 'unknown') unknownNutrition++
      return r === 'yes'
    })
    total = kept.length
    page = kept.slice(offset, offset + limit)
  } else {
    const [{ n }] = await db.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM (SELECT p.id ${from})`,
    )
    total = n
    page = await db.all<{ id: string; lead_id: string }>(
      sql`${pick} ${from} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    )
  }

  const rows = await inChunks(
    page.map((r) => r.id),
    (part) => db.select().from(s.publicRecipes).where(inArray(s.publicRecipes.id, part)),
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const counts = await versionCounts(
    db,
    rows.map((r) => r.recipeId),
  )
  const entries: Entry[] = page.flatMap((p) => {
    const row = byId.get(p.id)
    return row ? [{ row, leadId: p.lead_id, versionCount: counts.get(row.recipeId) ?? 1 }] : []
  })
  return {
    total,
    ...(bounds.length && {
      nutritionNote:
        `Nutrition is per serving. ${unknownNutrition} recipe${unknownNutrition === 1 ? ' has' : 's have'} no ` +
        'figures for this filter and were left out. Figures marked "ai" are estimates.',
      unknownNutrition,
    }),
    results: await summarize(db, entries, viewer, loaded),
    disclaimer: DISCLAIMER,
  }
}

async function versionCounts(db: Db, recipeIds: string[]) {
  const rows = await inChunks(recipeIds, (part) =>
    db
      .select({ recipeId: s.recipeVersions.recipeId })
      .from(s.recipeVersions)
      .where(and(inArray(s.recipeVersions.recipeId, part), isNull(s.recipeVersions.deletedAt))),
  )
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.recipeId, (counts.get(r.recipeId) ?? 0) + 1)
  return counts
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

/**
 * Saves a public recipe to the actor's household as an independent copy that links back to the public original.
 * The save count is the number of distinct households that ever saved a copy (deleted copies count), recomputed
 * from `recipes`, so saving, deleting and saving again does not raise it.
 */
export async function savePublicRecipe(db: Db, actor: Actor, id: string) {
  const { row, recipe } = await requireListed(db, id)
  if (recipe.householdId === actor.householdId)
    throw conflict('This recipe is already in your household')
  const have = await existingCopy(db, actor, id)
  if (have) return { recipeId: have, alreadySaved: true as const }
  const snap = await recipeSnapshot(db, recipe.householdId, 'dish', recipe.id)
  if (!snap) throw notFound('Public recipe')
  const saved = await importSnapshots(
    db,
    actor,
    snap.title,
    (snap.snapshot as { versions: SnapshotVersion[] }).versions,
    row.id,
  )
  await db
    .update(s.publicRecipes)
    .set({
      saveCount: sql`(SELECT count(DISTINCT household_id) FROM recipes WHERE source_public_recipe_id = ${row.id})`,
    })
    .where(eq(s.publicRecipes.id, row.id))
  return { ...saved, alreadySaved: false as const }
}

/** Rates a public recipe 1-5 stars (changing your rating replaces it); null removes it. Not your own recipe. */
export async function ratePublicRecipe(db: Db, actor: Actor, id: string, stars: number | null) {
  const { row } = await requireListed(db, id)
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
  const [fresh] = await db.select().from(s.publicRecipes).where(eq(s.publicRecipes.id, id))
  return { myRating: stars, rating: rating(fresh) }
}

/**
 * The actor's own ratings, newest change first. Ratings on recipes that are not listed right now (unpublished, or
 * the recipe was deleted) are left out; they come back if the recipe is published again.
 */
export async function listMyRatings(db: Db, actor: Actor) {
  const R = s.publicRecipeRatings
  const rows = await db
    .select({
      id: s.publicRecipes.id,
      title: s.recipes.title,
      stars: R.stars,
      ratedAt: R.updatedAt,
    })
    .from(R)
    .innerJoin(s.publicRecipes, eq(s.publicRecipes.id, R.publicRecipeId))
    .innerJoin(s.recipes, eq(s.recipes.id, s.publicRecipes.recipeId))
    .where(
      and(
        eq(R.userId, actor.userId),
        isNull(R.deletedAt),
        isNull(s.publicRecipes.deletedAt),
        isNull(s.recipes.deletedAt),
        hasLiveVersion,
      ),
    )
    .orderBy(desc(R.updatedAt))
  return {
    ratings: rows.map((r) => ({
      publicRecipeId: r.id,
      title: r.title,
      stars: r.stars,
      ratedAt: r.ratedAt,
    })),
  }
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
  const [listed] = await listedRows(db, eq(s.publicRecipes.id, row.id))
  const authorOf = listed && (await authorNames(db, [row]))
  return {
    publicRecipeId: row.id,
    title: listed?.recipe.title ?? null,
    author: authorOf ? authorOf(row) : null,
    available: !!listed,
  }
}
