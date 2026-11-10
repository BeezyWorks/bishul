import { describe, expect, it } from 'vitest'

import { api, sign, tool } from './helpers'

const NY = { lat: 40.7128, lng: -74.006, timeZone: 'America/New_York', israel: false }
const JLM = { lat: 31.7683, lng: 35.2137, timeZone: 'Asia/Jerusalem', israel: true }

async function recipe(
  who: string,
  title: string,
  course: string,
  category: string,
  ings: string[],
  data = {},
) {
  const r = await api(
    who,
    'POST',
    '/recipes/import',
    {
      title,
      course,
      category,
      servings: 6,
      activeMinutes: 20,
      totalMinutes: 40,
      ingredients: ings,
      steps: ['Cook.'],
      ingredientData: data,
    },
    201,
  )
  return r.version.id as string
}

async function household(who: string, name: string, people: { name: string; child?: boolean }[]) {
  const h = await api(who, 'POST', '/contacts', { name }, 201)
  const ids: string[] = []
  for (const p of people) {
    const created = await api(
      who,
      'POST',
      '/people',
      { name: p.name, isChild: !!p.child, contactHouseholdId: h.id },
      201,
    )
    ids.push(created.id)
  }
  return { id: h.id as string, people: ids }
}

describe('the week and runs', () => {
  it('a Pesach week: one run, the Seder on the eve, virtual default meals', async () => {
    const who = 'week-1'
    await api(who, 'PATCH', '/household', { location: NY })
    const w = await api(who, 'GET', '/week?date=2027-04-21')
    expect(w.from).toBe('2027-04-18')
    expect(w.to).toBe('2027-04-24')
    expect(w.days).toHaveLength(7)
    expect(w.runs).toHaveLength(1)
    const run = w.runs[0]
    expect(run).toMatchObject({
      key: 'run-2027-04-22',
      title: 'Pesach · first days',
      mealCount: 6,
      toPlan: 6,
    })
    expect(run.holyDays.map((d: any) => d.label)).toEqual(['Pesach I', 'Pesach II', 'Shabbat'])
    expect(run.holyDays[0].meals.map((m: any) => [m.name, m.slot, m.virtual, m.date])).toEqual([
      ['Seder I', 'dinner', true, '2027-04-21'],
      ['Yom Tov day', 'lunch', true, '2027-04-22'],
    ])
    const erev = w.days[3]
    expect(erev.date).toBe('2027-04-21')
    expect(erev.eve).toMatchObject({ mealName: 'Seder I', runKey: 'run-2027-04-22', meal: null })
    expect(w.days[4].holyDay).toEqual({ runKey: 'run-2027-04-22', label: 'Pesach I' })
    expect(w.days[0].meals).toEqual([])
  })

  it('Israel: Shvi’i shel Pesach is a tile of its own', async () => {
    const who = 'week-il'
    await api(who, 'PATCH', '/household', { location: JLM })
    const w = await api(who, 'GET', '/week?date=2027-04-28')
    expect(w.runs.map((r: any) => r.title)).toEqual(["Shvi'i shel Pesach", 'Shabbat Achrei Mot'])
    expect(w.days[2].eve.mealName).toBe('Leil Yom Tov')
  })

  it('never shows a public holiday', async () => {
    const who = 'week-ph'
    await api(who, 'PATCH', '/household', { location: NY })
    const w = await api(who, 'GET', '/week?date=2028-12-25')
    const wed = w.days.find((d: any) => d.date === '2028-12-25')
    expect(wed.holidays).toEqual([])
    const m = await api(who, 'POST', '/meals', { date: '2028-12-25', hosted: true }, 201)
    expect(m.meal.name).toBe('Monday dinner')
  })

  it('a plan over a month', async () => {
    const who = 'week-m'
    await api(who, 'PATCH', '/household', { location: NY })
    const p = await api(who, 'GET', '/plan?from=2027-04-01&to=2027-05-02')
    expect(p.days).toHaveLength(32)
    expect(p.runs.length).toBeGreaterThanOrEqual(5)
  })
})

