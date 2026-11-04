import { describe, expect, it } from 'vitest'

import { api, call } from './helpers'

describe('share links', () => {
  it('are snapshots: later edits do not change them; anyone can read; a signed-in user saves a copy with lineage', async () => {
    const r = await api('sh-a', 'POST', '/recipes/import', {
      title: 'Babka',
      servings: 10,
      ingredients: ['4 cups flour', '1 cup sugar', '2 eggs'],
      steps: ['Knead', 'Rise', 'Bake'],
      ingredientData: { flour: { category: 'parve', flags: ['chametz'], allergens: ['wheat'] } },
    }, 201)
    const share = await api('sh-a', 'POST', '/shares', { kind: 'version', targetId: r.version.id }, 201)
    expect(share.url).toMatch(/\/s\/.+/)

    // The recipe changes afterwards.
    await api('sh-a', 'PUT', `/versions/${r.version.id}`, { servings: 20, steps: ['Totally different'] })

    // No account needed to read the link, and it still shows the recipe as it was.
    const pub = await call('GET', `/api/shared/${share.token}`)
    expect(pub.status).toBe(200)
    const snap = (await pub.json()) as any
    expect(snap.kind).toBe('version')
    expect(snap.recipe.title).toBe('Babka')
    expect(snap.version.servings).toBe(10)
    expect(snap.version.steps.map((s: any) => s.text)).toEqual(['Knead', 'Rise', 'Bake'])
    expect(snap.version.ingredients[0].catalog.allergens).toEqual(['wheat'])
    expect(snap.version.ingredients[0].catalog.flags.chametz).toBe(true)
    expect((await call('GET', `/v1/shared/${share.token}`)).status).toBe(200)
    expect(JSON.stringify(snap)).not.toMatch(/sh-a/)

    // Another user saves it.
    const saved = await api('sh-b', 'POST', `/shared/${share.token}/save`, {}, 201)
    const copy = await api('sh-b', 'GET', `/versions/${saved.versionIds[0]}`)
    expect(copy.version.servings).toBe(10)
    expect(copy.version.lineageId).toBe(r.version.lineageId)
    expect(copy.version.id).not.toBe(r.version.id)
    expect(copy.version.ingredients[0].ingredient.flags.chametz.value).toBe(true)
    // The copy is independent.
    await api('sh-b', 'PUT', `/versions/${copy.version.id}`, { servings: 3 })
    expect((await api('sh-a', 'GET', `/versions/${r.version.id}`)).version.servings).toBe(20)

    // Only the sender can revoke; revoked links answer 410.
    expect((await call('DELETE', `/api/shares/${share.id}`, undefined, 'sh-b')).status).toBe(404)
    await api('sh-a', 'DELETE', `/shares/${share.id}`)
    expect((await call('GET', `/api/shared/${share.token}`)).status).toBe(410)
    expect((await call('POST', `/api/shared/${share.token}/save`, {}, 'sh-c')).status).toBe(410)
    expect(await api('sh-a', 'GET', '/shares')).toEqual([])
  })

  it('shares a dish with all its versions, keeping parents', async () => {
    const r = await api('sh-d', 'POST', '/recipes/import', { title: 'Challah', ingredients: ['1 kg flour'], steps: ['Braid'] }, 201)
    await api('sh-d', 'POST', `/versions/${r.version.id}/variations`, { title: 'Whole wheat' }, 201)
    const share = await api('sh-d', 'POST', '/shares', { kind: 'dish', targetId: r.version.recipeId }, 201)
    const saved = await api('sh-e', 'POST', `/shared/${share.token}/save`, {}, 201)
    expect(saved.versionIds).toHaveLength(2)
    const recipe = await api('sh-e', 'GET', `/recipes/${saved.recipeId}`)
    expect(recipe.versions.map((v: any) => v.title).sort()).toEqual(['Challah', 'Whole wheat'])
    const fork = recipe.versions.find((v: any) => v.title === 'Whole wheat')
    expect(fork.parentVersionId).toBe(recipe.versions.find((v: any) => v.title === 'Challah').id)
  })

  it('shares a profile with only the person’s own data, which a host can link to a contact', async () => {
    const who = 'sh-f'
    const me = (await api(who, 'GET', '/people')).household.people[0]
    await api(who, 'PUT', `/people/${me.id}/constraints`, { set: [{ tagType: 'allergen', tag: 'peanut', severity: 'strict' }], rules: ['no_fish_dairy'] })
    const share = await api(who, 'POST', '/shares', { kind: 'profile', targetId: me.id }, 201)
    const snap = (await (await call('GET', `/api/shared/${share.token}`)).json()) as any
    expect(snap.constraints).toHaveLength(1)
    expect(snap.rules).toEqual(['no_fish_dairy'])

    // A host links a contact: merge keeps what she entered and adds theirs; her notes stay private.
    const host = 'sh-g'
    const contact = await api(host, 'POST', '/people', { name: 'Fran', newContactHousehold: 'Friends' }, 201)
    await api(host, 'PUT', `/people/${contact.id}/constraints`, { add: [{ tagType: 'ingredient', tag: 'cilantro', kind: 'preference', severity: 'flexible' }] })
    await api(host, 'POST', `/people/${contact.id}/notes`, { text: 'Prefers sitting near the door' }, 201)
    const linked = await api(host, 'POST', `/people/${contact.id}/link`, { profileToken: share.token, mode: 'merge' })
    expect(linked.link.mode).toBe('merge')
    expect(linked.constraints.map((c: any) => `${c.tag}:${c.layer}`).sort()).toEqual(['cilantro:private', 'peanut:profile'])
    expect(linked.rules.map((r: any) => r.rule)).toEqual(['no_fish_dairy'])
    // Their change flows through live.
    await api(who, 'PUT', `/people/${me.id}/constraints`, { add: [{ tagType: 'allergen', tag: 'sesame', severity: 'strict' }] })
    const live = await api(host, 'GET', `/people/${contact.id}`)
    expect(live.person.constraints.map((c: any) => c.tag).sort()).toEqual(['cilantro', 'peanut', 'sesame'])
    // The real person never sees the host's layer.
    const mine = await api(who, 'GET', `/people/${me.id}`)
    expect(JSON.stringify(mine)).not.toMatch(/cilantro|Prefers sitting/)
    // Overwrite drops what the host entered; notes stay.
    const over = await api(host, 'POST', `/people/${contact.id}/link`, { profileToken: share.token, mode: 'overwrite' })
    expect(over.constraints.map((c: any) => c.tag).sort()).toEqual(['peanut', 'sesame'])
    expect(over.notes).toHaveLength(1)
    // Unlinking breaks the flow; the private layer stays.
    const unl = await api(host, 'DELETE', `/people/${contact.id}/link`)
    expect(unl.link).toBeNull()
    expect(unl.constraints).toHaveLength(0)
    expect(unl.notes).toHaveLength(1)
    // A profile can only be shared from your own household, and only linked to a contact.
    expect((await call('POST', '/api/shares', { kind: 'profile', targetId: contact.id }, host)).status).toBe(400)
    expect((await call('POST', `/api/people/${me.id}/link`, { profileToken: share.token, mode: 'merge' }, who)).status).toBe(400)
  })
})
