// Hosted meals: the slots of a day, the holy days (Shabbat and Yom Tov) and the runs they form, the default meals of
// a holy day, automatic meal names and the keys that address a run or a single hosted meal. All deterministic; the
// calendar itself comes from the engine (through `calendarDays`).
import { PUBLIC_HOLIDAY } from '@beitecha/engine'

import { calendarDays, type CalendarDay } from './calendar'
import { addDays, weekdayName } from './time'
import type { DateString, HouseholdLocation } from './types'
import type { MealSlot as PrepSlot } from './prep'

// ---------------------------------------------------------------------------
// Slots

/** Where a meal sits in the day. Breakfast, Kiddush, Brunch, Lunch, Dinner and Oneg are the user's choices. */
export const DAY_SLOTS = [
  'breakfast',
  'kiddush',
  'brunch',
  'lunch',
  'seudah_shlishit',
  'dinner',
  'oneg',
] as const
export type DaySlot = (typeof DAY_SLOTS)[number]

export const isDaySlot = (x: unknown): x is DaySlot =>
  typeof x === 'string' && (DAY_SLOTS as readonly string[]).includes(x)

/** The slots a person picks when they add a meal ("Seudah shlishit" is a button on the hosted page instead). */
export const PICKABLE_SLOTS: DaySlot[] = [
  'breakfast',
  'kiddush',
  'brunch',
  'lunch',
  'dinner',
  'oneg',
]

export const SLOT_LABELS: Record<DaySlot, string> = {
  breakfast: 'Breakfast',
  kiddush: 'Kiddush',
  brunch: 'Brunch',
  lunch: 'Lunch',
  seudah_shlishit: 'Seudah shlishit',
  dinner: 'Dinner',
  oneg: 'Oneg',
}

/** Dinner and oneg are the evening: on a holy day they belong to the day that starts that evening. */
export const NIGHT_SLOTS: DaySlot[] = ['dinner', 'oneg']
export const isNightSlot = (slot: DaySlot): boolean => NIGHT_SLOTS.includes(slot)

/** Position in an ordinary calendar day (midnight to midnight). */
export const slotOrder = (slot: DaySlot): number => DAY_SLOTS.indexOf(slot)

/** Position in a holy day, which runs from its evening: dinner, oneg, then breakfast ... seudah shlishit. */
export const holyDaySlotOrder = (slot: DaySlot): number =>
  (isNightSlot(slot) ? 0 : 10) + slotOrder(slot)

export interface Orderable {
  slot: DaySlot
  /** Minutes after midnight, if the meal has a time. */
  time?: number | null
  name?: string
  createdAt?: number
}

function tieBreak(a: Orderable, b: Orderable): number {
  return (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.name ?? '').localeCompare(b.name ?? '')
}

/** Meals of one calendar day in order: by slot, then by time within a slot, then by creation. */
export function compareMealsInDay(a: Orderable, b: Orderable): number {
  return (
    slotOrder(a.slot) - slotOrder(b.slot) ||
    (a.time ?? Infinity) - (b.time ?? Infinity) ||
    tieBreak(a, b)
  )
}

/** Meals of one holy day in order (the evening meal first). */
export function compareMealsInHolyDay(a: Orderable, b: Orderable): number {
  return (
    holyDaySlotOrder(a.slot) - holyDaySlotOrder(b.slot) ||
    (a.time ?? Infinity) - (b.time ?? Infinity) ||
    tieBreak(a, b)
  )
}

/** The slot the prep scheduler understands. */
export function prepSlotOf(slot: DaySlot): PrepSlot {
  switch (slot) {
    case 'breakfast':
      return 'breakfast'
    case 'seudah_shlishit':
      return 'seudah_shlishit'
    case 'dinner':
    case 'oneg':
      return 'dinner'
    default:
      return 'lunch'
  }
}

/** A slot for an existing meal that has no slot yet, from its time of day (minutes). */
export function slotFromTime(time: number | null | undefined): DaySlot {
  if (time === null || time === undefined) return 'dinner'
  if (time < 10 * 60) return 'breakfast'
  if (time < 16 * 60) return 'lunch'
  return 'dinner'
}

// ---------------------------------------------------------------------------
// Holiday names

const noise: RegExp[] = [
  /^Yom Kippur Katan/i,
  /^Ta.anit Bechorot/i,
  /^Chag HaBanot/i,
  /^Sigd$/i,
  /war memorial/i,
  /^Shabbat /i,
  /^Parashat/i,
  /^Leil Selichot/i,
  /mevarchim/i,
]

