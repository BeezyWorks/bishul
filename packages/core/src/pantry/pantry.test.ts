import { describe, expect, it } from 'vitest'

import type { PlannedMealItem } from '../shopping/allocate'
import type { IngredientLine } from '../units/types'
import {
  availableItems,
  effectiveExpiry,
  expiringSoon,
  isAvailableAt,
  type PantryItem,
} from './expiry'
import { computeHolds, freeAfterHolds } from './holds'

const P = (o: Partial<PantryItem> & { id: string }): PantryItem => ({
  ingredientId: o.id,
  name: o.id,
  amount: 1,
  unit: 'piece',
  ...o,
})
const cutoff = '2027-04-21T10:00:00'

describe('effectiveExpiry', () => {
  it('is null when nothing expires', () => {
    expect(effectiveExpiry(P({ id: 'a' }))).toBeNull()
    expect(effectiveExpiry(P({ id: 'a', chametz: true }))).toBeNull()
  })
  it('treats a bare date as end of that day', () => {
    expect(effectiveExpiry(P({ id: 'a', expiry: '2026-11-10' }))).toBe('2026-11-10T23:59:59.999Z')
  })
  it('takes min(expiry, cutoff) for chametz only', () => {
    const c = P({ id: 'a', chametz: true, expiry: '2027-12-01' })
    expect(effectiveExpiry(c, cutoff)).toBe('2027-04-21T10:00:00.000Z')
    expect(effectiveExpiry({ ...c, expiry: '2027-03-01' }, cutoff)).toBe('2027-03-01T23:59:59.999Z')
    expect(effectiveExpiry({ ...c, chametz: false }, cutoff)).toBe('2027-12-01T23:59:59.999Z')
    expect(effectiveExpiry({ ...c, expiry: null }, cutoff)).toBe('2027-04-21T10:00:00.000Z')
  })
  it('honours offsets in date-times', () => {
    const c = P({ id: 'a', chametz: true })
    expect(effectiveExpiry(c, '2027-04-21T10:00:00+03:00')).toBe('2027-04-21T07:00:00.000Z')
  })
})

describe('availability', () => {
  it('expired items are never available', () => {
    const i = P({ id: 'a', expiry: '2026-11-03' })
    expect(isAvailableAt(i, '2026-11-04')).toBe(false)
    expect(isAvailableAt(i, '2026-11-03')).toBe(true)
  })
  it('chametz is unavailable after the cutoff', () => {
    const i = P({ id: 'a', chametz: true })
    expect(isAvailableAt(i, '2027-04-21T09:00:00', cutoff)).toBe(true)
    expect(isAvailableAt(i, '2027-04-21T11:00:00', cutoff)).toBe(false)
    expect(isAvailableAt(i, '2027-04-25', cutoff)).toBe(false)
  })
  it('empty stock is unavailable', () => {
    expect(isAvailableAt(P({ id: 'a', amount: 0 }), '2026-11-04')).toBe(false)
    expect(
      availableItems([P({ id: 'a', amount: 0 }), P({ id: 'b' })], '2026-11-04').map((i) => i.id),
    ).toEqual(['b'])
  })
})

describe('expiringSoon', () => {
  const now = '2026-11-04T12:00:00'
  const items = [
    P({ id: 'later', expiry: '2026-11-20' }),
    P({ id: 'today', expiry: '2026-11-04' }),
    P({ id: 'tue', expiry: '2026-11-07' }),
    P({ id: 'gone', expiry: '2026-11-01' }),
    P({ id: 'never' }),
    P({ id: 'empty', expiry: '2026-11-05', amount: 0 }),
  ]
  it('lists unexpired items within n days, soonest first', () => {
    const r = expiringSoon(items, now, 3)
    expect(r.map((x) => x.item.id)).toEqual(['today', 'tue'])
    expect(r.map((x) => x.daysLeft)).toEqual([0, 3])
  })
  it('excludes expired items always', () => {
    expect(expiringSoon(items, now, 365).map((x) => x.item.id)).not.toContain('gone')
  })
  it('uses the chametz cutoff and flags it', () => {
    const r = expiringSoon(
      [
        P({ id: 'flour', chametz: true, expiry: '2027-12-01' }),
        P({ id: 'sugar', expiry: '2027-04-20' }),
      ],
      '2027-04-15T08:00:00',
      7,
      cutoff,
    )
    expect(r.map((x) => x.item.id)).toEqual(['sugar', 'flour'])
    expect(r.find((x) => x.item.id === 'flour')).toMatchObject({
      chametzLimited: true,
      daysLeft: 6,
    })
    expect(r.find((x) => x.item.id === 'sugar')!.chametzLimited).toBe(false)
  })
  it('does not list chametz past the cutoff', () => {
    expect(expiringSoon([P({ id: 'f', chametz: true })], '2027-04-22', 7, cutoff)).toEqual([])
  })
})

