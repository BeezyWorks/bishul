import {
  Calendar,
  gregorianToHebrew,
  hebrewToGregorian,
  specialZmanim,
  startOfWeek,
  weekdayOf,
  type ShulSettings,
} from '@beitecha/engine'

import { abs, addDays, daysBetween } from './time'
import {
  PERIOD_NAMES,
  type ActiveWhen,
  type DateString,
  type HouseholdLocation,
  type Minutes,
  type PeriodName,
} from './types'

// Hebcal month numbers.
const NISAN = 1
const AV = 5
const TISHREI = 7

// ---------------------------------------------------------------------------
// Engine plumbing

function candleMinutes(loc: HouseholdLocation): number {
  if (loc.candleLightingMinutes !== undefined) return loc.candleLightingMinutes
  if (!loc.israel) return 18
  const jerusalem = Math.abs(loc.lat - 31.78) < 0.12 && Math.abs(loc.lng - 35.22) < 0.12
  return jerusalem ? 40 : 20
}

function settingsOf(loc: HouseholdLocation): ShulSettings {
  return {
    location: {
      latitude: loc.lat,
      longitude: loc.lng,
      timeZone: loc.timeZone,
      israel: loc.israel,
      ...(loc.elevation !== undefined && { elevation: loc.elevation }),
    },
    zmanim: { candleLightingMinutes: candleMinutes(loc) },
    ...(loc.civilCalendar && { civilHolidays: loc.civilCalendar }),
  }
}

const engines = new Map<string, Calendar>()

/** The engine calendar for a household location, cached (the engine memoizes per instance). */
export function engineCalendar(loc: HouseholdLocation): Calendar {
  const key = JSON.stringify([
    loc.lat,
    loc.lng,
    loc.timeZone,
    loc.israel,
    loc.elevation,
    candleMinutes(loc),
    loc.civilCalendar,
  ])
  let cal = engines.get(key)
  if (!cal) {
    cal = new Calendar({ settings: settingsOf(loc), events: [], exceptions: [], notices: [] })
    engines.set(key, cal)
  }
  return cal
}

// ---------------------------------------------------------------------------
// Days

export interface CalendarDay {
  date: DateString
  /** 0 = Sunday. */
  weekday: number
  hebrew: { day: number; month: string; year: number; text: string }
  /** The parsha of the Shabbat of this Sunday-to-Shabbat week (none on a Shabbat that is Yom Tov or Chol Hamoed). */
  parasha?: string
  jewishHolidays: string[]
  /** Civil holidays of the household's country (Thanksgiving, ...). */
  civilHolidays: string[]
  isShabbat: boolean
  isYomTov: boolean
  /** 1 or 2: which day of a (multi-day) Yom Tov this is. Israel has one day. */
  yomTovDay?: number
  isYomKippur: boolean
  isCholHamoed: boolean
  isErevShabbat: boolean
  isErevYomTov: boolean
  /** Shabbat or Yom Tov: no melacha. */
  noMelacha: boolean
  /** Erev Yom Tov of a Yom Tov that runs into Shabbat: set the eruv tavshilin today. */
  eruvTavshilin: boolean
  sunrise?: Minutes
  sunset?: Minutes
  /** Nightfall (tzeis). */
  nightfall?: Minutes
  /** Candle lighting that starts the next day's rest, when tomorrow is Shabbat or Yom Tov. */
  candleLighting?: Minutes
  /** Before sunset, or (second night of Yom Tov, Yom Tov after Shabbat) only after nightfall. */
  candleLightingKind?: 'before_sunset' | 'after_nightfall'
  /** End of Shabbat or Yom Tov, when today is the last rest day of a run. */
  havdalah?: Minutes
  chatzos?: Minutes
  periods: PeriodName[]
}

interface Raw {
  date: DateString
  weekday: number
  yomTov: boolean
  shabbat: boolean
  yomKippur: boolean
  yomTovDay?: number
}