/** A holiday as the app spells it: `Chanuka`, `Chol Hamoed Pesach`, no hebcal decoration. */
export function holidayName(raw: string): string {
  let t = raw.replace(/[’‘]/g, "'").replace(/\s+\d{4}$/, '')
  if (/^Chanukah/i.test(t)) return 'Chanuka'
  const ch = /^(\w+)\s+[IVX]+\s+\(CH''M\)$/.exec(t)
  if (ch) return `Chol Hamoed ${ch[1]}`
  if (/Hoshana Raba/i.test(t)) return 'Hoshana Raba'
  t = t.replace(/\s*\(.*\)$/, '')
  return t
}

function holidayRank(name: string): number {
  if (/^Chanuka$|^Purim$|^Shushan Purim$/.test(name)) return 1
  if (/^Rosh Chodesh/.test(name)) return 4
  return 2
}

/**
 * The Jewish holiday that names a weekday meal: Chanuka, Purim, Pesach's Chol Hamoed days and every other holiday
 * the calendar shows, minor days included (Rosh Chodesh sorts last). Null when the day has none.
 */
export function namingJewishHoliday(jewishHolidays: readonly string[]): string | null {
  const names = jewishHolidays
    .filter((h) => !noise.some((re) => re.test(h)))
    .map(holidayName)
    .filter(Boolean)
  if (!names.length) return null
  return [...names].sort((a, b) => holidayRank(a) - holidayRank(b))[0]
}

/**
 * Civil holidays that may be shown or used in a name. The engine labels days that are public holidays only for their
 * religious origin (Christmas, Good Friday, Easter Monday) "Public holiday": those never appear anywhere.
 */
export function visibleCivilHolidays(civilHolidays: readonly string[]): string[] {
  return civilHolidays.filter((h) => h.trim() !== '' && h !== PUBLIC_HOLIDAY)
}

/** The day's holidays for display: Jewish ones first, then named civil ones. Never a "Public holiday". */
export function displayHolidays(day: Pick<CalendarDay, 'jewishHolidays' | 'civilHolidays'>): {
  name: string
  kind: 'jewish' | 'civil'
}[] {
  return [
    ...day.jewishHolidays
      .filter((h) => !noise.some((re) => re.test(h)))
      .map((h) => ({ name: holidayName(h), kind: 'jewish' as const })),
    ...visibleCivilHolidays(day.civilHolidays).map((name) => ({ name, kind: 'civil' as const })),
  ]
}

/**
 * The name of a hosted weekday meal: the day's Jewish holiday, else its named civil holiday (Thanksgiving), else
 * "Tuesday dinner". A "Public holiday" never names a meal.
 */
export function autoMealName(
  day: Pick<CalendarDay, 'date' | 'jewishHolidays' | 'civilHolidays'>,
  slot: DaySlot,
): string {
  return (
    namingJewishHoliday(day.jewishHolidays) ??
    visibleCivilHolidays(day.civilHolidays)[0] ??
    `${weekdayName(day.date)} ${SLOT_LABELS[slot].toLowerCase()}`
  )
}

/** Whether a stored name is still the automatic one (so a move to another day may rename it). */
export function nameToStore(
  current: { name: string; nameEdited: boolean },
  next: { name?: string; auto: string },
): { name: string; nameEdited: boolean } {
  if (next.name !== undefined && next.name.trim() !== '')
    return { name: next.name.trim(), nameEdited: true }
  if (current.nameEdited) return current
  return { name: next.auto, nameEdited: false }
}

// ---------------------------------------------------------------------------
// Holy days and runs

export type HolidayFamily =
  'shabbat' | 'pesach' | 'shavuot' | 'rosh_hashana' | 'sukkot' | 'shmini_atzeret' | 'other'

export interface DefaultMeal {
  /** `night` is the evening that starts the holy day (the civil date before), `day` is the daytime. */
  part: 'night' | 'day'
  /** The civil date the meal is stored under: the eve for `night`, the holy day itself for `day`. */
  date: DateString
  slot: DaySlot
  /** Seder I, Seder II, Leil Yom Tov, Leil Shabbat, Yom Tov day, Shabbat day. */
  name: string
}

export interface HolyDay {
  /** The civil date of the day itself; its night is the evening of `eveDate`. */
  date: DateString
  eveDate: DateString
  /** `Pesach I`, `Pesach II`, `Shabbat`, `Shvi'i shel Pesach`, ... */
  label: string
  family: HolidayFamily
  isShabbat: boolean
  isYomTov: boolean
  /** Falls in Chol Hamoed (a Shabbat of Chol Hamoed). */
  isCholHamoed: boolean
  defaultMeals: DefaultMeal[]
}

