import { describe, expect, it } from 'vitest'

import type { PantryItem } from '../pantry/expiry'
import type { IngredientLine } from '../units/types'
import type { PlannedMealItem } from './allocate'
import { buildShoppingList } from './shopping'

const L = (
  o: Partial<IngredientLine> & { ingredientId: string; amount: number | null },
): IngredientLine => ({
  name: o.ingredientId[0]!.toUpperCase() + o.ingredientId.slice(1),
  unit: 'piece',
  ...o,
})
const meal = (
  mealId: string,
  mealDate: string,
  lines: IngredientLine[],
  scale = 1,
): PlannedMealItem => ({
  mealId,
  mealDate,
  lines,
  scale,
})
const P = (
  o: Partial<PantryItem> & { id: string; ingredientId: string; amount: number },
): PantryItem => ({
  name: o.ingredientId,
  unit: 'piece',
  ...o,
})

describe('buildShoppingList', () => {
  it('aggregates one line per ingredient across meals with scale', () => {
    const lines = buildShoppingList([
      meal('m1', '2026-11-06', [L({ ingredientId: 'onion', name: 'Onions', amount: 1.5 })], 1),
      meal('m2', '2026-11-07', [L({ ingredientId: 'onion', name: 'Onions', amount: 1 })], 2),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.needed).toEqual([{ amount: 3.5, unit: 'piece', approx: false }])
    expect(lines[0]!.display).toBe('Onions — need 3½')
    expect(lines[0]!.mealIds).toEqual(['m1', 'm2'])
  })

  it('subtracts pantry stock and shows what you have', () => {
    const [l] = buildShoppingList(
      [meal('m1', '2026-11-06', [L({ ingredientId: 'onion', name: 'Onions', amount: 3.5 })])],
      { pantry: [P({ id: 'p1', ingredientId: 'onion', amount: 2 })] },
    )
    expect(l!.display).toBe('Onions — need 3½ · you have 2')
    expect(l!.toBuy).toEqual([{ amount: 1.5, unit: 'piece', approx: false }])
    expect(l!.toBuyDisplay).toBe('Onions — buy 1½')
    expect(l!.covered).toBe(false)
  })

  it('reports fully covered lines', () => {
    const [l] = buildShoppingList(
      [meal('m1', '2026-11-06', [L({ ingredientId: 'onion', amount: 2 })])],
      {
        pantry: [P({ id: 'p1', ingredientId: 'onion', amount: 5 })],
      },
    )
    expect(l!.covered).toBe(true)
    expect(l!.toBuy).toEqual([])
    expect(l!.toBuyDisplay).toBe('Onion — covered by pantry')
  })

  it('ignores expired pantry items', () => {
    const [l] = buildShoppingList(
      [meal('m1', '2026-11-06', [L({ ingredientId: 'onion', amount: 2 })])],
      {
        pantry: [P({ id: 'p1', ingredientId: 'onion', amount: 5, expiry: '2026-11-05' })],
      },
    )
    expect(l!.have).toEqual([])
    expect(l!.toBuy[0]!.amount).toBe(2)
  })

  it('lets pantry that expires mid-plan cover only earlier meals', () => {
    const [l] = buildShoppingList(
      [
        meal('m1', '2026-11-06', [L({ ingredientId: 'cream', amount: 1 })]),
        meal('m2', '2026-11-13', [L({ ingredientId: 'cream', amount: 1 })]),
      ],
      { pantry: [P({ id: 'p1', ingredientId: 'cream', amount: 2, expiry: '2026-11-08' })] },
    )
    expect(l!.needed[0]!.amount).toBe(2)
    expect(l!.toBuy[0]!.amount).toBe(1)
  })

  it('treats expiry on the meal day as still good', () => {
    const [l] = buildShoppingList(
      [meal('m1', '2026-11-06', [L({ ingredientId: 'cream', amount: 1 })])],
      {
        pantry: [P({ id: 'p1', ingredientId: 'cream', amount: 1, expiry: '2026-11-06' })],
      },
    )
    expect(l!.covered).toBe(true)
  })

  it('excludes brought dishes', () => {
    const lines = buildShoppingList([
      { ...meal('m1', '2026-11-06', [L({ ingredientId: 'potato', amount: 5 })]), brought: true },
      meal('m1', '2026-11-06', [L({ ingredientId: 'onion', amount: 1 })]),
    ])
    expect(lines.map((l) => l.ingredientId)).toEqual(['onion'])
  })

  it('merges weight and volume with density, approximate', () => {
    const [l] = buildShoppingList([
      meal('m1', '2026-11-06', [
        L({ ingredientId: 'flour', name: 'Flour', amount: 200, unit: 'g', density: 0.5 }),
      ]),
      meal('m2', '2026-11-07', [
        L({ ingredientId: 'flour', name: 'Flour', amount: 236.588, unit: 'ml', density: 0.5 }),
      ]),
    ])
    expect(l!.needed).toHaveLength(1)
    expect(l!.needed[0]!.unit).toBe('g')
    expect(l!.needed[0]!.amount).toBeCloseTo(200 + 118.294, 2)
    expect(l!.needed[0]!.approx).toBe(true)
    expect(l!.display).toBe('Flour — need ~11¼ oz')
  })

  it('keeps separate sub-totals without density', () => {
    const [l] = buildShoppingList(
      [
        meal('m1', '2026-11-06', [
          L({ ingredientId: 'flour', name: 'Flour', amount: 200, unit: 'g' }),
        ]),
        meal('m2', '2026-11-07', [
          L({ ingredientId: 'flour', name: 'Flour', amount: 240, unit: 'ml' }),
        ]),
      ],
      { prefs: { system: 'metric' } },
    )
    expect(l!.needed.map((q) => q.unit)).toEqual(['g', 'ml'])
    expect(l!.display).toBe('Flour — need 200 g + 240 ml')
  })

  it('uses pantry density when the recipe lacks one', () => {
    const [l] = buildShoppingList(
      [
        meal('m1', '2026-11-06', [
          L({ ingredientId: 'flour', name: 'Flour', amount: 240, unit: 'g' }),
        ]),
      ],
      {
        pantry: [P({ id: 'p', ingredientId: 'flour', amount: 236.588, unit: 'ml', density: 0.5 })],
        prefs: { system: 'metric' },
      },
    )
    expect(l!.toBuy[0]!.amount).toBeCloseTo(240 - 118.294, 2)
    expect(l!.toBuy[0]!.approx).toBe(true)
    expect(l!.have[0]!.amount).toBeCloseTo(118.294, 2)
  })

  it('does not cover grams with pantry pieces', () => {
    const [l] = buildShoppingList(
      [meal('m1', '2026-11-06', [L({ ingredientId: 'x', amount: 100, unit: 'g' })])],
      {
        pantry: [P({ id: 'p', ingredientId: 'x', amount: 3 })],
      },
    )
    expect(l!.have).toEqual([])
    expect(l!.toBuy[0]!.amount).toBe(100)
  })

  it('propagates approximate source', () => {
    const [l] = buildShoppingList([
      meal('m1', '2026-11-06', [L({ ingredientId: 'x', amount: 100, unit: 'g', approx: true })]),
    ])
    expect(l!.needed[0]!.approx).toBe(true)
    expect(l!.display).toContain('~')
  })

  it('skips zero and negative amounts and bad scales', () => {
    const lines = buildShoppingList([
      meal('m1', '2026-11-06', [
        L({ ingredientId: 'a', amount: 0 }),
        L({ ingredientId: 'b', amount: -2 }),
      ]),
      meal('m2', '2026-11-06', [L({ ingredientId: 'c', amount: 1 })], 0),
      meal('m3', '2026-11-06', [L({ ingredientId: 'd', amount: 1 })], -1),
    ])
    expect(lines).toEqual([])
  })

  it('shows to-taste lines as needed with no quantity', () => {
    const lines = buildShoppingList([
      meal('m1', '2026-11-06', [L({ ingredientId: 'salt', name: 'Salt', amount: null })]),
    ])
    expect(lines[0]).toMatchObject({ unquantified: true, needed: [], display: 'Salt — as needed' })
    const mixed = buildShoppingList([
      meal('m1', '2026-11-06', [L({ ingredientId: 'salt', name: 'Salt', amount: null })]),
      meal('m2', '2026-11-06', [L({ ingredientId: 'salt', name: 'Salt', amount: 5, unit: 'g' })]),
    ])
    expect(mixed[0]).toMatchObject({ unquantified: true })
    expect(mixed[0]!.needed).toHaveLength(1)
  })

  it('draws pantry stock across several needs without double counting', () => {
    const [l] = buildShoppingList(
      [
        meal('m1', '2026-11-06', [L({ ingredientId: 'egg', amount: 3 })]),
        meal('m2', '2026-11-07', [L({ ingredientId: 'egg', amount: 3 })]),
      ],
      { pantry: [P({ id: 'p', ingredientId: 'egg', amount: 4 })] },
    )
    expect(l!.toBuy[0]!.amount).toBe(2)
  })

  describe('chametz', () => {
    const cutoff = '2027-04-21T10:00:00'
    const lines = (date: string) => [
      meal('m1', date, [L({ ingredientId: 'flour', amount: 500, unit: 'g' })]),
    ]
    const flour = P({
      id: 'p',
      ingredientId: 'flour',
      amount: 1000,
      unit: 'g',
      expiry: '2027-12-31',
      chametz: true,
    })

    it('is usable before the cutoff', () => {
      const [l] = buildShoppingList(lines('2027-04-10'), { pantry: [flour], chametzCutoff: cutoff })
      expect(l!.covered).toBe(true)
    })
    it('is not usable at a meal after the cutoff', () => {
      const [l] = buildShoppingList(lines('2027-04-22'), { pantry: [flour], chametzCutoff: cutoff })
      expect(l!.have).toEqual([])
      expect(l!.toBuy[0]!.amount).toBe(500)
    })
    it('non-chametz items ignore the cutoff', () => {
      const [l] = buildShoppingList(lines('2027-04-22'), {
        pantry: [{ ...flour, chametz: false }],
        chametzCutoff: cutoff,
      })
      expect(l!.covered).toBe(true)
    })
    it('uses the earlier of expiry and cutoff', () => {
      const [l] = buildShoppingList(lines('2027-04-10'), {
        pantry: [{ ...flour, expiry: '2027-04-05' }],
        chametzCutoff: cutoff,
      })
      expect(l!.covered).toBe(false)
    })
  })
})