/** Calendar days `from` through `to` inclusive for a household. */
export function calendarDays(
  from: DateString,
  to: DateString,
  loc: HouseholdLocation,
): CalendarDay[] {
  const cal = engineCalendar(loc)
  const count = daysBetween(from, to) + 1
  if (count < 1) return []

  // Look two days back (to number Yom Tov days) and four ahead (to find where a Yom Tov run ends).
  const raws = new Map<DateString, Raw>()
  const raw = (date: DateString): Raw => {
    let r = raws.get(date)
    if (!r) {
      const info = cal.info(date)
      r = {
        date,
        weekday: weekdayOf(date),
        yomTov: info.tags.has('yomTov'),
        shabbat: info.tags.has('shabbos'),
        yomKippur: info.holidays.some((e) => e.getDesc() === 'Yom Kippur'),
      }
      raws.set(date, r)
    }
    return r
  }
  const yomTovDayOf = (date: DateString): number | undefined => {
    if (!raw(date).yomTov) return undefined
    return raw(addDays(date, -1)).yomTov ? (yomTovDayOf(addDays(date, -1)) ?? 0) + 1 : 1
  }

  return Array.from({ length: count }, (_, i): CalendarDay => {
    const date = addDays(from, i)
    const r = raw(date)
    const day = cal.day(date)
    const info = cal.info(date)
    const z = cal.zmanimOn(date)
    const next = raw(addDays(date, 1))
    const rest = r.yomTov || r.shabbat
    const nextRest = next.yomTov || next.shabbat

    // Eruv tavshilin: erev of a Yom Tov run whose last day is Friday (never Yom Kippur).
    let eruvTavshilin = false
    if (!r.yomTov && next.yomTov) {
      let last = next
      while (raw(addDays(last.date, 1)).yomTov) last = raw(addDays(last.date, 1))
      eruvTavshilin = last.weekday === 5 && !last.yomKippur
    }

    let candleLighting: Minutes | undefined
    let candleLightingKind: CalendarDay['candleLightingKind']
    if (nextRest && !(r.shabbat && next.shabbat)) {
      const afterNightfall = r.shabbat || (r.yomTov && next.yomTov)
      candleLightingKind = afterNightfall ? 'after_nightfall' : 'before_sunset'
      candleLighting = afterNightfall ? z.tzeis : z.candleLighting
    }

    const jewish = day.holidays.length - info.localHolidays.length
    return {
      date,
      weekday: r.weekday,
      hebrew: {
        day: day.hebrew.day,
        month: day.hebrew.month,
        year: day.hebrew.year,
        text: day.hebrew.en,
      },
      ...(day.parsha && { parasha: day.parsha.en }),
      jewishHolidays: day.holidays.slice(0, jewish).map((h) => h.en),
      civilHolidays: info.localHolidays.map((h) => h.name.en),
      isShabbat: r.shabbat,
      isYomTov: r.yomTov,
      ...(r.yomTov && { yomTovDay: yomTovDayOf(date) }),
      isYomKippur: r.yomKippur,
      isCholHamoed: info.tags.has('cholHamoed'),
      isErevShabbat: info.tags.has('erevShabbos'),
      isErevYomTov: info.tags.has('erevYomTov'),
      noMelacha: rest,
      eruvTavshilin,
      sunrise: z.sunrise,
      sunset: z.sunset,
      nightfall: z.tzeis,
      ...(candleLighting !== undefined && { candleLighting, candleLightingKind }),
      ...(rest && !nextRest && { havdalah: z.havdalah }),
      chatzos: z.chatzos,
      periods: periodsOnDay(date, loc),
    }
  })
}

export function calendarDay(date: DateString, loc: HouseholdLocation): CalendarDay {
  return calendarDays(date, date, loc)[0]
}

// ---------------------------------------------------------------------------
// Chametz cutoff

export interface ChametzCutoff {
  /** Erev Pesach. */
  erevPesach: DateString
  /** The date the cutoff falls on (Friday when Erev Pesach is Shabbat). */
  date: DateString
  /** The default cutoff, as configured by `opinion`: last time to burn (sof zman biur chametz). */
  minutes: Minutes
  opinion: 'mga' | 'gra'
  /** Last time to eat chametz, same opinion. */
  eatMinutes: Minutes
  burnMga: Minutes
  burnGra: Minutes
}

/**
 * The pre-Pesach chametz cutoff for the Pesach that falls in Gregorian `year`: sof zman biur chametz (the fifth
 * halachic hour) by the Magen Avraham by default, which is the earlier and safer one. When Erev Pesach is Shabbat,
 * chametz is burned on Friday and eaten that Shabbat morning.
 */
export function chametzCutoff(
  year: number,
  loc: HouseholdLocation,
  opinion: 'mga' | 'gra' = 'mga',
): ChametzCutoff {
  const erevPesach = hebrewToGregorian({ day: 14, month: NISAN, year: year + 3760 })
  const groups = specialZmanim(startOfWeek(erevPesach), settingsOf(loc), [], 7)
  const rows = groups.find((g) => g.key === 'pesach')?.rows ?? []
  const row = (id: string) => rows.find((r) => r.id === id)
  const burnMga = row('burnMga')
  const burnGra = row('burnGra')
  if (!burnMga || !burnGra) throw new Error(`No chametz zmanim for Erev Pesach ${erevPesach}`)
  const pick = opinion === 'mga' ? burnMga : burnGra
  return {
    erevPesach,
    date: pick.date,
    minutes: pick.minutes,
    opinion,
    eatMinutes: (opinion === 'mga' ? row('eatMga') : row('eatGra'))?.minutes ?? pick.minutes,
    burnMga: burnMga.minutes,
    burnGra: burnGra.minutes,
  }
}