describe('everyday meals become hosted', () => {
  it('inviting a household makes a weekday dinner hosted and names it; removing keeps it', async () => {
    const who = 'host-1'
    await api(who, 'PATCH', '/household', { location: NY })
    const roths = await household(who, 'The Roths', [
      { name: 'Avi' },
      { name: 'Miriam' },
      { name: 'Tova', child: true },
    ])
    const created = await api(who, 'POST', '/meals', { date: '2027-04-20' }, 201)
    const id = created.meal.id
    expect(created.meal).toMatchObject({
      name: 'Dinner',
      slot: 'dinner',
      hosted: false,
      nameEdited: false,
    })

    let w = await api(who, 'GET', '/week?date=2027-04-20')
    const card = w.days[2].meals[0]
    expect(card).toMatchObject({ id, hosted: false, hasGuests: false, summary: [], planned: false })
    expect(card.hostedKey).toBe(`meal-${id}`)

    const view = await api(who, 'POST', `/meals/${id}/households`, { householdId: roths.id }, 200)
    expect(view).toMatchObject({
      hosted: true,
      name: 'Tuesday dinner',
      guestHouseholds: 1,
      hasGuests: true,
    })
    expect(view.households.map((h: any) => [h.isHost, h.removable])).toEqual([
      [true, false],
      [false, true],
    ])
    expect(view.households[1].name).toBe('The Roths')
    expect(view.headcount).toEqual({ adults: 3, children: 1, total: 4 })
    expect(view.households[1].countsText).toBe('2 adults, 1 child')

    // Untick Tova: a plain toggle, and the household shows who is away.
    const away = await api(who, 'PUT', `/meals/${id}/people/${roths.people[2]}`, { present: false })
    expect(away.headcount).toEqual({ adults: 3, children: 0, total: 3 })
    expect(away.households[1].awayText).toBe('Tova away')
    expect(away.households[1].members.find((m: any) => m.name === 'Tova').present).toBe(false)
    const back = await api(who, 'PUT', `/meals/${id}/people/${roths.people[2]}`, { present: true })
    expect(back.headcount.children).toBe(1)

    // A renamed meal keeps its name.
    await api(who, 'PATCH', `/meals/${id}`, { name: 'Bubby’s birthday' })
    await api(who, 'PATCH', `/meals/${id}`, { date: '2027-05-04' })
    const moved = await api(who, 'GET', `/hosted/meal-${id}`)
    expect(moved.title).toBe('Bubby’s birthday')

    // Removing every guest keeps the meal hosted.
    const gone = await api(who, 'DELETE', `/meals/${id}/households/${roths.id}`)
    expect(gone).toMatchObject({ hosted: true, guestHouseholds: 0, name: 'Bubby’s birthday' })
    expect(gone.households).toHaveLength(1)
  })

  it('an unrenamed meal follows its day when moved, and the slot orders the day', async () => {
    const who = 'host-2'
    await api(who, 'PATCH', '/household', { location: NY })
    const a = await api(who, 'POST', '/meals', { date: '2027-04-20', hosted: true }, 201)
    expect(a.meal.name).toBe('Tuesday dinner')
    await api(who, 'PATCH', `/meals/${a.meal.id}`, { date: '2027-04-21', slot: 'lunch' })
    const b = await api(who, 'POST', '/meals', { date: '2027-04-21', slot: 'breakfast' }, 201)
    const c = await api(
      who,
      'POST',
      '/meals',
      { date: '2027-04-21', slot: 'oneg', name: 'Shalom zachor' },
      201,
    )
    const d = await api(who, 'POST', '/meals', { date: '2027-04-21', slot: 'dinner' }, 201)
    expect(d.meal.name).toBe('Seder I')
    const w = await api(who, 'GET', '/week?date=2027-04-21')
    const wed = w.days[3]
    expect(wed.meals.map((m: any) => m.slot)).toEqual(['breakfast', 'lunch'])
    // Wednesday's evening belongs to Pesach I, so the dinner and oneg are in the run.
    expect(wed.eve.meal).toMatchObject({ slot: 'dinner' })
    const run = w.runs[0].holyDays[0].meals
    expect(run.map((m: any) => m.slot)).toEqual(['dinner', 'oneg', 'lunch'])
    expect(run.find((m: any) => m.slot === 'oneg').name).toBe('Shalom zachor')
    void b
    void c
  })
})

