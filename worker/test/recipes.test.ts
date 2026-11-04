import { describe, expect, it } from 'vitest'

import { api, call, sign, tool } from './helpers'

describe('recipe import', () => {
  it('parses ingredient lines as written: quantity, unit, name, prep note', async () => {
    const r = await api('rec-1', 'POST', '/recipes/import', {
      title: 'Chocolate cake',
      servings: 12,
      ingredients: [
        '1 1/2 cups all-purpose flour, sifted',
        '200 g dark chocolate',
        '3 large eggs',
        'a pinch of salt',
        '- 2 tbsp cocoa (optional)',
        'vanilla to taste',
      ],
      steps: ['1. Melt the chocolate.', '2. Mix.', 'Bake at 175C for 35 minutes.'],
      ingredientData: { 'all-purpose flour': { category: 'parve', flags: ['chametz'], densityGPerMl: 0.5 } },
    }, 201)
    const lines = r.version.ingredients
    expect(lines).toHaveLength(6)
    expect(lines[0]).toMatchObject({ name: 'All-purpose flour', prepNote: 'sifted', quantity: { unit: 'ml' } })
    expect(lines[0].quantity.amount).toBeCloseTo(354.88, 0)
    expect(lines[1].quantity).toEqual({ amount: 200, unit: 'g' })
    expect(lines[2]).toMatchObject({ name: 'Eggs', quantity: { amount: 3, unit: 'piece' } })
    expect(lines[3].skipImpact).toBe('minor')
    expect(lines[4].skipImpact).toBe('none')
    expect(lines[5].quantity).toBeNull()
    expect(r.version.steps.map((s: any) => s.text)).toEqual(['Melt the chocolate.', 'Mix.', 'Bake at 175C for 35 minutes.'])
    expect(r.version.pesach.friendly).toBe(false)
    expect(r.version.pesach.chametz).toEqual(['All-purpose flour'])
    // New ingredients without data are a guess, labelled AI.
    expect(r.needsReview).toContain('Vanilla')
    expect(r.newIngredients).toContain('Eggs')
  })

  it('dry run parses without saving; a pasted blob is split into title, ingredients and steps', async () => {
    const text = `Lemon bars
Serves 9

Ingredients
1 cup flour
1/2 cup butter
2 lemons

Instructions
1. Mix the crust.
2. Bake it.`
    const dry = await api('rec-2', 'POST', '/recipes/import', { text, dryRun: true }, 201)
    expect(dry.saved).toBe(false)
    expect(dry.parsed.title).toBe('Lemon bars')
    expect(dry.parsed.servings).toBe(9)
    expect(dry.parsed.ingredients.map((i: any) => i.name)).toEqual(['flour', 'butter', 'lemons'])
    expect(dry.parsed.steps).toEqual(['Mix the crust.', 'Bake it.'])
    expect((await api('rec-2', 'GET', '/recipes')).total).toBe(0)
    const saved = await api('rec-2', 'POST', '/recipes/import', { text }, 201)
    expect(saved.version.servings).toBe(9)
    expect((await api('rec-2', 'GET', '/recipes')).total).toBe(1)
  })

  it('reuses catalog ingredients across recipes, by name, plural and transliteration', async () => {
    const who = 'rec-3'
    await api(who, 'POST', '/recipes/import', { title: 'Hummus', ingredients: ['1 cup chickpeas', '3 tbsp techina'], steps: ['Blend'], ingredientData: { techina: { category: 'parve', aliases: ['tahini', 'tehina'], allergens: ['sesame'] } } }, 201)
    const r = await api(who, 'POST', '/recipes/import', { title: 'Tahini dressing', ingredients: ['2 tbsp tahini', '1 chickpea'], steps: ['Whisk'] }, 201)
    expect(r.newIngredients).toEqual([])
    expect(r.version.ingredients[0].ingredient.allergens[0].tag).toBe('sesame')
    expect((await api(who, 'GET', '/ingredients?q=chickpea')).length).toBe(1)
  })
})