export interface HostedRun {
  /** `run-<date of the first holy day>`: the same key for the page and the print view. */
  key: string
  /** First and last holy day (civil dates). The first night begins on `startsOn`. */
  from: DateString
  to: DateString
  startsOn: DateString
  /** `Shabbat Toldot`, `Pesach · first days`, ... */
  title: string
  holyDays: HolyDay[]
}

interface Labelled {
  label: string
  family: HolidayFamily
  /** First night of Pesach: the Seder. */
  seder: 'I' | 'II' | 'single' | null
}

/** The label of a Shabbat or Yom Tov day (`Pesach I`, `Shvi'i shel Pesach`, `Shabbat`). */
function labelHolyDay(day: CalendarDay, israel: boolean): Labelled {
  const raw = day.isYomTov
    ? (day.jewishHolidays
        .map((h) => h.replace(/[’‘]/g, "'"))
        .find((h) =>
          /^(Pesach|Sukkot|Shmini Atzeret|Simchat Torah|Shavuot|Rosh Hashana|Yom Kippur)/.test(h),
        ) ?? '')
    : ''
  if (!day.isYomTov) return { label: 'Shabbat', family: 'shabbat', seder: null }
  let m: RegExpExecArray | null
  if ((m = /^Pesach (I|II)$/.exec(raw))) {
    const n = m[1] as 'I' | 'II'
    return israel
      ? { label: 'Pesach', family: 'pesach', seder: 'single' }
      : { label: `Pesach ${n}`, family: 'pesach', seder: n }
  }
  if (/^Pesach VII$/.test(raw))
    return { label: "Shvi'i shel Pesach", family: 'pesach', seder: null }
  if (/^Pesach VIII$/.test(raw))
    return { label: 'Acharon shel Pesach', family: 'pesach', seder: null }
  if ((m = /^Sukkot (I|II)$/.exec(raw)))
    return { label: israel ? 'Sukkot' : `Sukkot ${m[1]}`, family: 'sukkot', seder: null }
  if (/^Shmini Atzeret/.test(raw))
    return { label: 'Shmini Atzeret', family: 'shmini_atzeret', seder: null }
  if (/^Simchat Torah/.test(raw))
    return { label: 'Simchat Torah', family: 'shmini_atzeret', seder: null }
  if ((m = /^Shavuot( (I|II))?$/.exec(raw)))
    return {
      label: israel || !m[2] ? 'Shavuot' : `Shavuot ${m[2]}`,
      family: 'shavuot',
      seder: null,
    }
  if (/^Rosh Hashana/.test(raw))
    return {
      label: /II$/.test(raw) ? 'Rosh Hashana II' : 'Rosh Hashana I',
      family: 'rosh_hashana',
      seder: null,
    }
  return { label: 'Yom Tov', family: 'other', seder: null }
}

function holyDayOf(day: CalendarDay, israel: boolean): HolyDay {
  const l = labelHolyDay(day, israel)
  const eveDate = addDays(day.date, -1)
  const nightName = day.isYomTov
    ? l.seder === 'I'
      ? 'Seder I'
      : l.seder === 'II'
        ? 'Seder II'
        : l.seder === 'single'
          ? 'Seder'
          : 'Leil Yom Tov'
    : 'Leil Shabbat'
  return {
    date: day.date,
    eveDate,
    label: l.label,
    family: l.family,
    isShabbat: day.isShabbat && !day.isYomTov,
    isYomTov: day.isYomTov,
    isCholHamoed: day.isCholHamoed,
    defaultMeals: [
      { part: 'night', date: eveDate, slot: 'dinner', name: nightName },
      {
        part: 'day',
        date: day.date,
        slot: 'lunch',
        name: day.isYomTov ? 'Yom Tov day' : 'Shabbat day',
      },
    ],
  }
}

/** Yom Kippur has no meals (it is a fast) and is left out of holy days; break-fast is an ordinary hosted meal. */
const isHolyDay = (d: CalendarDay): boolean => (d.isShabbat || d.isYomTov) && !d.isYomKippur

function runTitle(days: HolyDay[], calendar: CalendarDay[]): string {
  const yt = days.filter((d) => d.isYomTov)
  if (!yt.length) {
    const parasha = calendar.find((c) => c.date === days[0].date)?.parasha
    return parasha ? `Shabbat ${parasha}` : 'Shabbat'
  }
  const fam = yt[0].family
  const labels = yt.map((d) => d.label)
  switch (fam) {
    case 'pesach':
      if (labels.includes('Pesach')) return 'Pesach'
      if (labels.some((l) => /^Pesach/.test(l))) return 'Pesach · first days'
      return labels.length === 1 && labels[0] === "Shvi'i shel Pesach"
        ? labels[0]
        : 'Pesach · last days'
    case 'shmini_atzeret':
      return labels.length > 1 ? 'Shmini Atzeret and Simchat Torah' : labels[0]
    case 'sukkot':
      return 'Sukkot'
    case 'rosh_hashana':
      return 'Rosh Hashana'
    case 'shavuot':
      return 'Shavuot'
    default:
      return labels[0]
  }
}

