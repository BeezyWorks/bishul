import { describe, expect, it } from 'vitest'

import {
  buildDiningBrief,
  createDishChecker,
  mergePrivateLayer,
  type DiningBriefInput,
} from './diningBrief'
import { NEW_YORK } from './fixtures'
import { constraint, dairyPot, dish, ing, person } from './testData'

const base = (o: Partial<DiningBriefInput>): DiningBriefInput => ({
  location: NEW_YORK,
  date: '2026-11-13',
  time: 18 * 60,
  attendees: [],
  hostPersons: [],
  selected: [],
  ...o,
})

const hummus = dish('hummus', 'Hummus with tahini', 'parve', [
  ing('chickpeas'),
  ing('tahini', { allergens: ['sesame'], skipImpact: 'ruins' }),
  ing('lemon juice'),
])
const salsa = dish('salsa', 'Fresh salsa', 'parve', [
  ing('tomato'),
  ing('fresh cilantro', { skipImpact: 'minor' }),
  ing('onion'),
])
const roast = dish('roast', 'Brisket', 'meat', [ing('brisket', { category: 'meat' }), ing('onion')])
const kugel = dish('kugel', 'Potato kugel', 'parve', [ing('potato'), ing('egg')])

describe('allergies (strict)', () => {
  it("Noa's strict sesame allergy excludes a dish with tahini, with who and why", () => {
    const noa = person('noa', 'Noa', [constraint({ type: 'allergen', value: 'sesame' })])
    const brief = buildDiningBrief(base({ attendees: [noa], selected: [hummus, kugel] }))
    expect(brief.hardExclusions).toHaveLength(1)
    const [ex] = brief.hardExclusions
    expect(ex).toMatchObject({
      dishId: 'hummus',
      personId: 'noa',
      personName: 'Noa',
      ingredients: ['tahini'],
    })
    expect(ex.text).toBe('Noa (sesame allergy): Hummus with tahini contains sesame (tahini)')
    expect(brief.dishes.find((d) => d.dishId === 'hummus')!.fits).toBe(false)
    expect(brief.dishes.find((d) => d.dishId === 'kugel')!.fits).toBe(true)
    expect(brief.disclaimer).toMatch(/on the host/)
    const checker = createDishChecker(base({ attendees: [noa] }))
    expect(checker.fits(hummus)).toBe(false)
    expect(checker.fits(salsa)).toBe(true)
  })

  it('lists the active constraints as warnings (medical, religious) or hints (preference)', () => {
    const p = person('p', 'Pat', [
      constraint({ type: 'allergen', value: 'sesame' }),
      constraint(
        { type: 'ingredient', value: 'cilantro' },
        { kind: 'preference', severity: 'flexible' },
      ),
    ])
    const brief = buildDiningBrief(base({ attendees: [p] }))
    expect(brief.activeConstraints.map((a) => a.display)).toEqual(['warning', 'hint'])
  })

  it('flags an allergy that passes only because AI-filled data says the allergen is absent', () => {
    const noa = person('noa', 'Noa', [constraint({ type: 'allergen', value: 'sesame' })])
    const aiSauce = dish('sauce', 'Silan glaze', 'parve', [
      ing('silan'),
      ing('house spice blend', { dataSource: 'ai' }),
    ])
    const brief = buildDiningBrief(base({ attendees: [noa], selected: [aiSauce, kugel] }))
    expect(brief.hardExclusions).toEqual([])
    expect(brief.aiWarnings).toHaveLength(1)
    expect(brief.aiWarnings[0]).toMatchObject({
      dishId: 'sauce',
      personId: 'noa',
      allergen: 'sesame',
      ingredients: ['house spice blend'],
    })
    expect(brief.aiWarnings[0].text).toMatch(/filled in by AI/)
    // Seed and user data warn about nothing.
    expect(brief.dishes.find((d) => d.dishId === 'kugel')!.aiWarnings).toEqual([])
    // A user-corrected flag is no longer AI data.
    const corrected = dish('sauce', 'Silan glaze', 'parve', [
      ing('house spice blend', { dataSource: 'user' }),
    ])
    expect(buildDiningBrief(base({ attendees: [noa], selected: [corrected] })).aiWarnings).toEqual(
      [],
    )
  })

  it('does not warn for a flexible or non-allergen constraint', () => {
    const g = person('g', 'George', [
      constraint({ type: 'allergen', value: 'sesame' }, { severity: 'flexible' }),
    ])
    const aiDish = dish('x', 'X', 'parve', [ing('mystery', { dataSource: 'ai' })])
    expect(buildDiningBrief(base({ attendees: [g], selected: [aiDish] })).aiWarnings).toEqual([])
  })
})

