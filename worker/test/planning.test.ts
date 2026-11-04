import { describe, expect, it } from 'vitest'

import { api, nextFriday } from './helpers'

const NY = { lat: 40.7128, lng: -74.006, timeZone: 'America/New_York', israel: false }

async function importAll(who: string) {
  const salad = await api(who, 'POST', '/recipes/import', {
    title: 'Tahini salad',
    course: 'salad',
    category: 'parve',
    servings: 6,
    activeMinutes: 15,
    totalMinutes: 15,
    ingredients: ['3 tbsp tahini', '1 cucumber, diced', '2 tomatoes'],
    steps: ['Mix everything.'],
    ingredientData: { tahini: { category: 'parve', allergens: ['sesame'] } },
  }, 201)
  const chicken = await api(who, 'POST', '/recipes/import', {
    title: 'Roast chicken',
    course: 'main',
    category: 'meat',
    servings: 6,
    activeMinutes: 30,
    totalMinutes: 120,
    ingredients: ['1 whole chicken', '2 tbsp olive oil', '1 tsp salt'],
    steps: ['Season.', 'Roast at 200C for 90 minutes.'],
    ingredientData: { chicken: { category: 'meat' } },
  }, 201)
  const kugel = await api(who, 'POST', '/recipes/import', {
    title: 'Potato kugel',
    course: 'side',
    category: 'parve',
    servings: 8,
    activeMinutes: 25,
    totalMinutes: 90,
    holdsOnBlech: true,
    ingredients: ['6 potatoes', '3 eggs', '1/2 cup oil', '1 tsp salt'],
    steps: ['Grate, mix, bake.'],
  }, 201)
  return { salad: salad.version, chicken: chicken.version, kugel: kugel.version }
}