export const runKey = (firstHolyDate: DateString): string => `run-${firstHolyDate}`
export const mealKey = (mealId: string): string => `meal-${mealId}`

export type HostedKey = { type: 'run'; date: DateString } | { type: 'meal'; mealId: string }

/** Reads the key from a URL (`/hosted/[key]`). Null for anything else. */
export function parseHostedKey(key: string): HostedKey | null {
  const run = /^run-(\d{4}-\d{2}-\d{2})$/.exec(key)
  if (run) return { type: 'run', date: run[1] }
  const meal = /^meal-([0-9A-Za-z_-]+)$/.exec(key)
  if (meal) return { type: 'meal', mealId: meal[1] }
  return null
}

/** The hosted key of a meal: its run's key when it belongs to a run, else the meal's own. */
export function hostedKeyFor(meal: { id: string; runKey?: string | null }): string {
  return meal.runKey ? meal.runKey : mealKey(meal.id)
}

/**
 * Every run of Shabbat and Yom Tov days that touches `from`..`to`: a run touches the range when any of its nights
 * or days does (its first night is the civil day before its first holy day). Consecutive holy days (Pesach I, Pesach
 * II, Shabbat) join; a weekday between two holy days separates them. Israel vs diaspora comes from the location.
 */
export function hostedRuns(from: DateString, to: DateString, loc: HouseholdLocation): HostedRun[] {
  const start = addDays(from, -6)
  const end = addDays(to, 6)
  const cal = calendarDays(start, end, loc)
  const holy = cal.filter(isHolyDay)
  const runs: HolyDay[][] = []
  for (const d of holy) {
    const hd = holyDayOf(d, loc.israel)
    const last = runs[runs.length - 1]
    if (last && addDays(last[last.length - 1].date, 1) === d.date) last.push(hd)
    else runs.push([hd])
  }
  return runs
    .map((days): HostedRun => ({
      key: runKey(days[0].date),
      from: days[0].date,
      to: days[days.length - 1].date,
      startsOn: days[0].eveDate,
      title: runTitle(days, cal),
      holyDays: days,
    }))
    .filter((r) => r.to >= from && r.startsOn <= to)
}

/** The run that starts with `firstHolyDate` (a key's date), or null if that is not the first day of a run. */
export function runStartingOn(firstHolyDate: DateString, loc: HouseholdLocation): HostedRun | null {
  return hostedRuns(firstHolyDate, firstHolyDate, loc).find((r) => r.from === firstHolyDate) ?? null
}

/**
 * Which holy day a meal belongs to, or null for an ordinary (weekday) meal. A holy day starts the evening before:
 * a dinner or oneg on the eve belongs to the next day; a daytime meal on a holy day belongs to that day. `holyDates`
 * is the set of holy-day dates around the meal (from `hostedRuns`).
 */
export function holyDateOfMeal(
  meal: { date: DateString; slot: DaySlot },
  holyDates: ReadonlySet<DateString>,
): DateString | null {
  if (isNightSlot(meal.slot)) {
    const next = addDays(meal.date, 1)
    return holyDates.has(next) ? next : null
  }
  return holyDates.has(meal.date) ? meal.date : null
}

/** All holy-day dates of some runs. */
export function holyDatesOf(runs: HostedRun[]): Set<DateString> {
  return new Set(runs.flatMap((r) => r.holyDays.map((d) => d.date)))
}

export interface EveLink {
  runKey: string
  holyDate: DateString
  /** `Seder I`, `Leil Yom Tov`, `Leil Shabbat`: the "Plan Seder I →" label. */
  mealName: string
  holyDayLabel: string
}

/**
 * For an eve (the day before a holy day, whether or not it is itself a holy day) the link to its evening meal. The
 * eve's own dinner slot is replaced by this link because that meal belongs to the run.
 */
export function eveLinkOn(date: DateString, runs: HostedRun[]): EveLink | null {
  for (const r of runs)
    for (const d of r.holyDays)
      if (d.eveDate === date) {
        const night = d.defaultMeals.find((m) => m.part === 'night')!
        return { runKey: r.key, holyDate: d.date, mealName: night.name, holyDayLabel: d.label }
      }
  return null
}
