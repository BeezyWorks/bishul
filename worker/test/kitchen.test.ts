import { describe, expect, it } from 'vitest'

import { api, nextFriday } from './helpers'

describe('pantry', () => {
  it('parses quantities, flags expired and expiring-soon items, and holds stock for accepted menus', async () => {
    const who = 'pan-1'
    const kugel = await api(who, 'POST', '/recipes/import', {
      title: 'Potato kugel',
      servings: 8,
      ingredients: ['6 potatoes', '3 eggs', '1/2 cup oil'],
      steps: ['Bake'],
    }, 201)
    const date = await nextFriday(who)
    const pantry0 = await api(who, 'GET', '/pantry')
    const soon = new Date(Date.parse(`${pantry0.today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10)

    await api(who, 'POST', '/pantry', { name: 'potatoes', quantity: '10', location: 'basement' }, 201)
    await api(who, 'POST', '/pantry', { name: 'eggs', quantity: 12, expiresOn: soon }, 201)
    await api(who, 'POST', '/pantry', { name: 'oil', quantity: '1 liter' }, 201)
    await api(who, 'POST', '/pantry', { name: 'old flour', quantity: '500 g', expiresOn: '2020-01-01' }, 201)

    let p = await api(who, 'GET', '/pantry')
    const by = (n: string) => p.items.find((i: any) => i.name.toLowerCase().includes(n))
    expect(by('oil')).toMatchObject({ amount: 1000, unit: 'ml' })
    expect(by('eggs')).toMatchObject({ amount: 12, unit: 'piece', expiringSoon: true, daysLeft: 3 })
    expect(by('flour')).toMatchObject({ expired: true })
    expect(by('potatoes').location).toBe('basement')
    expect(by('potatoes').held).toBeNull()

    const m = await api(who, 'POST', '/meals', { date, name: 'Dinner', items: [{ versionId: kugel.version.id }] }, 201)
    await api(who, 'POST', '/meals/accept', { mealIds: [m.meal.id] })
    p = await api(who, 'GET', '/pantry')
    expect(by('potatoes').held.amount).toBe(6)
    expect(by('potatoes').heldFor[0]).toMatchObject({ mealId: m.meal.id, name: 'Dinner', date })
    expect(by('eggs').held.amount).toBe(3)

    // The shopping list subtracts what the pantry covers: potatoes and eggs are covered, expired flour never counts.
    const shop = await api(who, 'GET', '/shopping')
    expect(shop.lines.find((l: any) => /potato/i.test(l.name))).toMatchObject({ covered: true })
    expect(shop.lines.find((l: any) => /egg/i.test(l.name))).toMatchObject({ covered: true })
    // Reopening the meal releases the holds.
    await api(who, 'POST', '/meals/reopen', { mealIds: [m.meal.id] })
    p = await api(who, 'GET', '/pantry')
    expect(by('potatoes').held).toBeNull()
  })

  it('applies several changes at once: use, set, remove', async () => {
    const who = 'pan-2'
    await api(who, 'POST', '/pantry', { name: 'sugar', quantity: '1 kg' }, 201)
    await api(who, 'POST', '/pantry', { name: 'rice', quantity: '500 g' }, 201)
    await api(who, 'POST', '/pantry/changes', {
      changes: [
        { op: 'use', name: 'sugar', quantity: '250 g' },
        { op: 'remove', name: 'rice' },
        { op: 'add', name: 'honey', quantity: '1 cup' },
      ],
    })
    const p = await api(who, 'GET', '/pantry')
    expect(p.items.map((i: any) => i.name).sort()).toEqual(['Honey', 'Sugar'])
    expect(p.items.find((i: any) => i.name === 'Sugar').amount).toBe(750)
  })

  it('gives chametz items the pre-Pesach cutoff as their effective expiry', async () => {
    const who = 'pan-3'
    await api(who, 'PATCH', '/household', { location: { lat: 40.7128, lng: -74.006, timeZone: 'America/New_York', israel: false } })
    await api(who, 'POST', '/pantry', { name: 'flour', quantity: '2 kg', ingredient: { category: 'parve', flags: ['chametz'] } }, 201)
    await api(who, 'POST', '/pantry', { name: 'rice', quantity: '1 kg' }, 201)
    const p = await api(who, 'GET', '/pantry')
    expect(p.chametzCutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const flour = p.items.find((i: any) => i.name === 'Flour')
    expect(flour).toMatchObject({ chametz: true, chametzLimited: true })
    expect(flour.effectiveExpiry).toBe(p.chametzCutoff)
    expect(p.items.find((i: any) => i.name === 'Rice').effectiveExpiry).toBeNull()
  })
})

describe('equipment', () => {
  it('keeps items with counts and designations', async () => {
    const who = 'eq-1'
    const pot = await api(who, 'POST', '/equipment', { item: 'Large pot', count: 2, designation: 'meat' }, 201)
    await api(who, 'POST', '/equipment', { item: 'Pesach pot', designation: 'pesach' }, 201)
    await api(who, 'PATCH', `/equipment/${pot.id}`, { count: 3 })
    const k = await api(who, 'GET', '/equipment')
    expect(k.equipment).toHaveLength(2)
    expect(k.equipment.find((e: any) => e.item === 'Large pot')).toMatchObject({ count: 3, designation: 'meat' })
    await api(who, 'DELETE', `/equipment/${pot.id}`)
    expect((await api(who, 'GET', '/equipment')).equipment).toHaveLength(1)
  })
})

describe('shopping list state', () => {
  it('stores order, checked state and manual lines', async () => {
    const who = 'shop-1'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Salad', ingredients: ['2 cucumbers', '3 tomatoes', '1 onion'], steps: ['Chop'] }, 201)
    const date = await nextFriday(who)
    const m = await api(who, 'POST', '/meals', { date, name: 'Lunch', items: [{ versionId: r.version.id }] }, 201)
    await api(who, 'POST', '/meals/accept', { mealIds: [m.meal.id] })
    let list = await api(who, 'GET', '/shopping')
    expect(list.lines).toHaveLength(3)
    const keys = list.lines.map((l: any) => l.key)
    await api(who, 'PATCH', '/shopping', { check: [{ key: keys[0], checked: true }], order: [keys[2], keys[1], keys[0]], addManual: ['paper towels'] })
    list = await api(who, 'GET', '/shopping')
    expect(list.lines.map((l: any) => l.key).filter((k: string) => keys.includes(k))).toEqual([keys[2], keys[1], keys[0]])
    expect(list.lines.find((l: any) => l.key === keys[0]).checked).toBe(true)
    const manual = list.lines.find((l: any) => l.manual)
    expect(manual.name).toBe('paper towels')
    await api(who, 'PATCH', '/shopping', { removeKeys: [manual.key], uncheckAll: true })
    list = await api(who, 'GET', '/shopping')
    expect(list.lines.some((l: any) => l.manual)).toBe(false)
    expect(list.lines.every((l: any) => !l.checked)).toBe(true)
  })

  it('adds sourcing notes only when a guest keeps a stricter standard than the host', async () => {
    const who = 'shop-2'
    const r = await api(who, 'POST', '/recipes/import', { title: 'Butter noodles', category: 'dairy', ingredients: ['200 g noodles', '50 g butter'], steps: ['Boil'], ingredientData: { butter: { category: 'dairy' } } }, 201)
    const guest = await api(who, 'POST', '/people', { name: 'Dina', newContactHousehold: 'Katz' }, 201)
    await api(who, 'PUT', `/people/${guest.id}/constraints`, { add: [{ tagType: 'kashrut_sourcing', tag: 'chalav Yisrael' }] })
    const date = await nextFriday(who)
    const m = await api(who, 'POST', '/meals', { date, name: 'Dairy lunch', personIds: [guest.id], items: [{ versionId: r.version.id }] }, 201)
    expect(m.brief.sourcingNotes[0].text).toMatch(/chalav yisrael/i)
    await api(who, 'POST', '/meals/accept', { mealIds: [m.meal.id] })
    const list = await api(who, 'GET', '/shopping')
    expect(list.lines.find((l: any) => /butter/i.test(l.name)).sourcingNotes.join(' ')).toMatch(/chalav yisrael/i)
    // If the host keeps it too, nothing is noted.
    const me = (await api(who, 'GET', '/people')).household.people[0]
    await api(who, 'PUT', `/people/${me.id}/constraints`, { add: [{ tagType: 'kashrut_sourcing', tag: 'cholov yisroel' }] })
    const again = await api(who, 'GET', `/meals/${m.meal.id}/brief`)
    expect(again.sourcingNotes).toHaveLength(0)
  })
})