describe('meal planning flow', () => {
  it('create meal, strict sesame guest hides the salad, add items, brief, accept, shopping and prep', async () => {
    const who = 'planner-1'
    await api(who, 'PATCH', '/household', { location: NY })
    const r = await importAll(who)
    // From the web app a person is vouching for what they enter; the same call over MCP or an API key is AI-filled.
    expect(r.salad.ingredients.find((i: any) => i.name === 'Tahini').ingredient.allergens).toEqual([{ tag: 'sesame', source: 'user' }])

    // Noa, a contact with a strict sesame allergy.
    const noa = await api(who, 'POST', '/people', { name: 'Noa', newContactHousehold: 'Levi family' }, 201)
    await api(who, 'PUT', `/people/${noa.id}/constraints`, {
      add: [{ tagType: 'allergen', tag: 'sesame', severity: 'strict' }],
    })

    const date = await nextFriday(who)
    const created = await api(who, 'POST', '/meals', {
      date,
      name: 'Friday night dinner',
      time: '19:00',
      kind: 'meat',
      personIds: [noa.id],
    }, 201)
    const mealId = created.meal.id
    expect(created.meal.attendees.map((a: any) => a.name)).toContain('Noa')
    expect(created.meal.occasions).toContain('leil_shabbat')
    expect(created.brief.activeConstraints.some((c: any) => c.constraint.tag.value === 'sesame')).toBe(true)

    // Suggestions for the salad course: the sesame dish is hidden, with why.
    const sug = await api(who, 'GET', `/meals/${mealId}/suggestions?course=salad`)
    expect(sug.suggestions.map((s: any) => s.title)).not.toContain('Tahini salad')
    const hidden = sug.hidden.find((h: any) => h.title === 'Tahini salad')
    expect(hidden.why.join(' ')).toMatch(/sesame/i)
    expect(sug.hasAllergyChecks).toBe(true)
    expect(sug.disclaimer).toMatch(/on the host/i)

    // Main and side fit.
    const mains = await api(who, 'GET', `/meals/${mealId}/suggestions?course=main`)
    expect(mains.suggestions.map((s: any) => s.title)).toContain('Roast chicken')

    // Add items, plus a brought dish.
    const withItems = await api(who, 'PATCH', `/meals/${mealId}`, {
      addItems: [
        { versionId: r.chicken.id, servings: 12 },
        { versionId: r.kugel.id },
        { brought: { description: 'Potato salad', by: 'Ruth', kashrut: 'parve', course: 'salad' } },
      ],
    })
    expect(withItems.meal.items).toHaveLength(3)
    expect(withItems.meal.items[0].scale).toBe(2)
    expect(withItems.brief.uncheckedDishes.map((d: any) => d.title)).toContain('Potato salad')

    // The sesame salad would be a hard exclusion.
    const bad = await api(who, 'PATCH', `/meals/${mealId}`, { addItems: [{ versionId: r.salad.id }] })
    expect(bad.brief.hardExclusions.length).toBeGreaterThan(0)
    const blocked = await api(who, 'POST', '/meals/accept', { mealIds: [mealId] })
    expect(blocked.accepted).toHaveLength(0)
    expect(blocked.blocked[0].problems.join(' ')).toMatch(/sesame/i)
    const saladItem = bad.meal.items.find((i: any) => i.title === 'Tahini salad')
    await api(who, 'PATCH', `/meals/${mealId}`, { removeItemIds: [saladItem.id] })

    // Dining brief on its own.
    const brief = await api(who, 'GET', `/meals/${mealId}/brief`)
    expect(brief.disclaimer).toMatch(/on the host/i)
    expect(brief.mealIssues.filter((i: any) => i.severity === 'error')).toHaveLength(0)

    // Accept.
    const accepted = await api(who, 'POST', '/meals/accept', { mealIds: [mealId] })
    expect(accepted.accepted).toHaveLength(1)

    const shop = await api(who, 'GET', '/shopping')
    expect(shop.lines.length).toBeGreaterThan(3)
    expect(shop.lines.map((l: any) => l.name.toLowerCase())).toEqual(expect.arrayContaining(['potatoes', 'eggs']))
    expect(shop.lines.find((l: any) => /chicken/i.test(l.name)).toBuyDisplay).toMatch(/buy 2/)

    const prep = await api(who, 'GET', '/prep')
    expect(prep.days.length).toBeGreaterThan(0)
    expect(prep.days.flatMap((d: any) => d.tasks).length).toBeGreaterThan(0)

    // Menu lookup reads the accepted plan.
    const menu = await api(who, 'GET', `/menu?date=${date}`)
    expect(menu.meals[0].items.map((i: any) => i.title)).toEqual(
      expect.arrayContaining(['Roast chicken', 'Potato kugel', 'Potato salad']),
    )

    // Editing an accepted meal reopens it for review.
    const edited = await api(who, 'PATCH', `/meals/${mealId}`, { removeItemIds: [withItems.meal.items[2].id] })
    expect(edited.reopened).toBe(true)
    expect(edited.meal.status).toBe('draft')
  })

  it('meat and dairy in one meal is a hard error', async () => {
    const who = 'planner-2'
    const r = await importAll(who)
    const cheese = await api(who, 'POST', '/recipes/import', {
      title: 'Cheese blintzes',
      category: 'dairy',
      course: 'dessert',
      ingredients: ['1 cup cottage cheese', '2 eggs'],
      steps: ['Fill and fry.'],
      ingredientData: { 'cottage cheese': { category: 'dairy' } },
    }, 201)
    const date = await nextFriday(who)
    const m = await api(who, 'POST', '/meals', { date, name: 'Lunch', items: [{ versionId: r.chicken.id }, { versionId: cheese.version.id }] }, 201)
    expect(m.brief.mealIssues.some((i: any) => i.severity === 'error')).toBe(true)
    const res = await api(who, 'POST', '/meals/accept', { mealIds: [m.meal.id] })
    expect(res.blocked).toHaveLength(1)
  })

  it('suggest_menu proposes without applying, then applies', async () => {
    const who = 'planner-3'
    await importAll(who)
    const date = await nextFriday(who)
    const m = await api(who, 'POST', '/meals', { date, name: 'Friday night', kind: 'meat' }, 201)
    const proposed = await api(who, 'POST', `/meals/${m.meal.id}/suggest-menu`, {})
    expect(proposed.applied).toBe(false)
    expect(proposed.menu.length).toBeGreaterThan(0)
    expect((await api(who, 'GET', `/meals/${m.meal.id}`)).meal.items).toHaveLength(0)
    const applied = await api(who, 'POST', `/meals/${m.meal.id}/suggest-menu`, { apply: true })
    expect(applied.applied).toBe(true)
    expect((await api(who, 'GET', `/meals/${m.meal.id}`)).meal.items.length).toBe(applied.menu.length)
  })

  it('writes serving history once the date has passed, and uses up pantry stock', async () => {
    const who = 'planner-4'
    await api(who, 'PATCH', '/household', { location: NY })
    const r = await importAll(who)
    await api(who, 'POST', '/pantry', { name: 'potatoes', quantity: '10' }, 201)
    await api(who, 'POST', '/pantry', { name: 'eggs', quantity: '2' }, 201)
    const m = await api(who, 'POST', '/meals', { date: '2026-01-02', name: 'Old dinner', items: [{ versionId: r.kugel.id }] }, 201)
    const hold = await api(who, 'POST', '/meals/accept', { mealIds: [m.meal.id] })
    expect(hold.accepted).toHaveLength(1)
    // Reading anything settles it: the household's person was served the kugel and the pantry shrank.
    const people = await api(who, 'GET', '/people')
    const me = people.household.people[0]
    const person = await api(who, 'GET', `/people/${me.id}`)
    expect(person.person.served.map((x: any) => x.title)).toContain('Potato kugel')
    const pantry = await api(who, 'GET', '/pantry')
    const potatoes = pantry.items.find((i: any) => /potato/i.test(i.name))
    expect(potatoes.amount).toBe(4)
    // Search can find what has not been served for a long time.
    const long = await api(who, 'GET', '/recipes?notServedWeeks=1')
    expect(long.results.map((x: any) => x.title)).toContain('Potato kugel')
    const recent = await api(who, 'GET', '/recipes?notServedWeeks=500')
    expect(recent.results.map((x: any) => x.title)).not.toContain('Potato kugel')
    expect(recent.results.length).toBe(2)
  })
})