describe('the hosted page', () => {
  it('menu by course, summary rule, allergy naming the dish, gap, headcounts, search', async () => {
    const who = 'host-3'
    await api(who, 'PATCH', '/household', { location: NY })
    const brisket = await recipe(who, 'Brisket', 'main', 'meat', ['2 lb brisket'], {
      brisket: { category: 'meat' },
    })
    const kugel = await recipe(who, 'Potato kugel', 'side', 'parve', ['6 potatoes'])
    const macaroons = await recipe(
      who,
      'Almond macaroons',
      'dessert',
      'parve',
      ['2 cups almonds'],
      {
        almonds: { category: 'parve', allergens: ['tree nuts'] },
      },
    )
    const lasagne = await recipe(who, 'Vegetable lasagne', 'main', 'parve', ['1 zucchini'])
    const kohens = await household(who, 'The Kohens', [{ name: 'Sarah' }, { name: 'Ari' }])
    const roths = await household(who, 'The Roths', [{ name: 'Avi' }, { name: 'Miriam' }])
    await api(who, 'PUT', `/people/${kohens.people[1]}/constraints`, {
      add: [{ tagType: 'allergen', tag: 'tree nuts', severity: 'strict' }],
    })
    await api(who, 'PUT', `/people/${roths.people[1]}/constraints`, {
      add: [{ tagType: 'diet', tag: 'vegetarian', severity: 'strict' }],
    })

    // The Seder I meal, made from the eve link.
    const ens = await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-22',
      part: 'night',
    })
    expect(ens).toMatchObject({ created: true, hostedKey: 'run-2027-04-22' })
    const again = await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-22',
      part: 'night',
    })
    expect(again).toMatchObject({ created: false, mealId: ens.mealId })
    const id = ens.mealId

    await api(who, 'POST', `/meals/${id}/households`, { householdId: kohens.id })
    await api(who, 'POST', `/meals/${id}/households`, { householdId: roths.id })
    await api(who, 'POST', `/meals/${id}/dishes`, { course: 'main', versionId: brisket }, 201)
    await api(who, 'POST', `/meals/${id}/dishes`, { course: 'starter', versionId: kugel }, 201)
    const v = await api(
      who,
      'POST',
      `/meals/${id}/dishes`,
      { course: 'dessert', versionId: macaroons },
      201,
    )

    const mac = v.menu.find((c: any) => c.course === 'dessert').items[0]
    expect(mac.problems[0]).toMatchObject({
      kind: 'allergy',
      dishTitle: 'Almond macaroons',
      personName: 'Ari',
    })
    expect(v.menu.map((c: any) => c.course)).toEqual(['main', 'side', 'dessert'])
    expect(v.menu[0].items.map((i: any) => i.title)).toEqual(['Brisket'])
    // The kugel is a side, which still gives Miriam something to eat, so there is no gap.
    expect(v.problems).toMatchObject({ allergies: 1, gaps: 0 })
    expect(v.disclaimer).toMatch(/on the host/)
    const kohenRow = v.households.find((h: any) => h.name === 'The Kohens')
    expect(kohenRow.constraints[0]).toMatchObject({ text: 'tree nuts', strictAllergy: true })
    expect(kohenRow.members.find((m: any) => m.name === 'Ari').constraints[0].strictAllergy).toBe(
      true,
    )

    // The page of the run: this meal is real, the other five are placeholders.
    const page = await api(who, 'GET', '/hosted/run-2027-04-22')
    expect(page).toMatchObject({ type: 'run', key: 'run-2027-04-22', paper: 'letter' })
    expect(page.totals).toMatchObject({ meals: 6, toPlan: 5, withGuests: 1, withProblems: 1 })
    expect(page.days.map((d: any) => d.label)).toEqual(['Pesach I', 'Pesach II', 'Shabbat'])
    expect(page.fixes.map((f: any) => f.kind).sort()).toEqual(['allergy'])
    expect(page.fixes[0].mealName).toBe('Seder I')
    // Asking for the meal's key gives its run.
    expect((await api(who, 'GET', `/hosted/meal-${id}`)).key).toBe('run-2027-04-22')

    // The week tile: main course in menu order.
    const w = await api(who, 'GET', '/week?date=2027-04-22')
    const seder = w.runs[0].holyDays[0].meals[0]
    expect(seder.summary).toEqual(['Brisket'])
    expect(w.runs[0].problems).toMatchObject({ allergies: 1, gaps: 0 })

    // Recipe search for this meal: the macaroons fail for Ari, the vegetable lasagne passes.
    const found = await api(who, 'GET', `/meals/${id}/recipes?q=almond`)
    expect(found.excluded.map((h: any) => h.title)).toEqual(['Almond macaroons'])
    expect(found.excluded[0].why.join(' ')).toMatch(/tree nuts/i)
    expect(found.excluded[0].failsFor.map((p: any) => p.personName)).toEqual(['Ari'])
    const veg = await api(who, 'GET', `/meals/${id}/recipes?q=lasagne`)
    expect(veg.fits.map((h: any) => h.title)).toEqual(['Vegetable lasagne'])
    expect(veg.disclaimer).toMatch(/on the host/)
    const meaty = await api(who, 'GET', `/meals/${id}/recipes?q=brisket`)
    expect(meaty.excluded.map((h: any) => h.title)).toEqual(['Brisket'])
    void lasagne

    // Move the dessert to the sides; add a dish without a recipe; remove one.
    const moved = await api(who, 'POST', `/meals/${id}/dishes/${mac.itemId}/move`, {
      course: 'side',
    })
    expect(moved.menu[1].items.map((i: any) => i.title)).toEqual([
      'Potato kugel',
      'Almond macaroons',
    ])
    const free = await api(
      who,
      'POST',
      `/meals/${id}/dishes`,
      { course: 'main', description: 'Green beans' },
      201,
    )
    const gb = free.menu[0].items.find((i: any) => i.title === 'Green beans')
    expect(gb).toMatchObject({ noRecipe: true, recipeId: null })
    const brisketItem = free.menu[0].items.find((i: any) => i.title === 'Brisket')
    const reordered = await api(who, 'POST', `/meals/${id}/dishes/${gb.itemId}/move`, {
      course: 'main',
      beforeItemId: brisketItem.itemId,
    })
    expect(reordered.menu[0].items.map((i: any) => i.title)).toEqual(['Green beans', 'Brisket'])
    const removed = await api(who, 'DELETE', `/meals/${id}/dishes/${gb.itemId}`)
    expect(removed.menu[0].items.map((i: any) => i.title)).toEqual(['Brisket'])
  })

  it('soft-deleting a default meal does not bring its placeholder back', async () => {
    const who = 'host-4'
    await api(who, 'PATCH', '/household', { location: NY })
    const ens = await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-23',
      part: 'day',
    })
    expect((await api(who, 'GET', '/hosted/run-2027-04-22')).totals.meals).toBe(6)
    await api(who, 'DELETE', `/meals/${ens.mealId}`)
    const page = await api(who, 'GET', '/hosted/run-2027-04-22')
    expect(page.totals.meals).toBe(5)
    // Asking again brings it back.
    await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-23',
      part: 'day',
    })
    expect((await api(who, 'GET', '/hosted/run-2027-04-22')).totals.meals).toBe(6)
  })

  it('rejects other households’ data', async () => {
    await api('host-5a', 'PATCH', '/household', { location: NY })
    const mine = await api('host-5a', 'POST', '/meals', { date: '2027-04-20' }, 201)
    await api('host-5b', 'GET', '/week')
    await api('host-5b', 'GET', `/hosted/meal-${mine.meal.id}`, undefined, 404)
    await api('host-5b', 'POST', `/meals/${mine.meal.id}/households`, { householdId: 'x' }, 404)
  })
})

