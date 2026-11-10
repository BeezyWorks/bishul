import { describe, expect, it } from 'vitest'

import { api, call, rpc, sign, testEnv, tool } from './helpers'

const SECRET = 'test-events-secret'
const publicGet = async (path: string) => (await (await call('GET', `/api${path}`)).json()) as any
const found = async (qs: string) => (await publicGet(`/public-recipes?${qs}`)) as any
const titles = async (qs: string) => (await found(qs)).results.map((x: any) => x.title)

const make = async (
  who: string,
  title: string,
  extra: { ingredients?: (string | object)[]; steps?: string[]; [k: string]: unknown } = {},
) => {
  const { ingredients = ['1 onion'], steps = ['Cook'], ...rest } = extra
  return (await api(
    who,
    'POST',
    '/recipes',
    {
      recipeTitle: title,
      servings: 4,
      ingredients: ingredients.map((i) => (typeof i === 'string' ? { text: i } : i)),
      steps: steps.map((text) => ({ text })),
      ...rest,
    },
    201,
  )) as any
}
const publish = async (who: string, recipeId: string, body: object = {}) =>
  (await api(who, 'PUT', `/recipes/${recipeId}/public`, body)) as any
const makePublic = async (who: string, title: string, extra: Parameters<typeof make>[2] = {}) => {
  const r = await make(who, title, extra)
  return { ...r, pub: await publish(who, r.version.recipeId) }
}

