import type { DateString } from './types'

/** Under this age a person counts as a kid for suggestions (kids-love-it dishes rank higher). */
export const KID_MAX_AGE = 12

/** Whole years between `birthDate` and `today` (both `YYYY-MM-DD`); null if the birthday is unusable or in the future. */
export function ageOn(birthDate: DateString, today: DateString): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  if (!b || !t) return null
  let age = +t[1] - +b[1]
  if (+t[2] < +b[2] || (+t[2] === +b[2] && +t[3] < +b[3])) age--
  return age < 0 ? null : age
}

/** The birth date that makes someone `age` today: same month and day, `age` years back. Feb 29 falls back to Feb 28. */
export function birthDateForAge(age: number, today: DateString): DateString {
  const year = +today.slice(0, 4) - age
  const monthDay = today.slice(5)
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const md = monthDay === '02-29' && !leap(year) ? '02-28' : monthDay
  return `${String(year).padStart(4, '0')}-${md}`
}

export const isKid = (age: number | undefined): boolean => age !== undefined && age <= KID_MAX_AGE

/**
 * How much of an adult portion someone eats, by age. Unknown age is an adult. Rough on purpose: the point is that a
 * table of three adults and two toddlers does not need five adult servings.
 */
export function portionWeight(age: number | undefined): number {
  if (age === undefined) return 1
  if (age < 2) return 0.25
  if (age < 5) return 0.5
  if (age < 9) return 0.65
  if (age < 13) return 0.85
  return 1
}

/** Adult-portion equivalents for a table, rounded to a quarter. */
export function portionsFor(ages: (number | undefined)[]): number {
  const total = ages.reduce<number>((sum, a) => sum + portionWeight(a), 0)
  return Math.round(total * 4) / 4
}
