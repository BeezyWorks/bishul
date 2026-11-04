import { addDays, parseDate } from '@beitecha/engine'

import type { DateString, Minutes } from './types'

export { addDays }

/** Whole days between two civil dates (`b - a`). */
export function daysBetween(a: DateString, b: DateString): number {
  const pa = parseDate(a)
  const pb = parseDate(b)
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) /
      86_400_000,
  )
}

/** Days since 1970-01-01 of a civil date. */
export function dayNumber(date: DateString): number {
  const p = parseDate(date)
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)
}

/** An absolute timeline position in minutes: a civil date plus minutes since its midnight. Wall-clock, not UTC. */
export function abs(date: DateString, minutes: Minutes): number {
  return dayNumber(date) * 1440 + minutes
}

/** The civil date and minutes-of-day of an absolute position. */
export function fromAbs(t: number): { date: DateString; minutes: Minutes } {
  const day = Math.floor(t / 1440)
  const date = addDays('1970-01-01', day)
  return { date, minutes: Math.round(t - day * 1440) }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayName(date: DateString): string {
  const p = parseDate(date)
  return WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]
}

/** `5:48 PM`. */
export function clock12(minutes: Minutes): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
