import { describe, expect, it } from 'vitest'

import { convert, convertCanonical, toCanonical } from './convert'
import { formatQuantity, roundToFraction } from './display'
import { parseQuantity } from './parse'
import type { DisplayPrefs, Quantity } from './types'

const us: DisplayPrefs = { system: 'us' }
const metric: DisplayPrefs = { system: 'metric' }
const ml = (amount: number, approx = false): Quantity => ({ amount, unit: 'ml', approx })
const g = (amount: number, approx = false): Quantity => ({ amount, unit: 'g', approx })
const tsp = (n: number) => ml(n * 4.92892159375)

describe('parseQuantity', () => {
  it('parses mixed numbers', () => {
    const p = parseQuantity('1 1/2 cups flour')!
    expect(p.unit).toBe('ml')
    expect(p.amount).toBeCloseTo(1.5 * 236.588, 2)
    expect(p.rest).toBe('flour')
    expect(p.original).toBe('1 1/2 cups flour')
    expect(p.approx).toBe(false)
  })
  it('parses unicode fractions, with and without a whole part', () => {
    expect(parseQuantity('½ tsp salt')!.amount).toBeCloseTo(2.4645, 3)
    expect(parseQuantity('1½ cups')!.amount).toBeCloseTo(1.5 * 236.588, 2)
    expect(parseQuantity('2 ¾ cups')!.amount).toBeCloseTo(2.75 * 236.588, 2)
    expect(parseQuantity('⅓ cup')!.amount).toBeCloseTo(236.588 / 3, 2)
  })
  it('parses attached units and decimals', () => {
    expect(parseQuantity('200g')).toMatchObject({ amount: 200, unit: 'g', rest: '' })
    expect(parseQuantity('1.5 kg potatoes')).toMatchObject({
      amount: 1500,
      unit: 'g',
      rest: 'potatoes',
    })
    expect(parseQuantity('.5 l')).toMatchObject({ amount: 500, unit: 'ml' })
  })
  it('parses weights', () => {
    expect(parseQuantity('2 lb')!.amount).toBeCloseTo(907.18, 1)
    expect(parseQuantity('8 oz')!.amount).toBeCloseTo(226.8, 1)
    expect(parseQuantity('2 fl oz')!.amount).toBeCloseTo(59.147, 2)
  })
  it('parses ranges as low amount plus max, approximate', () => {
    const p = parseQuantity('2-3 cloves garlic')!
    expect(p).toMatchObject({
      amount: 2,
      amountMax: 3,
      unit: 'piece',
      approx: true,
      rest: 'garlic',
    })
    expect(parseQuantity('2 to 3 tbsp')!.amountMax).toBeCloseTo(3 * 14.7868, 2)
    expect(parseQuantity('3–2 cups')).toMatchObject({ approx: true })
    expect(parseQuantity('3–2 cups')!.amount).toBeLessThan(parseQuantity('3–2 cups')!.amountMax!)
  })
  it('parses pinches and dashes as approximate', () => {
    const p = parseQuantity('a pinch of salt')!
    expect(p).toMatchObject({ unit: 'ml', approx: true, rest: 'salt' })
    expect(p.amount).toBeCloseTo(0.308, 2)
    expect(parseQuantity('dash')!.amount).toBeCloseTo(0.616, 2)
  })
  it('parses counts with descriptors', () => {
    expect(parseQuantity('3 large eggs')).toMatchObject({
      amount: 3,
      unit: 'piece',
      rest: 'large eggs',
    })
    expect(parseQuantity('1 onion, diced')).toMatchObject({
      amount: 1,
      unit: 'piece',
      rest: 'onion, diced',
    })
    expect(parseQuantity('a lemon')).toMatchObject({ amount: 1, unit: 'piece', rest: 'lemon' })
  })
  it('handles articles before a unit', () => {
    expect(parseQuantity('a cup of sugar')).toMatchObject({ unit: 'ml', rest: 'sugar' })
  })
  it('returns null for garbage', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('salt to taste')).toBeNull()
    expect(parseQuantity('-2 cups')).toBeNull()
  })
  it('parses zero without failing', () => {
    expect(parseQuantity('0 cups')!.amount).toBe(0)
  })
})