describe('MCP tools', () => {
  it('get_week, get_hosted, manage_meal_guests and manage_meal_dishes', async () => {
    const who = 'mcp-host'
    const token = await sign(who)
    await api(who, 'PATCH', '/household', { location: NY })
    const roths = await household(who, 'The Roths', [{ name: 'Avi' }])
    const kugel = await recipe(who, 'Potato kugel', 'side', 'parve', ['6 potatoes'])
    const week = await tool(token, 'get_week', { date: '2027-04-22' })
    expect(week.data.runs[0].key).toBe('run-2027-04-22')
    const plan = await tool(token, 'plan_meal', { date: '2027-04-20', hosted: true })
    expect(plan.data.meal.name).toBe('Tuesday dinner')
    const id = plan.data.meal.id
    const g = await tool(token, 'manage_meal_guests', { mealId: id, addHouseholdIds: [roths.id] })
    expect(g.data.guestHouseholds).toBe(1)
    const d = await tool(token, 'manage_meal_dishes', {
      mealId: id,
      add: [{ course: 'main', versionId: kugel }],
    })
    expect(d.data.summary).toEqual(['Potato kugel'])
    const page = await tool(token, 'get_hosted', { key: `meal-${id}` })
    expect(page.data.type).toBe('meal')
    const s = await tool(token, 'search_recipes_for_meal', { mealId: id, q: 'kugel' })
    expect(s.data.fits.map((h: any) => h.title)).toEqual(['Potato kugel'])
  })
})

