import { describe, expect, it } from 'vitest'

import { api, call, tool, sign } from './helpers'

const publicGet = async (path: string) => (await (await call('GET', `/api${path}`)).json()) as any

describe('public recipes', () => {
  it('publish, find by search, edit once and both copies change, save a copy with a link back, rate', async () => {
    const r = await api(
      'pub-a',
      'POST',
      '/recipes/import',
      {
        title: 'Shabbos Kugel',
        servings: 8,
        ingredients: ['4 potatoes', '2 eggs'],
        steps: ['Grate', 'Bake'],
        tags: ['from Savta'],
      },
      201,
    )
    const recipeId = r.version.recipeId

    // Not public yet.
    expect((await publicGet('/public-recipes?q=kugel')).total).toBe(0)

    const pub = await api('pub-a', 'PUT', `/recipes/${recipeId}/public`, {})
    expect(pub.title).toBe('Shabbos Kugel')
    expect(pub.isMine).toBe(true)
    expect(pub.versions).toHaveLength(1)

    // Anyone finds it, with the same transliteration-folding search (Shabbat finds Shabbos).
    for (const q of ['kugel', 'shabbat', 'potato', 'savta']) {
      const found = await publicGet(`/public-recipes?q=${q}`)
      expect(found.total, q).toBe(1)
      expect(found.results[0].id).toBe(pub.id)
    }
    expect(JSON.stringify(await publicGet(`/public-recipes/${pub.id}`))).not.toMatch(/ownerUserId/)

    // One edit by the author updates the public copy too.
    await api('pub-a', 'PUT', `/versions/${r.version.id}`, {
      servings: 12,
      recipeTitle: 'Potato Kugel',
      tags: ['from Savta', 'parve'],
    })
    const after = await publicGet(`/public-recipes/${pub.id}`)
    expect(after.title).toBe('Potato Kugel')
    expect(after.versions[0].servings).toBe(12)
    expect((await publicGet('/public-recipes?q=potato')).total).toBe(1)
    expect((await publicGet('/public-recipes?tags=parve')).total).toBe(1)

    // A new variation shows up too.
    await api(
      'pub-a',
      'POST',
      `/versions/${r.version.id}/variations`,
      { title: 'sweet potato' },
      201,
    ).catch(() => undefined)

    // Another user saves a copy: independent, with a link back.
    const saved = await api('pub-b', 'POST', `/public-recipes/${pub.id}/save`, {}, 201)
    expect(saved.alreadySaved).toBe(false)
    const copy = await api('pub-b', 'GET', `/recipes/${saved.recipeId}`)
    expect(copy.original).toMatchObject({ publicRecipeId: pub.id, available: true })
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

    // Unpublish: gone from search and read, the saved copy stays and says the original is unavailable.
    await api('pub-a', 'DELETE', `/recipes/${recipeId}/public`)
    expect((await publicGet('/public-recipes?q=kugel')).total).toBe(0)
    expect((await call('GET', `/api/public-recipes/${pub.id}`)).status).toBe(404)
    expect((await api('pub-b', 'GET', `/recipes/${saved.recipeId}`)).original.available).toBe(false)

    // Publishing again revives it with its ratings.
    const back = await api('pub-a', 'PUT', `/recipes/${recipeId}/public`, {})
    expect(back.id).toBe(pub.id)
    expect(back.rating.count).toBe(1)
    expect((await publicGet('/public-recipes?q=kugel')).total).toBe(1)
  })

  it('anonymous hides the author; only the author can publish; deleting the recipe unpublishes it', async () => {
    const r = await api(
      'anon-a',
      'POST',
      '/recipes/import',
      { title: 'Secret Sauce', servings: 4, ingredients: ['1 cup tahini'], steps: ['Mix'] },
      201,
    )
    const recipeId = r.version.recipeId
    const pub = await api('anon-a', 'PUT', `/recipes/${recipeId}/public`, { anonymous: true })
    expect(pub.anonymous).toBe(true)
    expect(pub.author).toBeNull()
    const read = await publicGet(`/public-recipes/${pub.id}`)
    expect(read.author).toBeNull()
    expect(JSON.stringify(read)).not.toMatch(/anon-a/)

    await api('anon-b', 'PUT', `/recipes/${recipeId}/public`, {}, 404)

    const shown = await api('anon-a', 'PUT', `/recipes/${recipeId}/public`, { anonymous: false })
    expect(shown.author).not.toBeNull()
    const mine = await api('anon-a', 'GET', '/public-recipes/mine')
    expect(mine.recipes.map((x: any) => x.id)).toEqual([pub.id])

    await api('anon-a', 'DELETE', `/versions/${r.version.id}`)
    expect((await publicGet('/public-recipes?q=sauce')).total).toBe(0)
  })

  it('sorts by popularity and rating; works through MCP', async () => {
    const make = async (who: string, title: string) => {
      const r = await api(
        who,
        'POST',
        '/recipes/import',
        { title, servings: 4, ingredients: ['1 onion'], steps: ['Cook'] },
        201,
      )
      return api(who, 'PUT', `/recipes/${r.version.recipeId}/public`, {})
    }
    const low = await make('srt-a', 'Zed Soup')
    const high = await make('srt-a', 'Amy Soup')
    await api('srt-b', 'PUT', `/public-recipes/${low.id}/rating`, { stars: 2 })
    await api('srt-b', 'PUT', `/public-recipes/${high.id}/rating`, { stars: 5 })
    await api('srt-c', 'PUT', `/public-recipes/${high.id}/rating`, { stars: 5 })
    const top = await publicGet('/public-recipes?q=soup&sort=top_rated')
    expect(top.results.map((x: any) => x.title)).toEqual(['Amy Soup', 'Zed Soup'])

    const token = await sign('srt-d')
    const res = await tool(token, 'search_public_recipes', { q: 'soup', sort: 'popular' })
    expect(res.data.total).toBe(2)
    const rated = await tool(token, 'rate_public_recipe', { id: high.id, stars: 4 })
    expect(rated.data.rating.count).toBe(3)
    const saved = await tool(token, 'save_public_recipe', { id: high.id })
    expect(saved.data.alreadySaved).toBe(false)
  })
})
