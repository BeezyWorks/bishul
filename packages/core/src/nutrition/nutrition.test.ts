import { describe, expect, it } from 'vitest'

import {
  goalsMet,
  mealNutrition,
  meetsBounds,
  normalizeNutrition,
  resplitNutrition,
  nutritionBounds,
  perServing,
} from './nutrition'

describe('perServing', () => {
  it('keeps per-serving data and divides whole-recipe data', () => {
    expect(perServing({ perServing: true, proteinG: 25 }, 4)).toEqual({ proteinG: 25 })
    expect(perServing({ proteinG: 25 }, 4)).toEqual({ proteinG: 25 })
    expect(perServing({ perServing: false, proteinG: 100, calories: 1000 }, 4)).toEqual({
      proteinG: 25,
      calories: 250,
    })
  })
  it('is unknown for whole-recipe data without servings, and for nothing', () => {
    expect(perServing({ perServing: false, proteinG: 100 }, null)).toBeNull()
    expect(perServing(null, 4)).toBeNull()
    expect(perServing({ perServing: true }, 4)).toBeNull()
  })
})

describe('bounds', () => {
  it('applies goal thresholds and lets explicit limits override', () => {
    expect(nutritionBounds(['high_protein'])).toEqual([{ field: 'proteinG', min: 20 }])
    expect(nutritionBounds(['high_protein'], { minProteinG: 30 })).toEqual([
      { field: 'proteinG', min: 30 },
    ])
  })
  it('passes, fails and reports unknown figures', () => {
    const b = nutritionBounds(['high_protein', 'high_fiber'])
    expect(meetsBounds({ proteinG: 25, fiberG: 6 }, b)).toBe('yes')
    expect(meetsBounds({ proteinG: 25, fiberG: 2 }, b)).toBe('no')
    expect(meetsBounds({ proteinG: 25 }, b)).toBe('unknown')
    expect(meetsBounds({ proteinG: 10 }, b)).toBe('no')
    expect(meetsBounds(null, b)).toBe('unknown')
  })
  it('lists the goals a serving meets', () => {
    expect(goalsMet({ proteinG: 22, fiberG: 6, calories: 500 })).toEqual([
      'high_protein',
      'high_fiber',
    ])
  })
})

describe('mealNutrition', () => {
  it('adds one serving of each dish and names the dishes missing a figure', () => {
    const m = mealNutrition([
      { title: 'Chicken', nutrition: { proteinG: 30, calories: 300 } },
      { title: 'Rice', nutrition: { proteinG: 4, calories: 200, fiberG: 1 } },
      { title: 'Salad', nutrition: null },
    ])
    expect(m.perPerson).toEqual({ proteinG: 34, calories: 500, fiberG: 1 })
    expect(m.missing.proteinG).toEqual(['Salad'])
    expect(m.missing.fiberG).toEqual(['Chicken', 'Salad'])
    expect(m.missing.sodiumMg).toEqual(['Chicken', 'Rice', 'Salad'])
  })
})

describe('normalizeNutrition', () => {
  it('stores per serving: divides whole-recipe figures, passes per-serving ones through', () => {
    expect(normalizeNutrition({ perServing: false, proteinG: 80, source: 'user' }, 4)).toEqual({
      perServing: true,
      proteinG: 20,
      source: 'user',
    })
    expect(normalizeNutrition({ proteinG: 24 }, null)).toEqual({ perServing: true, proteinG: 24 })
  })
  it('refuses whole-recipe figures without servings', () => {
    expect(normalizeNutrition({ perServing: false, proteinG: 80 }, null)).toBeNull()
  })
})

describe('resplitNutrition', () => {
  it('keeps the whole dish’s total when the servings change', () => {
    expect(resplitNutrition({ perServing: true, proteinG: 30, calories: 500 }, 4, 8)).toEqual({
      perServing: true,
      proteinG: 15,
      calories: 250,
    })
    expect(resplitNutrition({ perServing: true, proteinG: 10, source: 'ai' }, 6, 4)).toEqual({
      perServing: true,
      proteinG: 15,
      source: 'ai',
    })
  })
})