describe('nutrition at a meal', () => {
  it('totals a person’s serving of each dish, names dishes without figures, and searches by what is missing', async () => {
    const who = 'meal-nutrition'
    const token = await sign(who)
    await api(who, 'PATCH', '/household', { location: NY })
    const add = async (title: string, course: string, nutrition?: object) =>
      (
        await api(
          who,
          'POST',
          '/recipes/import',
          {
            title,
            course,
            category: 'parve',
            servings: 6,
            ingredients: ['1 cup rice'],
            steps: ['Cook.'],
            ...(nutrition && { nutrition }),
          },
          201,
        )
      ).version.id as string
    const soup = await add('Lentil soup', 'soup', { proteinG: 12, fiberG: 8 })
    const salad = await add('Green salad', 'salad')
    await add('Tofu steak', 'main', { proteinG: 30 })
    await add('Rice pilaf', 'main', { proteinG: 5 })
    const plan = await tool(token, 'plan_meal', { date: '2027-04-20', hosted: true })
    const id = plan.data.meal.id
    await tool(token, 'manage_meal_dishes', {
      mealId: id,
      add: [
        { course: 'starter', versionId: soup },
        { course: 'starter', versionId: salad },
      ],
    })
    const m = await tool(token, 'get_meal', { mealId: id })
    expect(m.data.review.nutrition.perPerson).toEqual({ proteinG: 12, fiberG: 8 })
    expect(m.data.review.nutrition.missing.proteinG).toEqual(['Green salad'])
    // 40 g wanted, 12 so far: look for a main with at least 28 g.
    const s = await tool(token, 'search_recipes_for_meal', {
      mealId: id,
      minProteinG: 28,
      sort: 'protein',
    })
    expect(s.data.fits.map((h: any) => h.title)).toEqual(['Tofu steak'])
    expect(s.data.fits[0].nutritionPerServing.proteinG).toBe(30)
    expect(s.data.nutritionNote).toContain('per serving')
  })
})