describe('public recipes (live)', () => {
  it('publish, find, edit once and the public recipe follows, save a copy with a link back, rate, unpublish', async () => {
    const r = await make('pub-a', 'Shabbos Kugel', {
      ingredients: ['4 potatoes', '2 eggs'],
      steps: ['Grate', 'Bake'],
      tags: ['from Savta'],
    })
    const recipeId = r.version.recipeId

    // Not public yet.
    expect((await found('q=kugel')).total).toBe(0)

    const pub = await publish('pub-a', recipeId)
    expect(pub.title).toBe('Shabbos Kugel')
    expect(pub.isMine).toBe(true)
    expect(pub.recipeId).toBe(recipeId)
    expect(pub.versions).toHaveLength(1)

    // Anyone finds it, with the same transliteration-folding search (Shabbat finds Shabbos).
    for (const q of ['kugel', 'shabbat', 'potato', 'savta']) {
      const res = await found(`q=${q}`)
      expect(res.total, q).toBe(1)
      expect(res.results[0].id).toBe(pub.id)
    }
    // Anonymous readers get no viewer fields and no ids of the owner or the private recipe.
    const anon = await publicGet(`/public-recipes/${pub.id}`)
    expect(anon).not.toHaveProperty('myRating')
    expect(anon).not.toHaveProperty('isMine')
    expect(anon).not.toHaveProperty('recipeId')
    expect(JSON.stringify(anon)).not.toMatch(/ownerUserId|owner_user_id/)

    // One edit of the private recipe: the public read and search show it, with no other step.
    await api('pub-a', 'PUT', `/versions/${r.version.id}`, {
      servings: 12,
      recipeTitle: 'Potato Kugel',
      tags: ['from Savta', 'parve'],
    })
    const after = await publicGet(`/public-recipes/${pub.id}`)
    expect(after.title).toBe('Potato Kugel')
    expect(after.versions[0].servings).toBe(12)
    expect(await titles('q=potato')).toEqual(['Potato Kugel'])
    expect((await found('tags=parve')).total).toBe(1)

    // A new variation of the published recipe shows up as a second version.
    await api(
      'pub-a',
      'POST',
      `/versions/${r.version.id}/variations`,
      { title: 'sweet potato' },
      201,
    )
    const two = await publicGet(`/public-recipes/${pub.id}`)
    expect(two.versions).toHaveLength(2)
    expect(two.versionCount).toBe(2)
    expect(two.versions.map((v: any) => v.title)).toContain('sweet potato')
    expect((await found('q=kugel')).results[0].versionCount).toBe(2)

    // Another user saves a copy: independent, with a link back.
    const saved = await api('pub-b', 'POST', `/public-recipes/${pub.id}/save`, {}, 201)
    expect(saved.alreadySaved).toBe(false)
    const copy = await api('pub-b', 'GET', `/recipes/${saved.recipeId}`)
    expect(copy.original).toMatchObject({
      publicRecipeId: pub.id,
      title: 'Potato Kugel',
      available: true,
    })
    expect(copy.versions).toHaveLength(2)
    const again = await api('pub-b', 'POST', `/public-recipes/${pub.id}/save`, {}, 201)
    expect(again).toMatchObject({ recipeId: saved.recipeId, alreadySaved: true })
    await api('pub-a', 'PUT', `/versions/${r.version.id}`, { servings: 20 })
    expect((await api('pub-b', 'GET', `/recipes/${saved.recipeId}`)).versions[0].servings).toBe(12)
    expect((await publicGet(`/public-recipes/${pub.id}`)).saves).toBe(1)
    // You can't save your own.
    await api('pub-a', 'POST', `/public-recipes/${pub.id}/save`, {}, 409)

    // Ratings: one per user, replaceable, not your own.
    await api('pub-a', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: 5 }, 403)
    await api('pub-b', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: 5 })
    await api('pub-c', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: 3 })
    const rated = await api('pub-b', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: 4 })
    expect(rated.rating).toEqual({ count: 2, average: 3.5 })
    await api('pub-c', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: null })
    expect((await publicGet(`/public-recipes/${pub.id}`)).rating).toEqual({ count: 1, average: 4 })
    await api('pub-b', 'PUT', `/public-recipes/${pub.id}/rating`, { stars: 9 }, 400)

    // Unpublish: gone from search and read; the saved copy stays and says the original is unavailable.
    await api('pub-a', 'DELETE', `/recipes/${recipeId}/public`)
    expect((await found('q=kugel')).total).toBe(0)
    expect((await call('GET', `/api/public-recipes/${pub.id}`)).status).toBe(404)
    const orphan = (await api('pub-b', 'GET', `/recipes/${saved.recipeId}`)).original
    expect(orphan).toMatchObject({ publicRecipeId: pub.id, available: false, title: null })

    // Publishing again revives it with its ratings.
    const back = await publish('pub-a', recipeId)
    expect(back.id).toBe(pub.id)
    expect(back.rating.count).toBe(1)
    expect((await found('q=kugel')).total).toBe(1)
  })

  it('an edit through the ingredient catalog reaches public search with no extra step', async () => {
    const r = await makePublic('cat-a', 'Spud Bake', { ingredients: ['3 spuds'] })
    expect((await found('q=tuber')).total).toBe(0)
    const ing = r.version.ingredients[0].ingredient
    await api('cat-a', 'PATCH', `/ingredients/${ing.id}`, { aliases: ['tuber'] })
    expect(await titles('q=tuber')).toEqual(['Spud Bake'])
    // And an edit to the lines of the version.
    await api('cat-a', 'PUT', `/versions/${r.version.id}`, { ingredients: [{ text: '2 turnips' }] })
    expect(await titles('q=turnips')).toEqual(['Spud Bake'])
    expect((await found('q=tuber')).total).toBe(0)
  })

  it('deleting a non-last version keeps it public; deleting the last version removes it', async () => {
    const r = await makePublic('del-a', 'Layer Cake', { ingredients: ['flour'] })
    const v2 = await api(
      'del-a',
      'POST',
      `/versions/${r.version.id}/variations`,
      { title: 'chocolate', ingredients: [{ text: 'cocoa' }] },
      201,
    )
    expect((await publicGet(`/public-recipes/${r.pub.id}`)).versions).toHaveLength(2)

    await api('del-a', 'DELETE', `/versions/${r.version.id}`)
    const read = await publicGet(`/public-recipes/${r.pub.id}`)
    expect(read.versions).toHaveLength(1)
    expect(read.versions[0].title).toBe('chocolate')
    expect(await titles('q=cake')).toEqual(['Layer Cake'])
    expect(await titles('q=cocoa')).toEqual(['Layer Cake'])
    expect((await found('q=flour')).total).toBe(0)

    await api('del-a', 'DELETE', `/versions/${v2.version.id}`)
    expect((await found('q=cake')).total).toBe(0)
    expect((await found('')).results.map((x: any) => x.id)).not.toContain(r.pub.id)
    expect((await call('GET', `/api/public-recipes/${r.pub.id}`)).status).toBe(404)
    expect((await api('del-a', 'GET', '/public-recipes/mine')).recipes).toEqual([])
  })

  it('the author is the profile name, never stored; anonymous hides it; the owner id never leaks', async () => {
    const r = await make('anon-a', 'Secret Sauce', { ingredients: ['1 cup tahini'] })
    const recipeId = r.version.recipeId
    const pub = await publish('anon-a', recipeId, { anonymous: true })
    expect(pub.anonymous).toBe(true)
    expect(pub.author).toBeNull()
    const read = await publicGet(`/public-recipes/${pub.id}`)
    expect(read.author).toBeNull()
    expect(JSON.stringify(read)).not.toMatch(/anon-a/)
    expect((await found('q=sauce')).results[0].author).toBeNull()

    await api('anon-b', 'PUT', `/recipes/${recipeId}/public`, {}, 404)

    // Shown: the name of the author's profile. A name sent in the body is not accepted or stored.
    const shown = await publish('anon-a', recipeId, { anonymous: false, authorName: 'Ignored' })
    expect(shown.author).toEqual({ name: 'User anon-a' })
    const people = (await api('anon-a', 'GET', '/people')).household.people
    const me = people.find((p: any) => p.name === 'User anon-a')
    await api('anon-a', 'PATCH', `/people/${me.id}`, { name: 'Savta Rivka' })
    expect((await publicGet(`/public-recipes/${pub.id}`)).author).toEqual({ name: 'Savta Rivka' })
    expect((await found('q=sauce')).results[0].author).toEqual({ name: 'Savta Rivka' })
    const col = await testEnv.DB.prepare('SELECT * FROM public_recipes WHERE id = ?')
      .bind(pub.id)
      .first<Record<string, unknown>>()
    expect(Object.keys(col!)).not.toContain('author_name')
    for (const doc of [await publicGet(`/public-recipes/${pub.id}`), await found('q=sauce')])
      expect(JSON.stringify(doc)).not.toMatch(/ownerUserId|owner_user_id|anon-a/)

    const mine = await api('anon-a', 'GET', '/public-recipes/mine')
    expect(mine.recipes.map((x: any) => x.id)).toEqual([pub.id])
    expect(mine.recipes[0].recipeId).toBe(recipeId)

    // Deleting the recipe's only version unlists it.
    await api('anon-a', 'DELETE', `/versions/${r.version.id}`)
    expect((await found('q=sauce')).total).toBe(0)
  })

  it('deleting the author account keeps the recipe public, anonymous and saveable', async () => {
    const r = await makePublic('gone-a', 'Heritage Cholent', { ingredients: ['beans', 'barley'] })
    const mine = await make('gone-a', 'Private Stew')
    const res = await call('POST', '/internal/account-deleted', { userId: 'gone-a' }, SECRET)
    expect(res.status).toBe(200)

    // The public recipe is still there with no author; the private one went with the household.
    const read = await publicGet(`/public-recipes/${r.pub.id}`)
    expect(read.title).toBe('Heritage Cholent')
    expect(read.author).toBeNull()
    expect(JSON.stringify(read)).not.toMatch(/gone-a/)
    expect(await titles('q=cholent')).toEqual(['Heritage Cholent'])
    expect((await found('q=cholent')).results[0].author).toBeNull()
    const privateRow = await testEnv.DB.prepare('SELECT deleted_at FROM recipes WHERE id = ?')
      .bind(mine.version.recipeId)
      .first<{ deleted_at: number | null }>()
    expect(privateRow?.deleted_at).not.toBeNull()

    // Still saveable, and the copy links back to it.
    const saved = await api('gone-b', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)
    expect(saved.alreadySaved).toBe(false)
    const copy = await api('gone-b', 'GET', `/recipes/${saved.recipeId}`)
    expect(copy.original).toMatchObject({
      publicRecipeId: r.pub.id,
      title: 'Heritage Cholent',
      author: null,
      available: true,
    })
    expect(copy.versions[0].ingredients).toHaveLength(2)
    await api('gone-c', 'PUT', `/public-recipes/${r.pub.id}/rating`, { stars: 5 })
    expect((await publicGet(`/public-recipes/${r.pub.id}`)).rating).toEqual({
      count: 1,
      average: 5,
    })
  })

  it('the save count is distinct households that ever saved, so it cannot be gamed', async () => {
    const r = await makePublic('sv-a', 'Gamed Soup')
    const read = async () => (await publicGet(`/public-recipes/${r.pub.id}`)).saves
    const first = await api('sv-b', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)
    expect(await read()).toBe(1)

    // Delete the copy and save again: still one household.
    await api('sv-b', 'DELETE', `/versions/${first.versionIds[0]}`)
    const second = await api('sv-b', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)
    expect(second.alreadySaved).toBe(false)
    expect(second.recipeId).not.toBe(first.recipeId)
    expect(await read()).toBe(1)
    await api('sv-b', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)
    expect(await read()).toBe(1)

    // A second household counts.
    await api('sv-c', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)
    expect(await read()).toBe(2)
  })

  it('filters on the lead version: maxCost 0 works, kashrut, course, difficulty, time, tags', async () => {
    await makePublic('flt-a', 'Cheap Salad', {
      course: 'salad',
      difficulty: 'easy',
      tags: ['Quick', 'fltzz'],
    })
    await makePublic('flt-a', 'Fancy Roast', {
      cost: 3,
      course: 'main',
      difficulty: 'a_pain',
      totalMinutes: 180,
      tags: ['fltzz'],
      ingredients: [{ text: '1 kg brisket', ingredient: { category: 'meat' } }],
    })
    await makePublic('flt-a', 'Mid Pasta', {
      cost: 2,
      totalMinutes: 30,
      category: 'dairy',
      tags: ['fltzz'],
    })
    const ft = (qs: string) => titles(`${qs}&tags=fltzz`)
    expect(await ft('')).toHaveLength(3)

    // Zero is a limit, not "no limit": recipes with a cost are out.
    expect(await ft('maxCost=0')).toEqual(['Cheap Salad'])
    expect((await ft('maxCost=2')).sort()).toEqual(['Cheap Salad', 'Mid Pasta'])
    expect(await ft('maxMinutes=0')).toEqual(['Cheap Salad'])
    expect((await ft('maxMinutes=30')).sort()).toEqual(['Cheap Salad', 'Mid Pasta'])
    expect(await ft('course=SALAD')).toEqual(['Cheap Salad'])
    expect(await ft('difficulty=a_pain')).toEqual(['Fancy Roast'])
    expect(await ft('kashrut=dairy')).toEqual(['Mid Pasta'])
    expect((await ft('kashrut=meat')).sort()).toEqual(['Fancy Roast'])
    expect((await ft('kashrut=parve')).sort()).toEqual(['Cheap Salad'])
    expect(await ft('')).toHaveLength(3)
    expect(await titles('tags=quick,fltzz')).toEqual(['Cheap Salad'])
    expect(await titles('tags=quick,spicy')).toEqual([])
    // Paging, with the total of all matches.
    const page = await found('sort=a_z&limit=2&offset=1&tags=fltzz')
    expect(page.total).toBe(3)
    expect(page.results.map((x: any) => x.title)).toEqual(['Fancy Roast', 'Mid Pasta'])
    expect(page.disclaimer).toMatch(/confirm allergies/)
  })

  it('filters by nutrition per serving on the lead version', async () => {
    await makePublic('nut-a', 'Lentil Stew', {
      tags: ['nutzz'],
      nutrition: { perServing: true, proteinG: 24, fiberG: 12, calories: 380, source: 'ai' },
    })
    // Whole-recipe figures: 80 g / 4 servings = 20 g each.
    await makePublic('nut-a', 'Chicken Bowl', {
      tags: ['nutzz'],
      nutrition: { perServing: false, proteinG: 80, fiberG: 4, calories: 2000 },
    })
    await makePublic('nut-a', 'Plain Rice', {
      tags: ['nutzz'],
      nutrition: { perServing: true, proteinG: 4 },
    })
    await makePublic('nut-a', 'Mystery Kugel', { tags: ['nutzz'] })

    const nt = (qs: string) => titles(`${qs}&tags=nutzz`)
    expect(await nt('nutrition=high_protein&sort=a_z')).toEqual(['Chicken Bowl', 'Lentil Stew'])
    expect(await nt('nutrition=high_protein&minProteinG=22')).toEqual(['Lentil Stew'])
    const protein = await found('minProteinG=10&sort=a_z&tags=nutzz')
    expect(protein.results.map((x: any) => x.title)).toEqual(['Chicken Bowl', 'Lentil Stew'])
    expect(protein.total).toBe(2)
    expect(protein.unknownNutrition).toBe(1)
    expect(protein.results[0].nutritionPerServing.proteinG).toBe(20)
    expect(await nt('nutrition=high_protein,high_fiber')).toEqual(['Lentil Stew'])
    expect(await nt('maxCalories=400')).toEqual(['Lentil Stew'])
    // Paging happens after the nutrition check.
    const paged = await found('minProteinG=10&sort=a_z&limit=1&offset=1&tags=nutzz')
    expect(paged.total).toBe(2)
    expect(paged.results.map((x: any) => x.title)).toEqual(['Lentil Stew'])
  })

  it('reading needs no sign-in; a valid token adds your rating and saved copy; a bad token is a 401', async () => {
    const r = await makePublic('opt-a', 'Optional Kugel')
    await api('opt-b', 'PUT', `/public-recipes/${r.pub.id}/rating`, { stars: 4 })
    const saved = await api('opt-b', 'POST', `/public-recipes/${r.pub.id}/save`, {}, 201)

    const anon = await call('GET', `/api/public-recipes/${r.pub.id}`)
    expect(anon.status).toBe(200)
    const anonBody = (await anon.json()) as any
    expect(anonBody).not.toHaveProperty('myRating')
    expect(anonBody).not.toHaveProperty('savedAs')
    expect((await call('GET', '/api/public-recipes?q=optional')).status).toBe(200)

    const mine = await api('opt-b', 'GET', `/public-recipes/${r.pub.id}`)
    expect(mine).toMatchObject({ myRating: 4, savedAs: saved.recipeId, isMine: false })
    const other = await api('opt-c', 'GET', `/public-recipes/${r.pub.id}`)
    expect(other).toMatchObject({ myRating: null, savedAs: null, isMine: false })
    const owner = await api('opt-a', 'GET', `/public-recipes/${r.pub.id}`)
    expect(owner).toMatchObject({ isMine: true, recipeId: r.version.recipeId })

    // The search results carry the viewer's fields too.
    const results = (await api('opt-b', 'GET', '/public-recipes?q=optional')).results
    expect(results[0]).toMatchObject({ myRating: 4, savedAs: saved.recipeId })
    expect((await found('q=optional')).results[0]).not.toHaveProperty('myRating')

    // A token that is not valid is refused, not treated as anonymous.
    expect(
      (await call('GET', `/api/public-recipes/${r.pub.id}`, undefined, 'expired')).status,
    ).toBe(401)
    expect((await call('GET', '/api/public-recipes?q=optional', undefined, 'expired')).status).toBe(
      401,
    )
    // Other public operations keep ignoring credentials, and signed-in-only ones still need them.
    expect((await call('GET', '/api/public-recipes/mine')).status).toBe(401)
  })

  it('lists my ratings, leaving out recipes that are not public right now', async () => {
    const a = await makePublic('rt-a', 'Rated One')
    const b = await makePublic('rt-a', 'Rated Two')
    await api('rt-b', 'PUT', `/public-recipes/${a.pub.id}/rating`, { stars: 5 })
    await api('rt-b', 'PUT', `/public-recipes/${b.pub.id}/rating`, { stars: 2 })
    const list = async () => (await api('rt-b', 'GET', '/public-recipes/ratings/mine')).ratings
    expect((await list()).map((x: any) => [x.title, x.stars])).toEqual([
      ['Rated Two', 2],
      ['Rated One', 5],
    ])
    expect((await list())[0].publicRecipeId).toBe(b.pub.id)

    await api('rt-a', 'DELETE', `/recipes/${b.version.recipeId}/public`)
    expect((await list()).map((x: any) => x.title)).toEqual(['Rated One'])
    await api('rt-b', 'PUT', `/public-recipes/${a.pub.id}/rating`, { stars: null })
    expect(await list()).toEqual([])
    expect((await call('GET', '/api/public-recipes/ratings/mine')).status).toBe(401)
  })

  it('sorts by popularity and rating', async () => {
    const low = await makePublic('srt-a', 'Zed Broth')
    const high = await makePublic('srt-a', 'Amy Broth')
    await api('srt-b', 'PUT', `/public-recipes/${low.pub.id}/rating`, { stars: 2 })
    await api('srt-b', 'PUT', `/public-recipes/${high.pub.id}/rating`, { stars: 5 })
    await api('srt-c', 'PUT', `/public-recipes/${high.pub.id}/rating`, { stars: 5 })
    expect(await titles('q=broth&sort=top_rated')).toEqual(['Amy Broth', 'Zed Broth'])
    expect(await titles('q=broth&sort=popular')).toEqual(['Amy Broth', 'Zed Broth'])
    expect(await titles('q=broth&sort=a_z')).toEqual(['Amy Broth', 'Zed Broth'])
    expect(await titles('q=broth&sort=newest')).toHaveLength(2)
    expect(await titles('q=broth&sort=quickest')).toHaveLength(2)
    expect(await titles('q=broth')).toHaveLength(2)
  })

  it('works through MCP: publish, search, rate, save, list, unpublish', async () => {
    const owner = await sign('mcp-a')
    const reader = await sign('mcp-b')
    const saved = await tool(owner, 'save_recipe', {
      recipeTitle: 'Tool Pottage',
      servings: 4,
      ingredients: [{ text: '1 leek' }],
      steps: [{ text: 'Simmer' }],
    })
    const recipeId = saved.data.version?.recipeId ?? saved.data.recipeId
    expect(recipeId).toBeTruthy()

    const pub = await tool(owner, 'publish_recipe', { recipeId })
    expect(pub.isError).toBe(false)
    expect(pub.data.author).toEqual({ name: expect.any(String) })
    expect(
      (await tool(owner, 'publish_recipe', { recipeId, anonymous: true })).data.author,
    ).toBeNull()
    const mine = await tool(owner, 'list_my_public_recipes')
    expect(mine.data.recipes.map((x: any) => x.id)).toEqual([pub.data.id])

    const res = await tool(reader, 'search_public_recipes', { q: 'pottage', sort: 'popular' })
    expect(res.data.total).toBe(1)
    expect(
      (await tool(reader, 'search_public_recipes', { q: 'pottage', maxCost: 0 })).data.total,
    ).toBe(1)
    expect(
      (await tool(reader, 'search_public_recipes', { q: 'pottage', minProteinG: 5 })).data.total,
    ).toBe(0)
    const rated = await tool(reader, 'rate_public_recipe', { id: pub.data.id, stars: 4 })
    expect(rated.data.rating.count).toBe(1)
    const ratings = await tool(reader, 'list_my_ratings')
    expect(ratings.data.ratings).toMatchObject([
      { publicRecipeId: pub.data.id, title: 'Tool Pottage', stars: 4 },
    ])
    expect((await tool(reader, 'get_public_recipe', { id: pub.data.id })).data).toMatchObject({
      myRating: 4,
      savedAs: null,
    })
    const copy = await tool(reader, 'save_public_recipe', { id: pub.data.id })
    expect(copy.data.alreadySaved).toBe(false)
    expect((await tool(reader, 'get_public_recipe', { id: pub.data.id })).data.savedAs).toBe(
      copy.data.recipeId,
    )

    const gone = await tool(owner, 'unpublish_recipe', { recipeId })
    expect(gone.data).toEqual({ unpublished: true })
    expect((await tool(owner, 'list_my_public_recipes')).data.recipes).toEqual([])
    expect((await tool(reader, 'search_public_recipes', { q: 'pottage' })).data.total).toBe(0)
    expect((await tool(reader, 'list_my_ratings')).data.ratings).toEqual([])

    // The tool list has the whole set, and publish_recipe has no unpublish flag or author name.
    const tools = (await rpc(owner, 'tools/list')).data.result.tools as any[]
    const names = tools.map((t) => t.name)
    for (const n of [
      'publish_recipe',
      'unpublish_recipe',
      'list_my_public_recipes',
      'get_public_recipe',
      'search_public_recipes',
      'save_public_recipe',
      'rate_public_recipe',
      'list_my_ratings',
    ])
      expect(names).toContain(n)
    const props = Object.keys(tools.find((t) => t.name === 'publish_recipe').inputSchema.properties)
    expect(props.sort()).toEqual(['anonymous', 'recipeId'])
  })
})