// ---------------------------------------------------------------------------
// Named periods

interface Span {
  from: number
  to: number
}

/**
 * The absolute-minute span of a period in Hebrew year `year`.
 * - Pesach: from the last time to eat chametz on Erev Pesach through nightfall ending Yom Tov (21 Nisan Israel,
 *   22 diaspora). A seder meal is therefore inside it.
 * - Aseret Yemei Teshuva: sunset beginning Rosh Hashana through nightfall ending Yom Kippur.
 * - The Nine Days: sunset beginning Rosh Chodesh Av through midday on 10 Av (when Tish'a B'Av is pushed off Shabbat,
 *   through the end of its fast).
 */
function periodSpan(period: PeriodName, year: number, loc: HouseholdLocation): Span {
  const cal = engineCalendar(loc)
  const civil = (day: number, month: number) => hebrewToGregorian({ day, month, year })
  const at = (date: DateString, minutes: Minutes | undefined, fallback: Minutes) =>
    abs(date, minutes ?? fallback)
  switch (period) {
    case 'pesach': {
      const erev = civil(14, NISAN)
      const last = civil(loc.israel ? 21 : 22, NISAN)
      const groups = specialZmanim(startOfWeek(erev), settingsOf(loc), [], 7)
      const eat = groups.find((g) => g.key === 'pesach')?.rows.find((r) => r.id === 'eatMga')
      return { from: at(erev, eat?.minutes, 600), to: at(last, cal.zmanimOn(last).tzeis, 1260) }
    }
    case 'aseret_yemei_teshuva': {
      const eve = addDays(civil(1, TISHREI), -1)
      const yk = civil(10, TISHREI)
      return {
        from: at(eve, cal.zmanimOn(eve).sunset, 1080),
        to: at(yk, cal.zmanimOn(yk).tzeis, 1260),
      }
    }
    case 'nine_days': {
      const eve = addDays(civil(1, AV), -1)
      const tishaBav = civil(9, AV)
      const tenth = addDays(tishaBav, 1)
      const end =
        weekdayOf(tishaBav) === 6
          ? at(tenth, cal.zmanimOn(tenth).tzeis, 1260)
          : at(tenth, cal.zmanimOn(tenth).chatzos, 720)
      return { from: at(eve, cal.zmanimOn(eve).sunset, 1080), to: end }
    }
  }
}

const spanCache = new Map<string, Span>()

function spanOf(period: PeriodName, year: number, loc: HouseholdLocation): Span {
  const key = JSON.stringify([
    period,
    year,
    loc.lat,
    loc.lng,
    loc.timeZone,
    loc.israel,
    loc.candleLightingMinutes,
  ])
  let s = spanCache.get(key)
  if (!s) {
    s = periodSpan(period, year, loc)
    spanCache.set(key, s)
  }
  return s
}

/** Whether `period` is in force at any moment of `date`, or at `at` (minutes since midnight) when given. */
export function isPeriodActive(
  period: PeriodName,
  date: DateString,
  loc: HouseholdLocation,
  at?: Minutes,
): boolean {
  const y = gregorianToHebrew(date).year
  const lo = at === undefined ? abs(date, 0) : abs(date, at)
  const hi = at === undefined ? abs(date, 1440) : abs(date, at) + 1e-9
  return [y - 1, y, y + 1].some((year) => {
    const s = spanOf(period, year, loc)
    return s.from < hi && lo < s.to
  })
}

export function periodsOnDay(date: DateString, loc: HouseholdLocation, at?: Minutes): PeriodName[] {
  return PERIOD_NAMES.filter((p) => isPeriodActive(p, date, loc, at))
}

/**
 * Whether a constraint's `activeWhen` is in force on `date` for the household (pass `at`, minutes since midnight, to
 * be exact about a meal's time: a seder after sunset on Erev Pesach is Pesach, a lunch before the chametz deadline is
 * not). Without `at`, a period counts if it is in force at any moment of that civil day.
 */
export function isActive(
  when: ActiveWhen,
  date: DateString,
  loc: HouseholdLocation,
  at?: Minutes,
): boolean {
  if ('always' in when) return true
  if ('period' in when) return isPeriodActive(when.period, date, loc, at)
  return date >= when.range.from && date <= when.range.to
}