describe('plan and hosted views with several meals (parity)', () => {
  /** Replaces generated ids with stable placeholders, in order of first appearance, and drops `today`. */
  const normalize = (value: unknown) => {
    const seen = new Map<string, string>()
    const text = JSON.stringify(value, (k, v) => (k === 'today' ? undefined : v))
    return JSON.parse(
      text.replace(
        /\b[0-9A-Za-z]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}\b|\b[0-9A-HJKMNP-TV-Z]{26}\b/g,
        (m) => {
          if (!seen.has(m)) seen.set(m, `<id${seen.size + 1}>`)
          return seen.get(m)!
        },
      ),
    )
  }

  it('gives the same plan and run page for several meals, guests and dishes', async () => {
    const who = 'parity-1'
    await api(who, 'PATCH', '/household', { location: NY })
    const brisket = await recipe(who, 'Brisket', 'main', 'meat', ['2 lb brisket'], {
      brisket: { category: 'meat' },
    })
    const kugel = await recipe(who, 'Potato kugel', 'side', 'parve', ['6 potatoes'])
    const macaroons = await recipe(
      who,
      'Almond macaroons',
      'dessert',
      'parve',
      ['2 cups almonds'],
      {
        almonds: { category: 'parve', allergens: ['tree nuts'] },
      },
    )
    const kohens = await household(who, 'The Kohens', [{ name: 'Sarah' }, { name: 'Ari' }])
    const roths = await household(who, 'The Roths', [
      { name: 'Avi' },
      { name: 'Miriam' },
      { name: 'Tova', child: true },
    ])
    await api(who, 'PUT', `/people/${kohens.people[1]}/constraints`, {
      add: [{ tagType: 'allergen', tag: 'tree nuts', severity: 'strict' }],
    })
    await api(who, 'PUT', `/people/${roths.people[1]}/constraints`, {
      add: [{ tagType: 'diet', tag: 'vegetarian', severity: 'strict' }],
    })

    const seder = await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-22',
      part: 'night',
    })
    const weekday = (await api(who, 'POST', '/meals', { date: '2027-04-20' }, 201)).meal.id
    const lunch = await api(who, 'POST', '/hosted/ensure-meal', {
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-22',
      part: 'day',
    })
    const meals = [seder.mealId, weekday, lunch.mealId]
    await api(who, 'POST', `/meals/${meals[0]}/households`, { householdId: kohens.id })
    await api(who, 'POST', `/meals/${meals[0]}/households`, { householdId: roths.id })
    await api(who, 'POST', `/meals/${meals[1]}/households`, { householdId: roths.id })
    await api(who, 'POST', `/meals/${meals[2]}/households`, { householdId: kohens.id })
    await api(who, 'PUT', `/meals/${meals[1]}/people/${roths.people[2]}`, { present: false })
    await api(who, 'POST', `/meals/${meals[0]}/dishes`, { course: 'main', versionId: brisket }, 201)
    await api(
      who,
      'POST',
      `/meals/${meals[0]}/dishes`,
      { course: 'dessert', versionId: macaroons },
      201,
    )
    await api(who, 'POST', `/meals/${meals[1]}/dishes`, { course: 'side', versionId: kugel }, 201)
    await api(
      who,
      'POST',
      `/meals/${meals[2]}/dishes`,
      { course: 'main', description: 'Fish' },
      201,
    )

    const plan = await api(who, 'GET', '/plan?from=2027-04-18&to=2027-04-26')
    const run = await api(who, 'GET', '/hosted/run-2027-04-22')
    const single = await api(who, 'GET', `/hosted/meal-${meals[1]}`)
    const week = await api(who, 'GET', '/week?date=2027-04-22')
    expect(normalize({ plan, run, single, week })).toMatchSnapshot()
  })
})