describe('conversion', () => {
  it('converts volume to volume exactly', () => {
    expect(convert(48, 'tsp', 'cup')).toEqual({ amount: expect.closeTo(1, 9), approx: false })
    expect(convert(1, 'cup', 'tbsp')!.amount).toBeCloseTo(16, 9)
    expect(convert(1, 'quart', 'ml')!.amount).toBeCloseTo(946.353, 2)
  })
  it('converts weight to weight exactly', () => {
    expect(convert(1, 'lb', 'oz')!.amount).toBeCloseTo(16, 9)
    expect(convert(1, 'kg', 'g')).toEqual({ amount: 1000, approx: false })
  })
  it('refuses weight<->volume without density', () => {
    expect(convert(1, 'cup', 'g')).toBeNull()
    expect(convertCanonical(g(100), 'ml')).toBeNull()
    expect(convertCanonical(g(100), 'ml', 0)).toBeNull()
  })
  it('uses density and marks the result approximate', () => {
    const r = convert(1, 'cup', 'g', { density: 0.507 })!
    expect(r.amount).toBeCloseTo(120, 0)
    expect(r.approx).toBe(true)
    expect(convert(120, 'g', 'cup', { density: 0.507 })!.amount).toBeCloseTo(1, 1)
  })
  it('keeps source approximation', () => {
    expect(convert(1, 'cup', 'ml', { approx: true })!.approx).toBe(true)
    expect(toCanonical(2, 'oz', true)!.approx).toBe(true)
  })
  it('never converts pieces', () => {
    expect(convert(2, 'piece', 'g', { density: 1 })).toBeNull()
    expect(convert(2, 'g', 'piece', { density: 1 })).toBeNull()
  })
  it('rejects unknown units and NaN', () => {
    expect(convert(1, 'furlong', 'g')).toBeNull()
    expect(toCanonical(NaN, 'g')).toBeNull()
  })
})

describe('roundToFraction', () => {
  it('rounds to kitchen fractions', () => {
    expect(roundToFraction(0.33).text).toBe('⅓')
    expect(roundToFraction(1.62).text).toBe('1⅔')
    expect(roundToFraction(2.97).text).toBe('3')
    expect(roundToFraction(0.1).text).toBe('⅛')
    expect(roundToFraction(0.02).text).toBe('0')
  })
})

describe('formatQuantity', () => {
  it('formats US volumes with fractions and sensible upgrades', () => {
    expect(formatQuantity(tsp(48), us).text).toBe('1 cup')
    expect(formatQuantity(tsp(72), us).text).toBe('1½ cups')
    expect(formatQuantity(tsp(0.5), us).text).toBe('½ tsp')
    expect(formatQuantity(tsp(3), us).text).toBe('1 tbsp')
    expect(formatQuantity(tsp(2.95), us).text).toBe('1 tbsp')
    expect(formatQuantity(tsp(12), us).text).toBe('¼ cup')
    expect(formatQuantity(tsp(8), us).text).toBe('2⅔ tbsp')
    expect(formatQuantity(tsp(16), us).text).toBe('⅓ cup')
    expect(formatQuantity(tsp(48 * 4), us).text).toBe('1 quart')
    expect(formatQuantity(tsp(48 * 8), us).text).toBe('2 quarts')
    expect(formatQuantity(tsp(48 * 5), us).text).toBe('5 cups')
    expect(formatQuantity(tsp(0.01), us).text).toBe('a pinch')
  })
  it('formats metric volumes', () => {
    expect(formatQuantity(ml(237), metric).text).toBe('235 ml')
    expect(formatQuantity(ml(1500), metric).text).toBe('1.5 l')
    expect(formatQuantity(ml(7.3), metric).text).toBe('7 ml')
    expect(formatQuantity(ml(1.2), metric).text).toBe('1 ml')
  })
  it('formats grams in whole or 5 g steps', () => {
    expect(formatQuantity(g(203), metric).text).toBe('205 g')
    expect(formatQuantity(g(12.4), metric).text).toBe('12 g')
    expect(formatQuantity(g(2.2), metric).text).toBe('2 g')
    expect(formatQuantity(g(1250), metric).text).toBe('1.25 kg')
    expect(formatQuantity(g(998), metric).text).toBe('1 kg')
  })
  it('formats US weights', () => {
    expect(formatQuantity(g(226.8), us).text).toBe('8 oz')
    expect(formatQuantity(g(680), us).text).toBe('1½ lb')
    expect(formatQuantity(g(0.5), us).text).toBe('0.5 g')
  })
  it('flags approximate with ~', () => {
    const f = formatQuantity(g(100, true), metric)
    expect(f.text).toBe('~100 g')
    expect(f.approx).toBe(true)
  })
  it('formats pieces', () => {
    expect(formatQuantity({ amount: 3.5, unit: 'piece', approx: false }, us).text).toBe('3½')
    expect(formatQuantity({ amount: 2, unit: 'piece', approx: false }, metric).text).toBe('2')
  })
  it('applies per-category overrides with density', () => {
    const prefs: DisplayPrefs = {
      system: 'us',
      overrides: {
        flour: { system: 'metric', dimension: 'weight' },
        liquid: { dimension: 'volume' },
      },
    }
    const flour = formatQuantity(ml(236.588), prefs, { category: 'flour', density: 0.507 })
    expect(flour.text).toBe('~120 g')
    const milk = formatQuantity(g(244), prefs, { category: 'liquid', density: 1.03 })
    expect(milk.text).toBe('~1 cup')
    // no density: falls back to natural dimension, still converts system
    expect(formatQuantity(ml(236.588), prefs, { category: 'flour' }).text).toBe('235 ml')
    // other categories use the global system
    expect(formatQuantity(ml(236.588), prefs, { category: 'oil' }).text).toBe('1 cup')
  })
})