describe('recipe search', () => {
  it('finds by text, with other spellings, ingredients and filters', async () => {
    const who = 'rec-4'
    await api(who, 'POST', '/recipes/import', { title: 'Shabbat cholent', course: 'main', category: 'meat', totalMinutes: 720, difficulty: 'easy', ingredients: ['500 g beef', '1 cup barley'], steps: ['Cook overnight'] }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Lemon tart', course: 'dessert', category: 'dairy', totalMinutes: 60, difficulty: 'a_pain', ingredients: ['3 lemons', '1 cup flour'], steps: ['Bake'], ingredientData: { flour: { category: 'parve', flags: ['chametz'] } } }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Cucumber salad', course: 'salad', category: 'parve', totalMinutes: 10, ingredients: ['2 cucumbers', '1 tbsp oil'], steps: ['Slice'] }, 201)

    const titles = async (qs: string) => (await api(who, 'GET', `/recipes?${qs}`)).results.map((r: any) => r.title)
    expect(await titles('q=shabbos')).toEqual(['Shabbat cholent'])
    expect(await titles('q=cholen')).toEqual(['Shabbat cholent'])
    expect(await titles('q=barley')).toEqual(['Shabbat cholent'])
    expect(await titles('q=lemon')).toEqual(['Lemon tart'])
    expect(await titles('course=salad')).toEqual(['Cucumber salad'])
    expect(await titles('kashrut=dairy')).toEqual(['Lemon tart'])
    expect(await titles('maxMinutes=30')).toEqual(['Cucumber salad'])
    expect(await titles('difficulty=easy')).toEqual(['Shabbat cholent'])
    // Barley is chametz by name, even though the catalog row carries no flag.
    expect(await titles('pesach=true')).toEqual(['Cucumber salad'])
    expect(await titles('sort=quickest')).toEqual(['Cucumber salad', 'Lemon tart', 'Shabbat cholent'])
    expect(await titles('q=nonexistentword')).toEqual([])
  })

  it('marks who cannot have a dish with safeFor, and can hide those dishes', async () => {
    const who = 'rec-5'
    await api(who, 'POST', '/recipes/import', { title: 'Sesame noodles', ingredients: ['2 tbsp sesame oil', '200 g noodles'], steps: ['Toss'], ingredientData: { 'sesame oil': { category: 'parve', allergens: ['sesame'] } } }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Plain rice', ingredients: ['1 cup rice'], steps: ['Boil'] }, 201)
    const noa = await api(who, 'POST', '/people', { name: 'Noa', newContactHousehold: 'Levis' }, 201)
    await api(who, 'PUT', `/people/${noa.id}/constraints`, { set: [{ tagType: 'allergen', tag: 'sesame', severity: 'strict' }] })
    const marked = await api(who, 'GET', `/recipes?safeFor=${noa.id}&sort=a_z`)
    const noodles = marked.results.find((r: any) => r.title === 'Sesame noodles')
    expect(noodles.unsafeFor[0]).toMatchObject({ personName: 'Noa' })
    expect(noodles.unsafeFor[0].reasons.join(' ')).toMatch(/sesame/i)
    expect(marked.results.find((r: any) => r.title === 'Plain rice').unsafeFor).toEqual([])
    expect(marked.disclaimer).toMatch(/on the host/i)
    const only = await api(who, 'GET', `/recipes?safeFor=${noa.id}&onlySafe=true`)
    expect(only.results.map((r: any) => r.title)).toEqual(['Plain rice'])
    expect((await api(who, 'GET', '/recipes')).disclaimer).toBeNull()
  })

  it('filters by dimension fit and by collection, and reads a saved collection back', async () => {
    const who = 'rec-6'
    const a = await api(who, 'POST', '/recipes/import', { title: 'Brisket', ingredients: ['1 kg brisket'], steps: ['Braise'] }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Tuna melt', ingredients: ['1 can tuna'], steps: ['Melt'] }, 201)
    await api(who, 'PUT', `/versions/${a.version.id}/dimensions`, { dimension: 'Leil Shabbat', fit: 'especially' })
    await api(who, 'PUT', `/versions/${a.version.id}/dimensions`, { dimension: 'Make-ahead', fit: 'fine' })
    const dims = await api(who, 'GET', '/dimensions')
    expect(dims.map((d: any) => d.name)).toEqual(
      expect.arrayContaining(['Leil Shabbat', 'Shabbat day', 'Weeknight', 'Pesach', 'Chanukah', 'Purim', 'Shavuot', 'Sukkot', 'Rosh Hashana', 'Yom Tov', 'Thanksgiving', 'Kids love it', 'Make-ahead', 'Sick friends']),
    )
    expect((await api(who, 'GET', '/recipes?dimension=leil_shabbat')).results.map((r: any) => r.title)).toEqual(['Brisket'])
    // minFit good (default) excludes a "fine" fit.
    expect((await api(who, 'GET', '/recipes?dimension=Make-ahead')).results).toHaveLength(0)
    expect((await api(who, 'GET', '/recipes?dimension=Make-ahead&minFit=fine')).results).toHaveLength(1)
    const col = await api(who, 'POST', '/collections', { name: 'Shabbat staples', filters: { dimension: 'Leil Shabbat' } }, 201)
    expect((await api(who, 'GET', `/recipes?collectionId=${col.id}`)).results.map((r: any) => r.title)).toEqual(['Brisket'])
    expect((await api(who, 'GET', '/collections'))[0].name).toBe('Shabbat staples')
    // A custom dimension.
    const dim = await api(who, 'POST', '/dimensions', { name: 'Sheva brachot' }, 201)
    expect(dim.builtIn).toBe(false)
    expect((await call('DELETE', '/api/dimensions/builtin_purim', undefined, who)).status).toBe(403)
  })
})

describe('versions', () => {
  it('edits in place with history (recording the face), forks a variation, and scales', async () => {
    const who = 'rec-7'
    const r = await api(who, 'POST', '/recipes/import', {
      title: 'Brownies',
      servings: 8,
      ingredients: ['200 g chocolate', '1 cup sugar', '3 eggs', '1 tsp baking powder'],
      steps: ['Melt', 'Mix', 'Bake'],
    }, 201)
    const v = r.version
    const edited = await api(who, 'PUT', `/versions/${v.id}`, { servings: 12, steps: ['Melt', 'Mix', 'Bake 25 min'] })
    expect(edited.created).toBe(false)
    expect(edited.version.servings).toBe(12)
    expect(edited.version.contentHash).not.toBe(v.contentHash)
    const noop = await api(who, 'PUT', `/versions/${v.id}`, { servings: 12 })
    expect(noop.version.updatedAt).toBe(edited.version.updatedAt)
    const hist = await api(who, 'GET', `/versions/${v.id}/history`)
    expect(hist).toHaveLength(2)
    expect(hist[0]).toMatchObject({ via: 'web', summary: expect.stringContaining('servings') })
    expect(hist[0].diff.changed.servings).toEqual([8, 12])

    const fork = await api(who, 'POST', `/versions/${v.id}/variations`, { title: 'Fudgy', ingredients: [{ text: '300 g chocolate' }, { text: '1 cup sugar' }, { text: '3 eggs' }] }, 201)
    expect(fork.version.title).toBe('Fudgy')
    expect(fork.version.parentVersionId).toBe(v.id)
    expect(fork.version.lineageId).toBe(v.lineageId)
    expect(fork.version.recipeId).toBe(v.recipeId)
    expect(fork.version.ingredients[0].quantity).toEqual({ amount: 300, unit: 'g' })
    expect((await api(who, 'GET', `/recipes/${v.recipeId}`)).versions).toHaveLength(2)
    // A fork copies steps and servings it was not told to change.
    expect(fork.version.servings).toBe(12)
    expect(fork.version.steps).toHaveLength(3)

    const scaled = await api(who, 'POST', `/versions/${v.id}/scale`, { toServings: 24 })
    expect(scaled.factor).toBe(2)
    expect(scaled.lines[0].quantity.amount).toBe(400)
    expect(scaled.warnings.some((w: any) => w.code === 'leavening')).toBe(true)
    expect((await api(who, 'GET', `/recipes/${v.recipeId}`)).versions).toHaveLength(2)
    const saved = await api(who, 'POST', `/versions/${v.id}/scale`, { factor: 2, saveAs: '2x' })
    expect(saved.saved.title).toBe('2x')
    expect(saved.saved.servings).toBe(24)
    expect(saved.saved.ingredients[0].quantity.amount).toBe(400)
    expect((await api(who, 'GET', `/recipes/${v.recipeId}`)).versions).toHaveLength(3)
  })

  it('corrects an ingredient, and the correction is labelled as a person’s', async () => {
    const who = 'rec-8'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Matzo balls', ingredients: ['1 cup matzo meal'], steps: ['Roll'] }, 201)
    const ing = r.version.ingredients[0].ingredient
    expect(ing.aiFilled).toBe(true)
    const updated = await api(who, 'PATCH', `/ingredients/${ing.id}`, { category: 'parve', flags: ['chametz'], allergens: ['wheat'], densityGPerMl: 0.6 })
    expect(updated.flags.chametz).toEqual({ value: true, source: 'user' })
    expect(updated.allergens).toEqual([{ tag: 'wheat', source: 'user' }])
    expect(updated.sources.density).toBe('user')
  })
})

describe('kitniyot and chametz by name', () => {
  it('flags rice as kitniyot, and a recipe is not kitniyot-free just because nothing was flagged by hand', async () => {
    const who = 'rec-9'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Rice pilaf', ingredients: ['2 cups basmati rice', '1 onion', '2 tbsp oil'], steps: ['Cook'] }, 201)
    expect(r.version.pesach.kitniyot).toEqual(['Basmati rice'])
    expect(r.version.pesach.friendly).toBe(true)
    expect(r.version.pesach.friendlyForKitniyotAvoiders).toBe(false)
    const m = await api(who, 'POST', '/recipes/import', { title: 'Kneidlach', ingredients: ['1 cup matzah meal', '2 eggs'], steps: ['Boil'] }, 201)
    expect(m.version.pesach).toMatchObject({ friendly: true, chametz: [], gebrokts: ['Matzah meal'] })
  })

  it('a Pesach search drops kitniyot once someone in the household avoids it', async () => {
    const who = 'rec-10'
    await api(who, 'POST', '/recipes/import', { title: 'Rice pilaf', ingredients: ['2 cups rice'], steps: ['Cook'] }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Roast potatoes', ingredients: ['1 kg potatoes'], steps: ['Roast'] }, 201)
    const titles = async () => (await api(who, 'GET', '/recipes?pesach=true&sort=a_z')).results.map((r: any) => r.title)
    expect(await titles()).toEqual(['Rice pilaf', 'Roast potatoes'])
    const me = (await api(who, 'GET', '/people')).household.people[0]
    await api(who, 'PUT', `/people/${me.id}/constraints`, { set: [{ tagType: 'kashrut_dish', tag: 'kitniyot', severity: 'strict', activeWhen: 'Pesach' }] })
    expect(await titles()).toEqual(['Roast potatoes'])
  })

  it('the dining brief excludes a rice dish for a no-kitniyot guest on Pesach, with no hand flags', async () => {
    const who = 'rec-11'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Rice pilaf', ingredients: ['2 cups rice'], steps: ['Cook'] }, 201)
    const noa = await api(who, 'POST', '/people', { name: 'Noa', newContactHousehold: 'Levis' }, 201)
    await api(who, 'PUT', `/people/${noa.id}/constraints`, { set: [{ tagType: 'kashrut_dish', tag: 'kitniyot', severity: 'strict', activeWhen: 'Pesach' }] })
    const marked = await api(who, 'GET', `/recipes?safeFor=${noa.id}&date=2027-04-23`)
    expect(marked.results.find((x: any) => x.recipeId === r.version.recipeId).unsafeFor[0].reasons.join(' ')).toMatch(/kitniyot/)
  })
})

describe('search returns one row per recipe', () => {
  it('nests the versions and counts recipes, not versions', async () => {
    const who = 'rec-12'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Lemon cake', ingredients: ['1 cup sugar', '2 lemons'], steps: ['Bake'] }, 201)
    await api(who, 'POST', `/versions/${r.version.id}/variations`, { title: 'Gluten free', ingredients: [{ text: '1 cup sugar' }, { text: '2 lemons' }] }, 201)
    await api(who, 'POST', '/recipes/import', { title: 'Lemon soup', ingredients: ['2 lemons'], steps: ['Simmer'] }, 201)
    for (const qs of ['q=lemon', '']) {
      const res = await api(who, 'GET', `/recipes?${qs}`)
      expect(res.total).toBe(2)
      expect(res.results).toHaveLength(2)
      const cake = res.results.find((x: any) => x.title === 'Lemon cake')
      expect(cake.versionCount).toBe(2)
      expect(cake.versions).toHaveLength(2)
      expect(cake.versions.map((v: any) => v.versionTitle).sort()).toEqual(['Gluten free', r.version.title].sort())
      expect(cake.versionId).toBe(cake.versions[0].versionId)
    }
  })
})

describe('reactions to a version', () => {
  it('sets, replaces and clears a reaction through the API and MCP', async () => {
    const who = 'rec-13'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Potato kugel', ingredients: ['1 kg potatoes', '3 eggs'], steps: ['Bake'] }, 201)
    const noa = await api(who, 'POST', '/people', { name: 'Noa', newContactHousehold: 'Levis' }, 201)
    const vid = r.version.id
    expect((await api(who, 'GET', `/versions/${vid}/reactions`)).reactions).toEqual([])

    const liked = await api(who, 'PUT', `/versions/${vid}/reactions`, { personId: noa.id, reaction: 'like', note: 'Crispy edges' })
    expect(liked.reactions).toMatchObject([{ personId: noa.id, personName: 'Noa', reaction: 'like', note: 'Crispy edges' }])
    const flipped = await api(who, 'PUT', `/versions/${vid}/reactions`, { personId: noa.id, reaction: 'dislike' })
    expect(flipped.reactions).toHaveLength(1)
    expect(flipped.reactions[0].reaction).toBe('dislike')

    const token = await sign(who)
    const cleared = await tool(token, 'record_reaction', { personId: noa.id, versionId: vid, reaction: 'none' })
    expect(cleared.data.reactions).toEqual([])
    const again = await tool(token, 'record_reaction', { personId: noa.id, versionId: vid, reaction: 'like' })
    expect(again.data.reactions).toHaveLength(1)
    expect((await api(who, 'PUT', `/versions/${vid}/reactions`, { personId: noa.id, reaction: 'none' })).reactions).toEqual([])
  })

  it('refuses someone else’s version or person', async () => {
    const r = await api('rec-14', 'POST', '/recipes/import', { title: 'Soup', ingredients: ['1 onion'], steps: ['Simmer'] }, 201)
    const noa = await api('rec-15', 'POST', '/people', { name: 'Noa', newContactHousehold: 'Levis' }, 201)
    const res = await call('PUT', `/api/versions/${r.version.id}/reactions`, { personId: noa.id, reaction: 'like' }, 'rec-15')
    expect(res.status).toBe(404)
  })
})
