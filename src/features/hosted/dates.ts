import type { ISODate } from '@/lib/api/types'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day, wd: new Date(Date.UTC(y, m - 1, day)).getUTCDay() }
}

/** `Wed 21 April 2027` (pure calendar arithmetic, no clock). */
export function longDate(d: ISODate): string {
  const p = parts(d)
  return `${DAYS[p.wd]} ${p.day} ${MONTHS[p.m - 1]} ${p.y}`
}

/** `Wed 21 – Sat 24 April 2027`, or one date. */
export function dateRange(from: ISODate, to: ISODate): string {
  if (from === to) return longDate(from)
  const a = parts(from)
  const b = parts(to)
  const left =
    a.y === b.y && a.m === b.m
      ? `${DAYS[a.wd]} ${a.day}`
      : `${DAYS[a.wd]} ${a.day} ${MONTHS[a.m - 1]}${a.y === b.y ? '' : ` ${a.y}`}`
  return `${left} – ${DAYS[b.wd]} ${b.day} ${MONTHS[b.m - 1]} ${b.y}`
}

/** The day before (a night meal belongs to the holy day that starts the next morning). */
export function dayBefore(d: ISODate): ISODate {
  const p = parts(d)
  return new Date(Date.UTC(p.y, p.m - 1, p.day - 1)).toISOString().slice(0, 10)
}
