/** Date helpers. Dates are ISO `YYYY-MM-DD` strings in the household's time zone; math is done in UTC. */
import type { ISODate } from '@/lib/api/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbat']
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

export function toDate(iso: ISODate): Date {
  return new Date(`${iso}T12:00:00Z`)
}
export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}
export function addDays(iso: ISODate, n: number): ISODate {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}
export function weekday(iso: ISODate): number {
  return toDate(iso).getUTCDay()
}
export function weekdayName(iso: ISODate, short = false): string {
  const n = DAYS[weekday(iso)]
  return short && n !== 'Shabbat' ? n.slice(0, 3) : n
}
export function monthName(m: number): string {
  return MONTHS[m]
}
export function dayNum(iso: ISODate): number {
  return toDate(iso).getUTCDate()
}
/** "Fri 13 Nov" */
export function shortDate(iso: ISODate): string {
  const d = toDate(iso)
  return `${weekdayName(iso, true)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
}
/** "Friday 13 November" */
export function longDate(iso: ISODate): string {
  const d = toDate(iso)
  return `${weekdayName(iso)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
export function rangeDays(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
/** The 6-week grid (Sunday start) for a month. `month` is 0-based. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = toISO(new Date(Date.UTC(year, month, 1, 12)))
  const start = addDays(first, -weekday(first))
  return rangeDays(start, addDays(start, 41))
}

const HEBREW_MONTHS: Record<string, string> = { Heshvan: 'Cheshvan', Tishri: 'Tishrei' }

/** Hebrew date in Israeli transliteration, e.g. "4 Kislev". */
export function hebrewDate(iso: ISODate): string {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).formatToParts(toDate(iso))
    const day = parts.find((p) => p.type === 'day')?.value ?? ''
    const month = parts.find((p) => p.type === 'month')?.value ?? ''
    return `${day} ${HEBREW_MONTHS[month] ?? month}`
  } catch {
    return ''
  }
}

const HE_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const HE_TENS = ['', 'י', 'כ', 'ל']
/** 1–30 as Hebrew letters, no geresh: 4 → ד, 15 → טו, 30 → ל. */
function hebrewNumeral(n: number): string {
  if (n === 15) return 'טו'
  if (n === 16) return 'טז'
  return `${HE_TENS[Math.floor(n / 10)]}${HE_ONES[n % 10]}`
}

/** Hebrew date for a day card, in Hebrew only and without the year: "ל כסלו". */
export function hebrewDayMonth(iso: ISODate): string {
  try {
    const parts = new Intl.DateTimeFormat('he-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).formatToParts(toDate(iso))
    const day = Number(parts.find((p) => p.type === 'day')?.value)
    const month = parts.find((p) => p.type === 'month')?.value ?? ''
    return day ? `${hebrewNumeral(day)} ${month}` : ''
  } catch {
    return ''
  }
}

/** "16:28" to "4:28 PM". */
export function clock12(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const ORDINAL = /^(\d+)(?:st|nd|rd|th) of (.+?)(?:, \d+)?$/
/** The server's "4th of Kislev, 5787" as "4 Kislev". */
export function shortHebrew(text: string | undefined | null): string {
  if (!text) return ''
  const m = ORDINAL.exec(text)
  return m ? `${m[1]} ${m[2]}` : text
}

/** What someone typed for "birthday or age": `2020-03-14` is a birthday, a small whole number is an age. */
export function parseBirthInput(text: string): { birthDate: ISODate } | { age: number } | null {
  const t = text.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t))) return { birthDate: t }
  if (/^\d{1,3}$/.test(t) && +t <= 120) return { age: +t }
  return null
}
