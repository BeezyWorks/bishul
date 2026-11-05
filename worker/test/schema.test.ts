import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as s from '../db/schema'
import { ulid } from '../db/ids'

const db = drizzle((env as unknown as { DB: D1Database }).DB, { schema: s })
const raw = (env as unknown as { DB: D1Database }).DB

const search = async (q: string) =>
  (
    await raw.prepare('SELECT version_id FROM recipe_fts WHERE recipe_fts MATCH ?').bind(q).all<{
      version_id: string
    }>()
  ).results.map((r) => r.version_id)

describe('schema', () => {
  it('ulid is 26 chars and sortable by time', () => {
    const a = ulid(1_000_000)
    const b = ulid(2_000_000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
  })

  it('stores a household, person, recipe, version, line and meal; FTS finds the recipe', async () => {
    const [household] = await db
      .insert(s.households)
      .values({
        ownerUserId: 'user-1',
        name: 'Cohen',
        location: { lat: 40.7, lng: -74, timeZone: 'America/New_York', israel: false },
      })
      .returning()
    expect(household.id).toHaveLength(26)
    expect(household.isGhost).toBe(false)
    expect(household.createdAt).toBeGreaterThan(0)

    const [person] = await db
      .insert(s.persons)
      .values({ householdId: household.id, userId: 'user-1', name: 'Dana' })
      .returning()
    await db.insert(s.constraints).values({
      personId: person.id,
      tagType: 'allergen',
      tag: 'sesame',
      kind: 'medical',
      severity: 'strict',
      source: 'self',
    })

    const [flour] = await db
      .insert(s.ingredients)
      .values({ name: 'Pargiyot', aliases: ['spring chicken'], category: 'meat' })
      .returning()

    const [recipe] = await db
      .insert(s.recipes)
      .values({ ownerUserId: 'user-1', householdId: household.id, title: 'Lemon Chicken' })
      .returning()
    const [version] = await db
      .insert(s.recipeVersions)
      .values({
        recipeId: recipe.id,
        lineageId: ulid(),
        contentHash: 'h1',
        title: 'Classic',
        description: 'Crispy roasted chicken with garlic',
        category: 'meat',
        flags: { kitniyot: { value: false, source: 'ai' } },
        prePrep: [{ step: 'marinate', lead_minutes: 720 }],
      })
      .returning()
    await db.insert(s.ingredientLines).values({
      versionId: version.id,
      position: 0,
      quantityMetric: 1000,
      unitMetric: 'g',
      originalText: '2 lb pargiyot',
      ingredientId: flour.id,
    })

    const [meal] = await db
      .insert(s.meals)
      .values({ householdId: household.id, date: '2026-11-06', name: 'Leil Shabbat', kind: 'meat' })
      .returning()
    await db.insert(s.mealAttendees).values({ mealId: meal.id, personId: person.id })
    await db.insert(s.mealItems).values({
      mealId: meal.id,
      position: 0,
      course: 'main',
      versionId: version.id,
      scale: 2,
      servings: 8,
    })
    await db.insert(s.mealItems).values({
      mealId: meal.id,
      position: 1,
      course: 'side',
      broughtBy: 'Ruth',
      description: 'potatoes',
      kashrut: 'parve',
    })

    const items = await db.select().from(s.mealItems).where(eq(s.mealItems.mealId, meal.id))
    expect(items).toHaveLength(2)

    // FTS: title, description, ingredient text and catalog alias all hit.
    expect(await search('lemon')).toEqual([version.id])
    expect(await search('garlic')).toEqual([version.id])
    expect(await search('pargiyot')).toEqual([version.id])
    expect(await search('spring')).toEqual([version.id])
    expect(await search('lem*')).toEqual([version.id])

    // Renaming the recipe re-indexes; soft-deleting the version drops it.
    await db.update(s.recipes).set({ title: 'Orange Chicken' }).where(eq(s.recipes.id, recipe.id))
    expect(await search('lemon')).toEqual([])
    expect(await search('orange')).toEqual([version.id])

    await db
      .update(s.ingredientLines)
      .set({ originalText: '2 lb thighs' })
      .where(eq(s.ingredientLines.versionId, version.id))
    expect(await search('thighs')).toEqual([version.id])

    await db
      .update(s.recipeVersions)
      .set({ deletedAt: Date.now() })
      .where(eq(s.recipeVersions.id, version.id))
    expect(await search('orange')).toEqual([])
  })
})