describe('computeHolds', () => {
  const L = (
    ingredientId: string,
    amount: number,
    unit: IngredientLine['unit'] = 'piece',
  ): IngredientLine => ({
    ingredientId,
    name: ingredientId,
    amount,
    unit,
  })
  const m = (
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

  it('holds what accepted meals will use, in the item unit', () => {
    const pantry = [P({ id: 'e', ingredientId: 'egg', amount: 6 })]
    const holds = computeHolds(pantry, [
      m('a', '2026-11-06', [L('egg', 2)], 2),
      m('b', '2026-11-07', [L('egg', 1)]),
    ])
    expect(holds).toEqual([{ pantryId: 'e', ingredientId: 'egg', held: 5, mealIds: ['a', 'b'] }])
    expect(freeAfterHolds(pantry, holds).get('e')).toBe(1)
  })
  it('never holds more than the stock', () => {
    const pantry = [P({ id: 'e', ingredientId: 'egg', amount: 2 })]
    const holds = computeHolds(pantry, [m('a', '2026-11-06', [L('egg', 5)])])
    expect(holds[0]!.held).toBe(2)
    expect(freeAfterHolds(pantry, holds).get('e')).toBe(0)
  })
  it('does not hold expired stock or chametz past the cutoff', () => {
    const pantry = [
      P({ id: 'e', ingredientId: 'egg', amount: 6, expiry: '2026-11-05' }),
      P({ id: 'f', ingredientId: 'flour', amount: 500, unit: 'g', chametz: true }),
    ]
    const holds = computeHolds(
      pantry,
      [m('a', '2026-11-06', [L('egg', 2)]), m('b', '2027-04-22', [L('flour', 100, 'g')])],
      cutoff,
    )
    expect(holds).toEqual([])
  })
  it('uses the soonest-expiring stock first', () => {
    const pantry = [
      P({ id: 'late', ingredientId: 'egg', amount: 6, expiry: '2026-12-01' }),
      P({ id: 'soon', ingredientId: 'egg', amount: 6, expiry: '2026-11-08' }),
    ]
    const holds = computeHolds(pantry, [m('a', '2026-11-06', [L('egg', 8)])])
    expect(holds.find((h) => h.pantryId === 'soon')!.held).toBe(6)
    expect(holds.find((h) => h.pantryId === 'late')!.held).toBe(2)
  })
  it('converts back to the item unit via density', () => {
    const pantry = [P({ id: 'f', ingredientId: 'flour', amount: 500, unit: 'g', density: 0.5 })]
    const holds = computeHolds(pantry, [
      m('a', '2026-11-06', [{ ...L('flour', 236.588, 'ml'), density: 0.5 }]),
    ])
    expect(holds[0]!.held).toBeCloseTo(118.294, 2)
  })
  it('ignores brought dishes and recalculates when plans change', () => {
    const pantry = [P({ id: 'e', ingredientId: 'egg', amount: 6 })]
    const a = m('a', '2026-11-06', [L('egg', 2)])
    expect(computeHolds(pantry, [{ ...a, brought: true }])).toEqual([])
    expect(computeHolds(pantry, [a])[0]!.held).toBe(2)
    expect(computeHolds(pantry, [{ ...a, scale: 2 }])[0]!.held).toBe(4)
    expect(computeHolds(pantry, [])).toEqual([])
  })
})
