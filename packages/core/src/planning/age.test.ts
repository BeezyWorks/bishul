import { describe, expect, it } from 'vitest'

import { ageOn, birthDateForAge, isKid, portionsFor, portionWeight } from './age'

describe('ageOn', () => {
  it('counts whole years and ticks up on the birthday', () => {
    expect(ageOn('2020-03-14', '2026-03-13')).toBe(5)
    expect(ageOn('2020-03-14', '2026-03-14')).toBe(6)
    expect(ageOn('2020-03-14', '2026-11-04')).toBe(6)
  })
  it('rejects the future and junk', () => {
    expect(ageOn('2030-01-01', '2026-11-04')).toBeNull()
    expect(ageOn('nope', '2026-11-04')).toBeNull()
  })
})

describe('birthDateForAge', () => {
  it('lands on the same age today and ages up on the anniversary', () => {
    const b = birthDateForAge(5, '2026-11-04')
    expect(b).toBe('2021-11-04')
    expect(ageOn(b, '2026-11-04')).toBe(5)
    expect(ageOn(b, '2027-11-04')).toBe(6)
  })
  it('handles Feb 29', () => {
    expect(birthDateForAge(3, '2028-02-29')).toBe('2025-02-28')
  })
})

describe('portions', () => {
  it('scales kids down and treats unknown age as an adult', () => {
    expect(portionWeight(undefined)).toBe(1)
    expect(portionWeight(1)).toBe(0.25)
    expect(portionWeight(5)).toBe(0.65)
    expect(portionWeight(15)).toBe(1)
    expect(portionsFor([40, 38, 5, 2])).toBe(3.25)
  })
  it('knows who is a kid', () => {
    expect(isKid(12)).toBe(true)
    expect(isKid(13)).toBe(false)
    expect(isKid(undefined)).toBe(false)
  })
})
