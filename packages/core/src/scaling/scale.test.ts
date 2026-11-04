import { describe, expect, it } from 'vitest'

import type { IngredientLine } from '../units/types'
import { scaleLines } from './scale'

const line = (o: Partial<IngredientLine> & { ingredientId: string }): IngredientLine => ({
  name: o.ingredientId,
  amount: 100,
  unit: 'g',
  ...o,
})

describe('scaleLines', () => {
  it('scales linearly by factor with no warnings at 1x', () => {
    const r = scaleLines([line({ ingredientId: 'flour', amount: 200 })], { factor: 1 })
    expect(r.lines[0]!.amount).toBe(200)
    expect(r.warnings).toEqual([])
  })
  it('scales to target servings', () => {
    const r = scaleLines([line({ ingredientId: 'flour', amount: 200 })], {
      fromServings: 4,
      toServings: 6,
    })
    expect(r.factor).toBe(1.5)
    expect(r.lines[0]!.amount).toBe(300)
    expect(r.lines[0]!.baseAmount).toBe(200)
  })
  it('scales ranges and leaves null amounts alone', () => {
    const r = scaleLines(
      [
        line({ ingredientId: 'garlic', amount: 2, amountMax: 3, unit: 'piece' }),
        line({ ingredientId: 'pepper', amount: null }),
      ],
      { factor: 2 },
    )
    expect(r.lines[0]).toMatchObject({ amount: 4, amountMax: 6 })
    expect(r.lines[1]!.amount).toBeNull()
  })
  it('rounds pieces to the nearest half and warns', () => {
    const r = scaleLines([line({ ingredientId: 'egg', name: 'Eggs', amount: 3, unit: 'piece' })], {
      factor: 0.5,
    })
    expect(r.lines[0]).toMatchObject({ amount: 1.5, rounded: false })
    const r2 = scaleLines([line({ ingredientId: 'egg', name: 'Eggs', amount: 3, unit: 'piece' })], {
      factor: 0.6,
    })
    expect(r2.lines[0]).toMatchObject({ amount: 2, rounded: true })
    expect(r2.warnings.find((w) => w.code === 'piece-rounded')!.message).toContain('Eggs')
    const r3 = scaleLines([line({ ingredientId: 'egg', amount: 1, unit: 'piece' })], {
      factor: 1.3,
    })
    expect(r3.lines[0]!.amount).toBe(1.5)
  })
  it('enforces a half-piece minimum', () => {
    const r = scaleLines([line({ ingredientId: 'egg', amount: 1, unit: 'piece' })], { factor: 0.1 })
    expect(r.lines[0]!.amount).toBe(0.5)
    expect(r.warnings.some((w) => w.code === 'piece-minimum')).toBe(true)
  })
  it('warns about leavening on any real change', () => {
    const lines = [line({ ingredientId: 'bp', amount: 5, nonLinear: 'leavening' })]
    expect(scaleLines(lines, { factor: 1.2 }).warnings.map((w) => w.code)).toContain('leavening')
    expect(scaleLines(lines, { factor: 1 }).warnings).toEqual([])
  })
  it('warns about salt and spices only for big changes', () => {
    const lines = [
      line({ ingredientId: 'salt', nonLinear: 'salt' }),
      line({ ingredientId: 'cumin', nonLinear: 'spice' }),
    ]
    expect(scaleLines(lines, { factor: 1.25 }).warnings.map((w) => w.code)).not.toContain('salt')
    const big = scaleLines(lines, { factor: 3 }).warnings.map((w) => w.code)
    expect(big).toContain('salt')
    expect(big).toContain('spice')
    expect(scaleLines(lines, { factor: 0.5 }).warnings.map((w) => w.code)).toContain('salt')
  })
  it('adds pan and time notes', () => {
    const r = scaleLines(
      [line({ ingredientId: 'flour' })],
      { factor: 2 },
      { pan: '9x13 pan', cookTimeMinutes: 35 },
    )
    const pan = r.warnings.find((w) => w.code === 'pan')!
    expect(pan.message).toContain('9x13')
    expect(r.warnings.find((w) => w.code === 'time')!.message).toContain('35')
    expect(
      scaleLines([line({ ingredientId: 'flour' })], { factor: 2 }).warnings.map((w) => w.code),
    ).toEqual(['time'])
    expect(
      scaleLines([line({ ingredientId: 'flour' })], { factor: 1.05 }, { pan: true }).warnings,
    ).toEqual([])
  })
  it('throws on zero, negative, or invalid factors', () => {
    for (const factor of [0, -1, NaN, Infinity]) {
      expect(() => scaleLines([], { factor })).toThrow(RangeError)
    }
    expect(() => scaleLines([], { fromServings: 0, toServings: 4 })).toThrow(RangeError)
  })
  it('does not mutate input', () => {
    const l = line({ ingredientId: 'flour', amount: 200 })
    scaleLines([l], { factor: 2 })
    expect(l.amount).toBe(200)
  })
})
