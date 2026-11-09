import { describe, expect, it } from 'vitest'

import { normalizeTags, tagKey } from '../services/tags'
import { api, sign, tool } from './helpers'

const dish = (title: string, extra: object = {}) => ({
  title,
  servings: 4,
  ingredients: ['1 cup rice'],
  steps: ['Cook'],
  ...extra,
})

describe('tag folding', () => {
  it('folds case, hyphens, diacritics and other spellings to one key', () => {
    expect(tagKey('One-Pot')).toBe('one pot')
    expect(tagKey('  one   pot ')).toBe('one pot')
    expect(tagKey('Crème brûlée')).toBe('creme brulee')
    expect(tagKey('Shabbos')).toBe('shabbat')
    expect(tagKey('???')).toBe('')
  })

  it('keeps the first spelling, drops duplicates and blanks, and enforces limits', () => {
    expect(normalizeTags(['One-Pot', 'one pot', ' ', 'Spicy'])).toEqual([
      { tag: 'One-Pot', key: 'one pot' },
      { tag: 'Spicy', key: 'spicy' },
    ])
    expect(() => normalizeTags(['x'.repeat(31)])).toThrow()
    expect(() => normalizeTags(['!!!'])).toThrow()
    expect(() => normalizeTags(Array.from({ length: 13 }, (_, i) => `t${i}`))).toThrow()
  })
})

describe('recipe tags', () => {
  it('saves tags as typed, finds them by text and by filter, and lists them with counts', async () => {
    const who = 'tag-1'
    const a = await api(
      who,
      'POST',
      '/recipes/import',
      dish('Arrabbiata', { tags: ['Italian', 'spicy', 'One-Pot'] }),
      201,
    )
    await api(who, 'POST', '/recipes/import', dish('Carbonara', { tags: ['italian'] }), 201)
    await api(who, 'POST', '/recipes/import', dish('Plain rice'), 201)
    expect(a.version.tags).toEqual(['Italian', 'spicy', 'One-Pot'])

    // Plain text search matches tags.
    const q = await api(who, 'GET', '/recipes?q=spicy')
    expect(q.results.map((r: any) => r.title)).toEqual(['Arrabbiata'])
    // The filter needs every tag, and ignores case and hyphens.
    const both = await api(who, 'GET', '/recipes?tags=italian,one%20pot')
    expect(both.results.map((r: any) => r.title)).toEqual(['Arrabbiata'])
    const ital = await api(who, 'GET', '/recipes?tags=ITALIAN')
    expect(ital.results.map((r: any) => r.title).sort()).toEqual(['Arrabbiata', 'Carbonara'])
    expect(ital.results[0].tags).toBeDefined()
    // Text and tag combine.
    const mixed = await api(who, 'GET', '/recipes?q=carbonara&tags=italian')
    expect(mixed.results.map((r: any) => r.title)).toEqual(['Carbonara'])

    const list = await api(who, 'GET', '/tags')
    expect(list.tags[0]).toEqual({ tag: 'Italian', recipes: 2 })
    expect(list.tags).toHaveLength(3)
  })

  it('replaces tags on edit, keeps them when not sent, and only logs a real change', async () => {
    const who = 'tag-2'
    const r = await api(
      who,
      'POST',
      '/recipes/import',
      dish('Soup', { tags: ['cozy', 'winter'] }),
      201,
    )
    const id = r.version.id
    const same = await api(who, 'PUT', `/versions/${id}`, { description: 'Hot' })
    expect(same.version.tags).toEqual(['cozy', 'winter'])
    const edit = await api(who, 'PUT', `/versions/${id}`, { tags: ['Winter', 'vegan'] })
    // "Winter" is the same tag as the existing "winter", so the original spelling stays.
    expect(edit.version.tags.sort()).toEqual(['vegan', 'winter'])
    expect((await api(who, 'GET', '/recipes?tags=cozy')).results).toHaveLength(0)
    expect((await api(who, 'GET', '/recipes?q=cozy')).results).toHaveLength(0)
    expect((await api(who, 'GET', '/recipes?tags=vegan')).results).toHaveLength(1)
    const cleared = await api(who, 'PUT', `/versions/${id}`, { tags: [] })
    expect(cleared.version.tags).toEqual([])
    expect((await api(who, 'GET', '/tags')).tags).toEqual([])
  })

  it('carries tags into a variation, and through a shared link into a saved copy', async () => {
    const r = await api(
      'tag-3',
      'POST',
      '/recipes/import',
      dish('Shakshuka', { tags: ['spicy', 'Israeli'] }),
      201,
    )
    const v = await api(
      'tag-3',
      'POST',
      `/versions/${r.version.id}/variations`,
      { title: 'mild', tags: undefined },
      201,
    )
    expect(v.version.tags).toEqual(['spicy', 'Israeli'])
    const share = await api(
      'tag-3',
      'POST',
      '/shares',
      { kind: 'version', targetId: r.version.id },
      201,
    )
    const saved = await api('tag-4', 'POST', `/shared/${share.token}/save`, {}, 201)
    const copy = await api('tag-4', 'GET', `/versions/${saved.versionIds[0]}`)
    expect(copy.version.tags).toEqual(['spicy', 'Israeli'])
    // Tags are the saver's own from then on, and arrive in their vocabulary.
    expect((await api('tag-4', 'GET', '/tags')).tags).toHaveLength(2)
    expect((await api('tag-3', 'GET', '/tags')).tags).toHaveLength(2)
  })

  it('works through MCP: list_tags, then save and search by tag', async () => {
    const token = await sign('tag-5')
    await tool(token, 'import_recipe', dish('Hummus', { tags: ['dip', 'Middle Eastern'] }))
    const tags = await tool(token, 'list_tags')
    expect(JSON.stringify(tags)).toContain('Middle Eastern')
    const found = await tool(token, 'search_recipes', { tags: ['middle-eastern'] })
    expect(JSON.stringify(found)).toContain('Hummus')
  })

  it('turns the old spicy and kid_friendly flags into tags', async () => {
    const who = 'tag-6'
    const r = await api(
      who,
      'POST',
      '/recipes',
      dish('Chili', {
        recipeTitle: 'Chili',
        ingredients: [{ text: '1 cup beans' }],
        tags: ['Mexican'],
        flags: { spicy: true, kid_friendly: true, gebrokts: true },
      }),
      201,
    )
    expect(r.version.tags).toEqual(['Mexican', 'spicy', 'kid friendly'])
    expect(Object.keys(r.version.flags)).toEqual(['gebrokts'])
    // Setting one to false takes the tag off again.
    const v = await api(who, 'PUT', `/versions/${r.version.id}`, { flags: { spicy: false } })
    expect(v.version.tags).toEqual(['Mexican', 'kid friendly'])
  })
})
