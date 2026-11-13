import { describe, expect, it } from 'vitest'

import { RETENTION_DAYS, purgeRetired } from '../services/purge'
import { api, call, testEnv } from './helpers'

const DAY = 24 * 60 * 60 * 1000
const db = testEnv.DB
const count = async (table: string, id: string) =>
  (await db
    .prepare(`SELECT count(*) AS n FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ n: number }>())!.n

async function recipe(who: string, title: string) {
  const r = await api(
    who,
    'POST',
    '/recipes',
    {
      recipeTitle: title,
      servings: 4,
      ingredients: [{ text: '2 eggs' }],
      steps: ['Mix.'],
    },
    201,
  )
  return { recipeId: r.version.recipeId as string, versionId: r.version.id as string }
}

describe('routine purge', () => {
  it('erases rows retired for longer than the retention period, with what hangs off them', async () => {
    const r = await recipe('pg-a', 'Old kugel')
    await api('pg-a', 'DELETE', `/versions/${r.versionId}`)
    const stamp = Date.now() - (RETENTION_DAYS + 1) * DAY
    await db
      .prepare(`UPDATE versions SET deleted_at = ? WHERE id = ?`)
      .bind(stamp, r.versionId)
      .run()
    await db.prepare(`UPDATE recipes SET deleted_at = ? WHERE id = ?`).bind(stamp, r.recipeId).run()

    const erased = await purgeRetired(db)
    expect(erased.versions).toBeGreaterThanOrEqual(1)
    expect(await count('versions', r.versionId)).toBe(0)
    expect(await count('recipes', r.recipeId)).toBe(0)
    const left = await db
      .prepare(`SELECT count(*) AS n FROM version_edits WHERE version_id = ?`)
      .bind(r.versionId)
      .first<{ n: number }>()
    expect(left!.n).toBe(0)
    const lines = await db
      .prepare(`SELECT count(*) AS n FROM ingredient_lines WHERE version_id = ?`)
      .bind(r.versionId)
      .first<{ n: number }>()
    expect(lines!.n).toBe(0)
  })

  it('keeps recently deleted rows and live rows', async () => {
    const recent = await recipe('pg-b', 'Recent')
    const live = await recipe('pg-b', 'Live')
    await api('pg-b', 'DELETE', `/versions/${recent.versionId}`)
    await purgeRetired(db)
    expect(await count('versions', recent.versionId)).toBe(1)
    expect(await count('versions', live.versionId)).toBe(1)
    // Just under the retention period is still kept.
    await db
      .prepare(`UPDATE versions SET deleted_at = ? WHERE id = ?`)
      .bind(Date.now() - (RETENTION_DAYS - 1) * DAY, recent.versionId)
      .run()
    await purgeRetired(db)
    expect(await count('versions', recent.versionId)).toBe(1)
  })

  it('leaves a retired row alone while something live still points at it', async () => {
    const r = await recipe('pg-c', 'Referenced')
    const stamp = Date.now() - (RETENTION_DAYS + 5) * DAY
    // The recipe is old and deleted, but its version is live: the version still needs it.
    await db.prepare(`UPDATE recipes SET deleted_at = ? WHERE id = ?`).bind(stamp, r.recipeId).run()
    await purgeRetired(db)
    expect(await count('recipes', r.recipeId)).toBe(1)
    expect(await count('versions', r.versionId)).toBe(1)
  })

  it('erases revoked API keys, share links and invites after the retention period', async () => {
    const stamp = Date.now() - (RETENTION_DAYS + 1) * DAY
    await db
      .prepare(
        `INSERT INTO api_keys (id, created_at, updated_at, user_id, hashed_key, prefix, scope, revoked_at)
         VALUES ('k-old', ?1, ?1, 'pg-d', 'h-old', 'tsk_old', 'read', ?1),
                ('k-new', ?2, ?2, 'pg-d', 'h-new', 'tsk_new', 'read', ?2),
                ('k-live', ?1, ?1, 'pg-d', 'h-live', 'tsk_live', 'read', NULL)`,
      )
      .bind(stamp, Date.now())
      .run()
    await purgeRetired(db)
    expect(await count('api_keys', 'k-old')).toBe(0)
    expect(await count('api_keys', 'k-new')).toBe(1)
    expect(await count('api_keys', 'k-live')).toBe(1)
  })

  it('is safe to run again and when there is nothing to do', async () => {
    await purgeRetired(db)
    expect(await purgeRetired(db)).toEqual({})
  })

  it('leaves nothing of a deleted account behind once the retention period has passed', async () => {
    const who = 'pg-gone'
    const me = (await api(who, 'GET', '/people')).household.people[0]
    await api(who, 'PUT', `/people/${me.id}/constraints`, {
      add: [{ tagType: 'allergen', tag: 'sesame', kind: 'medical', severity: 'strict' }],
    })
    const kugel = await recipe(who, 'Kugel')
    await api(who, 'POST', '/shares', { kind: 'version', id: kugel.versionId }).catch(() => null)
    const meal = await api(who, 'POST', '/meals', { date: '2026-12-04', name: 'Friday night' }, 201)
    await api(
      who,
      'POST',
      `/meals/${meal.meal.id}/dishes`,
      { course: 'main', versionId: kugel.versionId },
      201,
    )
    const household = (await api(who, 'GET', '/household')).id as string

    const gone = await call(
      'POST',
      '/internal/account-deleted',
      { userId: who },
      'test-events-secret',
    )
    expect(gone.status).toBe(200)

    // Pretend a month has passed: backdate everything retired.
    const old = Date.now() - (RETENTION_DAYS + 1) * DAY
    const tables = (
      await db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%fts%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`,
        )
        .all<{ name: string }>()
    ).results.map((t) => t.name)
    for (const t of tables) {
      const cols = (
        await db.prepare(`SELECT name FROM pragma_table_info(?)`).bind(t).all<{ name: string }>()
      ).results.map((c) => c.name)
      if (cols.includes('deleted_at'))
        await db
          .prepare(`UPDATE "${t}" SET deleted_at = ? WHERE deleted_at IS NOT NULL`)
          .bind(old)
          .run()
      if (cols.includes('revoked_at'))
        await db
          .prepare(`UPDATE "${t}" SET revoked_at = ? WHERE revoked_at IS NOT NULL`)
          .bind(old)
          .run()
    }
    await purgeRetired(db)
    const left = async (sql: string, ...args: unknown[]) =>
      (await db
        .prepare(sql)
        .bind(...args)
        .first<{ n: number }>())!.n
    expect(await left(`SELECT count(*) AS n FROM households WHERE id = ?`, household)).toBe(0)
    expect(await left(`SELECT count(*) AS n FROM persons WHERE household_id = ?`, household)).toBe(
      0,
    )
    expect(await left(`SELECT count(*) AS n FROM recipes WHERE household_id = ?`, household)).toBe(
      0,
    )
    expect(await left(`SELECT count(*) AS n FROM versions WHERE id = ?`, kugel.versionId)).toBe(0)
    expect(await left(`SELECT count(*) AS n FROM meals WHERE household_id = ?`, household)).toBe(0)
    expect(await left(`SELECT count(*) AS n FROM user_prefs WHERE user_id = ?`, who)).toBe(0)
    expect(await left(`SELECT count(*) AS n FROM api_keys WHERE user_id = ?`, who)).toBe(0)
  })
})