describe('eat-around (flexible)', () => {
  const george = person('george', 'George', [
    constraint(
      { type: 'ingredient', value: 'cilantro' },
      { kind: 'preference', severity: 'flexible' },
    ),
  ])

  it('George skips the cilantro: minor impact, the dish stays', () => {
    const brief = buildDiningBrief(base({ attendees: [george], selected: [salsa] }))
    expect(brief.hardExclusions).toEqual([])
    expect(brief.eatAround).toHaveLength(1)
    expect(brief.eatAround[0]).toMatchObject({
      dishId: 'salsa',
      personId: 'george',
      verdict: 'skip_minor',
      ingredients: ['fresh cilantro'],
    })
    expect(brief.eatAround[0].text).toBe('George can skip the fresh cilantro with a minor loss')
    expect(brief.dishes[0].fits).toBe(true)
  })

  it('ruins and none verdicts', () => {
    const ruined = dish('g', 'Green sauce', 'parve', [ing('cilantro', { skipImpact: 'ruins' })])
    const free = dish('t', 'Tacos', 'parve', [ing('cilantro garnish', { skipImpact: 'none' })])
    const checker = createDishChecker(base({ attendees: [george] }))
    expect(checker.check(ruined).eatAround[0].verdict).toBe('ruins')
    expect(checker.check(ruined).fits).toBe(true)
    expect(checker.check(free).eatAround[0].verdict).toBe('skip_ok')
  })

  it('matches whole words only', () => {
    const d = dish('d', 'Dip', 'parve', [ing('cilantroish paste')])
    expect(createDishChecker(base({ attendees: [george] })).check(d).eatAround).toEqual([])
  })
})

describe('seasons', () => {
  const kitniyot = person('k', 'Kobi', [
    constraint(
      { type: 'kashrut', value: 'kitniyot' },
      { kind: 'religious', activeWhen: { period: 'pesach' } },
    ),
  ])
  const rice = dish('rice', 'Rice pilaf', 'parve', [ing('rice', { flags: ['kitniyot'] })])

  it('a Pesach constraint is inactive in November and active on Pesach', () => {
    expect(
      buildDiningBrief(base({ attendees: [kitniyot], selected: [rice] })).hardExclusions,
    ).toEqual([])
    const pesach = buildDiningBrief(
      base({ attendees: [kitniyot], selected: [rice], date: '2027-04-23', time: 12 * 60 }),
    )
    expect(pesach.activeConstraints).toHaveLength(1)
    expect(pesach.hardExclusions[0].text).toBe(
      'Kobi (kitniyot): Rice pilaf is flagged kitniyot (rice)',
    )
  })

  it('a dish-level flag set by hand counts', () => {
    const d = dish('d', 'Pilaf', 'parve', [ing('stuff')], { flags: ['kitniyot'] })
    const r = buildDiningBrief(base({ attendees: [kitniyot], selected: [d], date: '2027-04-23' }))
    expect(r.hardExclusions).toHaveLength(1)
  })
})

describe('diets', () => {
  it('vegetarian strict excludes meat, flexible eats around', () => {
    const veg = person('v', 'Vera', [
      constraint({ type: 'diet', value: 'vegetarian' }, { kind: 'religious' }),
    ])
    const flex = person('f', 'Flo', [
      constraint(
        { type: 'diet', value: 'vegetarian' },
        { severity: 'flexible', kind: 'preference' },
      ),
    ])
    expect(createDishChecker(base({ attendees: [veg] })).fits(roast)).toBe(false)
    const c = createDishChecker(base({ attendees: [flex] })).check(roast)
    expect(c.fits).toBe(true)
    expect(c.eatAround[0].verdict).toBe('skip_ok')
  })
})

