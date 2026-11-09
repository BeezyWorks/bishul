import { describe, expect, it } from 'vitest'

import worker from '../index'
import { ORIGIN, api, call, testEnv } from './helpers'

const SECRET = 'test-events-secret'
const deleted = (userId: unknown, secret: string | null = SECRET) =>
  call('POST', '/internal/account-deleted', { userId }, secret ?? undefined)
const notify = (userId: string) => deleted(userId)

describe('account deletion notice', () => {
  it('refuses callers without the shared secret', async () => {
    const before = await api('ad-x', 'GET', '/people')
    expect((await deleted('ad-x', null)).status).toBe(401)
    expect((await deleted('ad-x', 'wrong')).status).toBe(401)
    // A user's own session token is not the secret.
    expect((await deleted('ad-x', 'ad-x')).status).toBe(401)
    expect((await api('ad-x', 'GET', '/people')).household.people).toHaveLength(
      before.household.people.length,
    )
  })

  it('refuses everything when no secret is configured', async () => {
    const saved = testEnv.ACCOUNT_EVENTS_SECRET
    testEnv.ACCOUNT_EVENTS_SECRET = undefined
    try {
      expect((await deleted('ad-x', SECRET)).status).toBe(401)
    } finally {
      testEnv.ACCOUNT_EVENTS_SECRET = saved
    }
  })

  it('needs a userId', async () => {
    expect((await deleted(undefined)).status).toBe(400)
    expect((await deleted('')).status).toBe(400)
  })

  it('breaks links, keeps the host layer, and retires a household of one', async () => {
    const who = 'ad-a'
    const me = (await api(who, 'GET', '/people')).household.people[0]
    await api(who, 'PUT', `/people/${me.id}/constraints`, {
      set: [{ tagType: 'allergen', tag: 'peanut', severity: 'strict' }],
      rules: ['no_fish_dairy'],
    })
    const recipe = await api(
      who,
      'POST',
      '/recipes/import',
      { servings: 4, title: 'Doomed soup', ingredients: ['1 onion'], steps: ['Cook'] },
      201,
    )
    const share = await api(who, 'POST', '/shares', { kind: 'profile', targetId: me.id }, 201)
    const key = await api(who, 'POST', '/keys', { scope: 'read' }, 201)
    const withKey = () =>
      worker.fetch(
        new Request(`${ORIGIN}/v1/people`, { headers: { authorization: `Bearer ${key.key}` } }),
        testEnv,
      )
    expect((await withKey()).status).toBe(200)

    const host = 'ad-host'
    const contact = await api(
      host,
      'POST',
      '/people',
      { name: 'Ari', newContactHousehold: 'Friends' },
      201,
    )
    await api(host, 'PUT', `/people/${contact.id}/constraints`, {
      add: [{ tagType: 'ingredient', tag: 'cilantro', kind: 'preference', severity: 'flexible' }],
    })
    await api(host, 'POST', `/people/${contact.id}/notes`, { text: 'Likes the window seat' }, 201)
    await api(host, 'POST', `/people/${contact.id}/link`, {
      profileToken: share.token,
      mode: 'merge',
    })
    const live = await api(host, 'GET', `/people/${contact.id}`)
    expect(live.person.constraints.map((c: any) => c.tag).sort()).toEqual(['cilantro', 'peanut'])

    expect((await notify(who)).status).toBe(200)

    // The contact is a plain ghost again: theirs is gone, the host's layer stays.
    const after = await api(host, 'GET', `/people/${contact.id}`)
    expect(after.person.link).toBeNull()
    expect(after.person.constraints.map((c: any) => c.tag)).toEqual(['cilantro'])
    expect(after.person.rules).toHaveLength(0)
    expect(after.person.notes).toHaveLength(1)
    expect(JSON.stringify(after)).not.toMatch(/peanut|no_fish_dairy/)

    // The profile link is dead and holds nothing.
    expect((await call('GET', `/api/shared/${share.token}`)).status).toBe(410)

    // Their household of one went with them, recipes included.
    const dbRecipe = await testEnv.DB.prepare('SELECT deleted_at FROM recipes WHERE id = ?')
      .bind(recipe.version.recipeId)
      .first<{ deleted_at: number | null }>()
    expect(dbRecipe?.deleted_at).not.toBeNull()
    const hh = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS n FROM households WHERE owner_user_id = ? AND deleted_at IS NULL',
    )
      .bind(who)
      .first<{ n: number }>()
    expect(hh?.n).toBe(0)
    const snap = await testEnv.DB.prepare(
      'SELECT snapshot, revoked_at FROM share_links WHERE token = ?',
    )
      .bind(share.token)
      .first<{ snapshot: string; revoked_at: number | null }>()
    expect(snap?.revoked_at).not.toBeNull()
    expect(JSON.parse(snap!.snapshot)).toEqual({})
    expect((await withKey()).status).toBe(401)

    // Idempotent.
    expect((await notify(who)).status).toBe(200)
  })

  it('hands a shared household to the remaining member and leaves their recipes with it', async () => {
    await api('ad-own', 'GET', '/people')
    const ownerRecipe = await api(
      'ad-own',
      'POST',
      '/recipes/import',
      { servings: 4, title: 'Owner cake', ingredients: ['2 eggs'], steps: ['Bake'] },
      201,
    )
    const invite = await api('ad-own', 'POST', '/household/invites', {}, 201)
    await api('ad-mem', 'POST', `/invites/${invite.token}/accept`, {})
    await api(
      'ad-mem',
      'POST',
      '/recipes/import',
      { servings: 4, title: 'Member pie', ingredients: ['1 apple'], steps: ['Bake'] },
      201,
    )

    expect((await notify('ad-own')).status).toBe(200)

    const h = await api('ad-mem', 'GET', '/household')
    expect(h.members.map((m: any) => m.userId)).toEqual(['ad-mem'])
    expect(h.persons.map((p: any) => p.userId)).toEqual(['ad-mem'])
    const row = await testEnv.DB.prepare('SELECT owner_user_id FROM households WHERE id = ?')
      .bind(h.id)
      .first<{ owner_user_id: string }>()
    expect(row?.owner_user_id).toBe('ad-mem')
    const titles = (await api('ad-mem', 'GET', '/recipes')).results.map((r: any) => r.title).sort()
    expect(titles).toEqual(['Member pie', 'Owner cake'])
    expect(ownerRecipe.version.id).toBeTruthy()
    // The new owner can run the household (e.g. invite).
    await api('ad-mem', 'POST', '/household/invites', {}, 201)
  })
})
