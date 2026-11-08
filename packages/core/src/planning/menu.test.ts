import { describe, expect, it } from 'vitest'

import { buildDiningBrief } from './diningBrief'
import { NEW_YORK } from './fixtures'
import {
  awayText,
  constraintLabels,
  countsText,
  courseGroup,
  foodNotes,
  groupMenu,
  groupMenuWithDefaults,
  headcount,
  mealProblems,
  menuSummary,
  sumHeadcounts,
} from './menu'
import { constraint, dish, ing, person } from './testData'

const item = (id: string, position: number, course: string | null, title = id) => ({
  id,
  position,
  course,
  title,
})
const title = (i: { title: string }) => i.title

describe('menu groups and tile summary', () => {
  it('maps recipe courses onto starter / main / dessert', () => {
    expect(courseGroup('soup')).toBe('starter')
    expect(courseGroup('side')).toBe('main')
    expect(courseGroup(null)).toBe('main')
    expect(courseGroup('Dessert')).toBe('dessert')
    expect(courseGroup('kugel')).toBe('kugel')
  })

  it('groups in serving order with dishes in menu order', () => {
    const g = groupMenu([
      item('cake', 4, 'dessert'),
      item('brisket', 1, 'main'),
      item('fish', 0, 'starter'),
      item('kugel', 2, 'side'),
      item('soup', 5, 'soup'),
    ])
    expect(g.map((x) => [x.course, x.label, x.items.map((i) => i.id)])).toEqual([
      ['starter', 'Starter', ['fish', 'soup']],
      ['main', 'Main', ['brisket', 'kugel']],
      ['dessert', 'Dessert', ['cake']],
    ])
  })

  it('adds the default courses when asked, in order', () => {
    expect(groupMenuWithDefaults([item('b', 0, 'main')]).map((g) => g.course)).toEqual([
      'starter',
      'main',
      'dessert',
    ])
  })

  it('summary: the main course in menu order', () => {
    const items = [
      item('a', 0, 'starter', 'Gefilte fish'),
      item('c', 2, 'main', 'Kugel'),
      item('b', 1, 'main', 'Brisket'),
    ]
    expect(menuSummary(items, title)).toEqual(['Brisket', 'Kugel'])
  })
  it('summary: no main gives the first course with dishes', () => {
    const items = [item('d', 3, 'dessert', 'Cake'), item('a', 0, 'starter', 'Fish')]
    expect(menuSummary(items, title)).toEqual(['Fish'])
  })
  it('summary: nothing gives empty', () => {
    expect(menuSummary([], title)).toEqual([])
  })
})

describe('headcounts', () => {
  it('counts adults and children who are present', () => {
    const us = [
      { isChild: false, present: true },
      { isChild: false, present: true },
      { isChild: true, present: true },
      { isChild: true, present: false },
    ]
    expect(headcount(us)).toEqual({ adults: 2, children: 1, total: 3 })
    expect(
      sumHeadcounts([headcount(us), headcount([{ isChild: false, present: true }])]).total,
    ).toBe(4)
  })
  it('text', () => {
    expect(countsText({ adults: 2, children: 1 })).toBe('2 adults, 1 child')
    expect(countsText({ adults: 1, children: 0 })).toBe('1 adult')
    expect(countsText({ adults: 0, children: 3 })).toBe('3 children')
    expect(awayText(['Jochanan'])).toBe('Jochanan away')
    expect(awayText(['A', 'B'])).toBe('A and B away')
    expect(awayText(['A', 'B', 'C'])).toBe('3 away')
    expect(awayText([])).toBe('')
  })
})

describe('constraint text', () => {
  it('strict allergies first, deduplicated', () => {
    const labels = constraintLabels([
      constraint({ type: 'diet', value: 'vegetarian' }, { severity: 'flexible' }),
      constraint({ type: 'allergen', value: 'tree nuts' }),
      constraint({ type: 'allergen', value: 'tree nuts' }),
      constraint({ type: 'ingredient', value: 'mushrooms' }, { severity: 'flexible' }),
    ])
    expect(labels).toEqual([
      { text: 'tree nuts', strictAllergy: true, strict: true },
      { text: 'no mushrooms', strictAllergy: false, strict: false },
      { text: 'vegetarian', strictAllergy: false, strict: false },
    ])
  })
  it('food notes carry no names', () => {
    expect(foodNotes([constraint({ type: 'allergen', value: 'peanut' })])).toEqual([
      'peanut-free meal',
    ])
    expect(foodNotes([constraint({ type: 'diet', value: 'vegetarian' })])).toEqual([])
  })
})

describe('meal problems', () => {
  const macaroons = dish('mac', 'Almond macaroons', 'parve', [
    ing('almonds', { allergens: ['tree nuts'], skipImpact: 'ruins' }),
  ])
  const brisket = dish('brisket', 'Brisket', 'meat', [ing('brisket', { category: 'meat' })])
  const kugel = dish('kugel', 'Kugel', 'parve', [ing('potato')])
  const ari = person('ari', 'Ari', [constraint({ type: 'allergen', value: 'tree nuts' })])
  const miriam = person('miriam', 'Miriam', [constraint({ type: 'diet', value: 'vegetarian' })])
  const brief = (selected: ReturnType<typeof dish>[], attendees = [ari, miriam]) =>
    buildDiningBrief({
      location: NEW_YORK,
      date: '2027-04-22',
      time: 12 * 60,
      attendees,
      hostPersons: [],
      selected,
    })

  it('names the flagged dish for an allergy, with its menu items', () => {
    const r = mealProblems(brief([macaroons, kugel]), [
      { id: 'i1', dishId: 'mac', course: 'dessert' },
      { id: 'i2', dishId: 'kugel', course: 'main' },
    ])
    expect(r.counts).toMatchObject({ allergies: 1 })
    expect(r.problems[0]).toMatchObject({
      kind: 'allergy',
      dishTitle: 'Almond macaroons',
      personName: 'Ari',
      itemIds: ['i1'],
    })
  })

  it('finds a gap: a vegetarian guest with only a meat main', () => {
    const r = mealProblems(brief([brisket]), [{ id: 'i1', dishId: 'brisket', course: 'main' }])
    const gap = r.problems.find((p) => p.kind === 'gap')
    expect(gap).toMatchObject({
      personName: 'Miriam',
      text: 'There is no vegetarian main for Miriam',
    })
    expect(r.counts.gaps).toBe(1)
  })

  it('no gap when a main works for them', () => {
    const r = mealProblems(brief([brisket, kugel]), [
      { id: 'i1', dishId: 'brisket', course: 'main' },
      { id: 'i2', dishId: 'kugel', course: 'side' },
    ])
    expect(r.problems.filter((p) => p.kind === 'gap')).toEqual([])
  })

  it('empty menu has no problems', () => {
    expect(mealProblems(brief([]), []).counts.total).toBe(0)
  })
})