describe('combination and equipment rules', () => {
  it('Esther: no parve cooked in a dairy pot at a meat meal', () => {
    const esther = person('esther', 'Esther', [
      constraint({ type: 'rule', value: 'no_parve_from_dairy_at_meat' }, { kind: 'religious' }),
    ])
    const veggies = dish('veg', 'Roasted vegetables', 'parve', [ing('zucchini')], {
      equipment: [dairyPot],
    })
    const meatMeal = createDishChecker(base({ attendees: [esther], mealKind: 'meat' }))
    const c = meatMeal.check(veggies)
    expect(c.fits).toBe(false)
    expect(c.ruleViolations).toHaveLength(1)
    expect(c.ruleViolations[0].text).toBe(
      'Esther (no parve from dairy at meat): Roasted vegetables is parve but uses dairy equipment (dairy pot) at a meat meal',
    )
    // Same dish at a dairy or parve meal is fine.
    expect(createDishChecker(base({ attendees: [esther], mealKind: 'dairy' })).fits(veggies)).toBe(
      true,
    )
    expect(createDishChecker(base({ attendees: [esther], mealKind: 'parve' })).fits(veggies)).toBe(
      true,
    )
    // Meal kind undeclared: it is a meat meal once a meat dish is selected.
    expect(createDishChecker(base({ attendees: [esther], selected: [roast] })).fits(veggies)).toBe(
      false,
    )
    expect(createDishChecker(base({ attendees: [esther] })).fits(veggies)).toBe(true)
    // Adding the meat dish later turns an already-selected parve dish into a meal-level violation.
    const brief = buildDiningBrief(base({ attendees: [esther], selected: [veggies, roast] }))
    expect(brief.ruleViolations.map((v) => v.dishId)).toEqual(['veg'])
    expect(
      brief.mealIssues.some((i) => i.code === 'equipment_at_meal' && i.severity === 'error'),
    ).toBe(true)
    // A guest without the rule is unaffected.
    expect(
      createDishChecker(base({ attendees: [person('x', 'Xan')], mealKind: 'meat' })).fits(veggies),
    ).toBe(true)
  })

  it('no fish and dairy: a dish combining them is excluded for that guest only', () => {
    const rina = person('rina', 'Rina', [
      constraint({ type: 'rule', value: 'no_fish_dairy' }, { kind: 'religious' }),
    ])
    const salmon = dish('salmon', 'Creamy salmon', 'dairy', [
      ing('salmon', { category: 'fish' }),
      ing('cream', { category: 'dairy' }),
    ])
    expect(createDishChecker(base({ attendees: [rina] })).fits(salmon)).toBe(false)
    expect(createDishChecker(base({ attendees: [person('x', 'Xan')] })).fits(salmon)).toBe(true)
    expect(
      buildDiningBrief(base({ attendees: [rina], selected: [salmon] })).ruleViolations[0].rule,
    ).toBe('no_fish_dairy')
  })

  it('no fish and dairy: the meal is flagged, and the picker hides the other half', () => {
    const rina = person('rina', 'Rina', [
      constraint({ type: 'rule', value: 'no_fish_dairy' }, { kind: 'religious' }),
    ])
    const gefilte = dish('gefilte', 'Poached fish', 'parve', [
      ing('whitefish', { category: 'fish' }),
    ])
    const blintz = dish('blintz', 'Cheese blintzes', 'dairy', [
      ing('cheese', { category: 'dairy' }),
    ])
    const brief = buildDiningBrief(base({ attendees: [rina], selected: [gefilte, blintz] }))
    const issue = brief.mealIssues.find((i) => i.code === 'fish_and_dairy_in_meal')!
    expect(issue.severity).toBe('error')
    expect(issue.personIds).toEqual(['rina'])
    expect(issue.dishIds.sort()).toEqual(['blintz', 'gefilte'])

    const checker = createDishChecker(base({ attendees: [rina], selected: [gefilte] }))
    const hidden = checker.check(blintz)
    expect(hidden.fits).toBe(false)
    expect(hidden.reasons[0]).toMatch(/Rina doesn't eat fish with dairy/)
    expect(checker.fits(kugel)).toBe(true)
    // Flexible: flagged, not hidden.
    const flexible = person('fl', 'Flo', [
      constraint(
        { type: 'rule', value: 'no_fish_dairy' },
        { severity: 'flexible', kind: 'preference' },
      ),
    ])
    const soft = createDishChecker(base({ attendees: [flexible], selected: [gefilte] })).check(
      blintz,
    )
    expect(soft.fits).toBe(true)
    expect(soft.mealIssues[0].severity).toBe('warning')
  })

  it('no fish with meat is the same mechanism', () => {
    const p = person('p', 'Pinchas', [
      constraint({ type: 'rule', value: 'no_fish_meat' }, { kind: 'religious' }),
    ])
    const fish = dish('f', 'Fish', 'parve', [ing('cod', { category: 'fish' })])
    expect(createDishChecker(base({ attendees: [p], selected: [fish] })).fits(roast)).toBe(false)
    expect(
      createDishChecker(base({ attendees: [p], selected: [fish] })).check(roast).mealIssues[0].code,
    ).toBe('fish_and_meat_in_meal')
  })
})

describe('meal-level kashrut', () => {
  it('meat and dairy in the same meal is a hard error, and the picker hides the dairy dish', () => {
    const cheesecake = dish('cake', 'Cheesecake', 'dairy', [
      ing('cream cheese', { category: 'dairy' }),
    ])
    const brief = buildDiningBrief(
      base({ attendees: [person('a', 'A')], selected: [roast, cheesecake] }),
    )
    const issue = brief.mealIssues.find((i) => i.code === 'meat_and_dairy')!
    expect(issue.severity).toBe('error')
    expect(issue.text).toBe('Meat (Brisket) and dairy (Cheesecake) in the same meal')
    expect(brief.mealKind).toBeNull()
    const checker = createDishChecker(base({ attendees: [person('a', 'A')], selected: [roast] }))
    expect(checker.fits(cheesecake)).toBe(false)
    expect(checker.check(cheesecake).reasons[0]).toMatch(/same meal/)
    expect(checker.fits(kugel)).toBe(true)
  })

  it('a declared dairy meal rejects meat dishes; derived kind otherwise', () => {
    expect(createDishChecker(base({ attendees: [], mealKind: 'dairy' })).fits(roast)).toBe(false)
    expect(buildDiningBrief(base({ selected: [roast] })).mealKind).toBe('meat')
    expect(buildDiningBrief(base({ selected: [kugel] })).mealKind).toBe('parve')
    expect(buildDiningBrief(base({ selected: [] })).mealKind).toBeNull()
  })

  it('a single dish with meat and dairy ingredients is an error', () => {
    const bad = dish('b', 'Chicken parm', 'meat', [
      ing('chicken', { category: 'meat' }),
      ing('mozzarella', { category: 'dairy' }),
    ])
    expect(createDishChecker(base({})).check(bad).fits).toBe(false)
  })

  it('brought dishes count at meal level but are not checked', () => {
    const noa = person('noa', 'Noa', [constraint({ type: 'allergen', value: 'sesame' })])
    const potatoes = dish('pot', "Ruth's potatoes", 'meat', [], { brought: { by: 'Ruth' } })
    const brief = buildDiningBrief(base({ attendees: [noa], selected: [potatoes, roast] }))
    expect(brief.uncheckedDishes).toEqual([{ dishId: 'pot', title: "Ruth's potatoes", by: 'Ruth' }])
    expect(brief.mealKind).toBe('meat')
    const dairyBrought = dish('d', 'Ice cream', 'dairy', [], { brought: { by: 'Dan' } })
    expect(
      buildDiningBrief(base({ selected: [roast, dairyBrought] })).mealIssues.some(
        (i) => i.code === 'meat_and_dairy',
      ),
    ).toBe(true)
  })
})

describe('sourcing notes', () => {
  const butterDish = dish('b', 'Mashed potatoes', 'dairy', [
    ing('potato'),
    ing('butter', { category: 'dairy' }),
  ])
  const glattBrisket = dish('r', 'Brisket', 'meat', [ing('beef brisket', { category: 'meat' })])
  const avi = person('avi', 'Avi', [
    constraint({ type: 'sourcing', value: 'glatt' }, { kind: 'religious' }),
    constraint({ type: 'sourcing', value: 'chalav_yisrael' }, { kind: 'religious' }),
  ])

  it('a glatt guest stricter than the host gets a sourcing note, and nothing is excluded', () => {
    const host = person('h', 'Hannah')
    const brief = buildDiningBrief(
      base({ attendees: [host, avi], hostPersons: [host], selected: [glattBrisket] }),
    )
    expect(brief.hardExclusions).toEqual([])
    const glatt = brief.sourcingNotes.find((n) => n.standard === 'glatt')!
    expect(glatt.persons).toEqual([{ id: 'avi', name: 'Avi' }])
    expect(glatt.ingredients).toEqual(['beef brisket'])
    expect(glatt.text).toBe('Avi keeps glatt: buy glatt beef brisket')
    expect(brief.dishes[0].fits).toBe(true)
  })

  it('no note when the host household keeps the standard itself', () => {
    const host = person('h', 'Hannah', [
      constraint({ type: 'sourcing', value: 'chalav_yisrael' }, { kind: 'religious' }),
    ])
    const brief = buildDiningBrief(
      base({ attendees: [host, avi], hostPersons: [host], selected: [butterDish, glattBrisket] }),
    )
    expect(brief.sourcingNotes.map((n) => n.standard)).toEqual(['glatt'])
    const withBoth = person('h2', 'Hal', [
      constraint({ type: 'sourcing', value: 'chalav_yisrael' }, { kind: 'religious' }),
      constraint({ type: 'sourcing', value: 'glatt' }, { kind: 'religious' }),
    ])
    expect(
      buildDiningBrief(
        base({ attendees: [withBoth, avi], hostPersons: [withBoth], selected: [butterDish] }),
      ).sourcingNotes,
    ).toEqual([])
  })

  it('chalav Yisrael names the dairy ingredients', () => {
    const brief = buildDiningBrief(
      base({ attendees: [avi], hostPersons: [person('h', 'Hannah')], selected: [butterDish] }),
    )
    const cy = brief.sourcingNotes.find((n) => n.standard === 'chalav_yisrael')!
    expect(cy.text).toBe('Avi keeps chalav Yisrael: buy chalav Yisrael butter')
  })

  it('a seasonal sourcing standard (pat Yisrael through Aseret Yemei Teshuva) only notes while active', () => {
    const pat = person('p', 'Pesi', [
      constraint(
        { type: 'sourcing', value: 'pat_yisrael' },
        { kind: 'religious', activeWhen: { period: 'aseret_yemei_teshuva' } },
      ),
    ])
    const host = person('h', 'Hannah')
    const bread = dish('bread', 'Challah', 'parve', [ing('bakery rolls', { flags: ['pat'] })])
    const during = buildDiningBrief(
      base({ attendees: [pat], hostPersons: [host], selected: [bread], date: '2026-09-16' }),
    )
    expect(during.sourcingNotes.map((n) => n.standard)).toEqual(['pat_yisrael'])
    expect(
      buildDiningBrief(
        base({ attendees: [pat], hostPersons: [host], selected: [bread], date: '2026-11-13' }),
      ).sourcingNotes,
    ).toEqual([])
  })

  it("a host person who attends is never a 'guest'", () => {
    const host = person('h', 'Hannah', [
      constraint({ type: 'sourcing', value: 'glatt' }, { kind: 'religious' }),
    ])
    expect(
      buildDiningBrief(base({ attendees: [host], hostPersons: [host], selected: [glattBrisket] }))
        .sourcingNotes,
    ).toEqual([])
  })
})

describe('mergePrivateLayer', () => {
  it("adds the host's own constraints as host-sourced", () => {
    const linked = person('x', 'Xan', [constraint({ type: 'allergen', value: 'peanut' })])
    const merged = mergePrivateLayer(linked, [
      constraint(
        { type: 'ingredient', value: 'cilantro' },
        { severity: 'flexible', kind: 'preference' },
      ),
    ])
    expect(merged.constraints).toHaveLength(2)
    expect(merged.constraints[1].source).toBe('host')
    expect(linked.constraints).toHaveLength(1)
  })
})

describe('allergens without catalog data', () => {
  it('excludes a dish whose ingredient names give the allergen away, even with no allergen data', () => {
    const george = person('george', 'George', [constraint({ type: 'allergen', value: 'sesame' })])
    const chicken = dish('chicken', 'Roast chicken', 'meat', [
      ing('chicken', { category: 'meat' }),
      ing('sesame seeds', { skipImpact: 'minor' }),
    ])
    const brief = buildDiningBrief(base({ attendees: [george], selected: [chicken] }))
    expect(brief.hardExclusions.map((x) => x.dishId)).toEqual(['chicken'])
  })

  it('matches tree nuts by the nut named', () => {
    const avi = person('avi', 'Avi', [constraint({ type: 'allergen', value: 'tree nuts' })])
    const beans = dish('beans', 'Green beans', 'parve', [ing('green beans'), ing('sliced almonds')])
    const brief = buildDiningBrief(base({ attendees: [avi], selected: [beans] }))
    expect(brief.hardExclusions).toHaveLength(1)
  })
})

describe('spicy food', () => {
  const curry = {
    ...dish('curry', 'Chicken curry', 'meat', [ing('chicken', { category: 'meat' })]),
    flags: ['spicy'],
  }
  it('flags a spicy dish only for people known not to eat spicy', () => {
    const no = { ...person('a', 'Avi'), spicy: 'no' as const }
    const yes = { ...person('b', 'Bina'), spicy: 'yes' as const }
    const unknown = person('c', 'Cali')
    const brief = buildDiningBrief(base({ attendees: [no, yes, unknown], selected: [curry] }))
    expect(brief.eatAround.map((e) => e.personName)).toEqual(['Avi'])
    expect(brief.hardExclusions).toHaveLength(0)
  })
})
