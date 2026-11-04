import { calendarDay, calendarDays, type CalendarDay } from './calendar'
import { abs, addDays, clock12, fromAbs, weekdayName } from './time'
import type { DateString, HouseholdLocation, Minutes, ServingStyle } from './types'

// ---------------------------------------------------------------------------
// Input

export type MealSlot = 'breakfast' | 'lunch' | 'seudah_shlishit' | 'dinner'

export interface PrePrepStep {
  /** "Marinate chicken" */
  label: string
  /** How long before cooking starts the step must begin (12h marinade: 720). */
  leadMinutes: number
  /** Hands-on time to start the step. Default 10. */
  activeMinutes?: number
}

export interface PrepItem {
  dishId: string
  title: string
  /** Hands-on cooking time. */
  activeMinutes: number
  /** Start to ready, including unattended time (baking). At least `activeMinutes`. */
  totalMinutes: number
  prePrep?: PrePrepStep[]
  servingStyle: ServingStyle
  /** Stays hot and good on a blech or hot plate, so it can be made ahead for Yom Tov. */
  holdsOnBlech?: boolean
  /** Cholent style: put on before Shabbat and cooks through it. */
  cooksThroughShabbat?: boolean
  /** Brought by a guest: nothing to schedule. */
  brought?: boolean
}

export interface PrepMeal {
  id: string
  date: DateString
  /** Minutes since midnight. Defaults come from zmanim (`defaultMealTime`). */
  time?: Minutes
  slot?: MealSlot
  label?: string
  items: PrepItem[]
}

export interface PrepOptions {
  /** Hands-on work only happens in these hours. Default 07:00 to 22:30. */
  wakeFrom?: Minutes
  wakeTo?: Minutes
  /** Minutes a hot dish is ready before it is served. Default 15. */
  hotBuffer?: Minutes
  roomTemperatureBuffer?: Minutes
  coldBuffer?: Minutes
  /** Minutes before candle lighting that work must be finished. Default 20. */
  beforeRestBuffer?: Minutes
}

export interface PrepInput {
  location: HouseholdLocation
  /** Accepted meals. */
  meals: PrepMeal[]
  options?: PrepOptions
}

// ---------------------------------------------------------------------------
// Output

export interface PrepTask {
  mealId: string
  date: DateString
  /** Minutes since midnight on `date`. */
  start: Minutes
  end?: Minutes
  /** When the task ends on a later day (a long marinade). */
  endDate?: DateString
  label: string
  /** Dish title (empty for tasks about the whole meal). */
  dish: string
  dishId?: string
  kind: 'active' | 'passive' | 'setup'
  notes: string[]
}

export interface PrepFlag {
  code: 'eruv_tavshilin' | 'cooking_for_after_rest' | 'hot_not_blech_safe' | 'cannot_schedule'
  date: DateString
  mealId?: string
  dishId?: string
  text: string
}

export interface PrepDay {
  date: DateString
  weekday: string
  hebrew: string
  holidays: string[]
  /** "Shabbat", "Yom Tov (day 1)", "Candle lighting 4:21 PM" and so on. */
  notes: string[]
  meals: { mealId: string; label: string; time: Minutes }[]
  tasks: PrepTask[]
  flags: PrepFlag[]
}

export interface PrepSchedule {
  /** Days with something to do, a meal or a flag, in date order. */
  days: PrepDay[]
  /** Every task in time order. */
  tasks: PrepTask[]
  flags: PrepFlag[]
  meals: { mealId: string; date: DateString; time: Minutes }[]
}

// ---------------------------------------------------------------------------
// Meal times

/** Defaults from zmanim: Friday night after shul, the seder after nightfall, Motzei Shabbat after havdalah. */
export function defaultMealTime(date: DateString, slot: MealSlot, loc: HouseholdLocation): Minutes {
  const day = calendarDay(date, loc)
  const rest = day.noMelacha
  switch (slot) {
    case 'breakfast':
      return rest ? 9 * 60 + 30 : 8 * 60
    case 'lunch':
      return rest ? 13 * 60 : 12 * 60 + 30
    case 'seudah_shlishit':
      return (day.sunset ?? 17 * 60) - 80
    case 'dinner': {
      if (day.candleLighting !== undefined) {
        if (day.candleLightingKind === 'after_nightfall') return day.candleLighting + 60
        const afterShul = day.candleLighting + 90
        // The seder starts after nightfall.
        return day.jewishHolidays.includes('Erev Pesach')
          ? Math.max(afterShul, (day.nightfall ?? 0) + 30)
          : afterShul
      }
      if (day.havdalah !== undefined) return Math.max(18 * 60 + 30, day.havdalah + 30)
      return 18 * 60 + 30
    }
  }
}

// ---------------------------------------------------------------------------
// The timeline of rest

interface Run {
  start: number
  end: number
  erevDate: DateString
  segments: Segment[]
  eruvTavshilin: boolean
}

interface Segment {
  kind: 'shabbat' | 'yomtov'
  start: number
  end: number
  run: Run
  index: number
  date: DateString
  yomTovDay?: number
}

function buildRuns(days: CalendarDay[]): Run[] {
  const runs: Run[] = []
  let i = 1
  while (i < days.length - 1) {
    if (!days[i].noMelacha || days[i - 1].noMelacha) {
      i++
      continue
    }
    let j = i
    while (j + 1 < days.length - 1 && days[j + 1].noMelacha) j++
    const erev = days[i - 1]
    const last = days[j]
    const run: Run = {
      start: abs(erev.date, erev.candleLighting ?? (erev.sunset ?? 1080) - 18),
      end: abs(last.date, last.havdalah ?? last.nightfall ?? 1260),
      erevDate: erev.date,
      segments: [],
      eruvTavshilin: false,
    }
    for (let k = i; k <= j; k++) {
      const d = days[k]
      const start = k === i ? run.start : abs(days[k - 1].date, days[k - 1].candleLighting ?? 0)
      const end = k === j ? run.end : abs(d.date, d.candleLighting ?? 0)
      run.segments.push({
        kind: d.isShabbat ? 'shabbat' : 'yomtov',
        start,
        end,
        run,
        index: k - i,
        date: d.date,
        yomTovDay: d.yomTovDay,
      })
    }
    run.eruvTavshilin = run.segments.some(
      (s, k) => s.kind === 'yomtov' && run.segments[k + 1]?.kind === 'shabbat',
    )
    runs.push(run)
    i = j + 1
  }
  return runs
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

// ---------------------------------------------------------------------------
// The schedule

const STYLE_LABEL: Record<ServingStyle, string> = {
  hot: 'hot',
  room_temperature: 'room temperature',
  cold: 'cold',
}

function leadText(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return `${minutes / 1440}d`
  if (minutes >= 120 && minutes % 60 === 0) return `${minutes / 60}h`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(' 0m', '')
  return `${minutes}m`
}

export function buildPrepSchedule(input: PrepInput): PrepSchedule {
  const loc = input.location
  const o = {
    wakeFrom: 7 * 60,
    wakeTo: 22 * 60 + 30,
    hotBuffer: 15,
    roomTemperatureBuffer: 45,
    coldBuffer: 120,
    beforeRestBuffer: 20,
    ...input.options,
  }
  if (!input.meals.length) return { days: [], tasks: [], flags: [], meals: [] }

  const dates = input.meals.map((m) => m.date).sort()
  const first = addDays(dates[0], -21)
  const last = addDays(dates[dates.length - 1], 3)
  const calDays = calendarDays(addDays(first, -1), addDays(last, 1), loc)
  const byDate = new Map(calDays.map((d) => [d.date, d]))
  const runs = buildRuns(calDays)
  const segments = runs.flatMap((r) => r.segments)
  const segmentAt = (t: number) => segments.find((s) => s.start <= t && t < s.end) ?? null

  const tasks: PrepTask[] = []
  const flags: PrepFlag[] = []
  const resolvedMeals: PrepSchedule['meals'] = []

  const pushTask = (t: {
    mealId: string
    start: number
    end?: number
    label: string
    dish?: string
    dishId?: string
    kind: PrepTask['kind']
    notes?: string[]
  }) => {
    const s = fromAbs(t.start)
    const e = t.end === undefined ? undefined : fromAbs(t.end)
    tasks.push({
      mealId: t.mealId,
      date: s.date,
      start: s.minutes,
      ...(e && { end: e.minutes }),
      ...(e && e.date !== s.date && { endDate: e.date }),
      label: t.label,
      dish: t.dish ?? '',
      ...(t.dishId && { dishId: t.dishId }),
      kind: t.kind,
      notes: t.notes ?? [],
    })
  }

  /** Latest start at or before `latest` for hands-on work of `dur` minutes in waking hours outside `blocked`. */
  const placeBefore = (latest: number, dur: number, blocked: Segment[]): number | null => {
    let s = latest
    for (let i = 0; i < 400; i++) {
      const { date, minutes } = fromAbs(s)
      if (minutes < o.wakeFrom) {
        s = abs(addDays(date, -1), o.wakeTo) - dur
        continue
      }
      if (minutes + dur > o.wakeTo) {
        s = abs(date, o.wakeTo) - dur
        continue
      }
      const hit = blocked
        .filter((b) => overlaps(s, s + dur, b.start - o.beforeRestBuffer, b.end))
        .sort((a, b) => b.start - a.start)[0]
      if (!hit) return s
      s = hit.start - o.beforeRestBuffer - dur
    }
    return null
  }

  for (const meal of input.meals) {
    const time = meal.time ?? defaultMealTime(meal.date, meal.slot ?? 'dinner', loc)
    const mealAbs = abs(meal.date, time)
    const mealLabel = meal.label ?? meal.slot?.replace(/_/g, ' ') ?? 'meal'
    resolvedMeals.push({ mealId: meal.id, date: meal.date, time })
    const own = segmentAt(mealAbs)

    // Which rest segments may have work done in them for this meal.
    const allowedFor = (item: PrepItem): Segment[] => {
      if (!own) return []
      if (own.kind === 'yomtov') {
        const fresh = item.servingStyle === 'hot' && !item.holdsOnBlech
        // The first night of Yom Tov is served before anything could be cooked on it.
        const firstNight = own.index === 0 && meal.date === own.run.erevDate
        return fresh && !firstNight ? [own] : []
      }
      // Shabbat: after Yom Tov, with an eruv tavshilin, cook on the Yom Tov day before.
      const before = own.run.segments[own.index - 1]
      return before?.kind === 'yomtov' && own.run.eruvTavshilin ? [before] : []
    }

    for (const item of meal.items) {
      if (item.brought) continue
      const allowed = allowedFor(item)
      const blocked = segments.filter((s) => !allowed.includes(s))
      const total = Math.max(item.totalMinutes, item.activeMinutes)
      const active = item.activeMinutes
      const buffer =
        item.servingStyle === 'hot'
          ? o.hotBuffer
          : item.servingStyle === 'cold'
            ? o.coldBuffer
            : o.roomTemperatureBuffer
      const wanted = mealAbs - buffer
      const notes: string[] = []

      // Where it would go if nothing were forbidden, to say what had to move.
      const natural = segments.filter(
        (s) => s !== own && overlaps(wanted - total, wanted, s.start, s.end),
      )

      let finishBy = wanted
      let start: number | null = null
      for (let i = 0; i < 60; i++) {
        const s = placeBefore(finishBy - total, active, blocked)
        if (s === null) break
        const tailConflict = item.cooksThroughShabbat
          ? []
          : blocked.filter((b) => overlaps(s + active, s + total, b.start, b.end))
        if (tailConflict.length) {
          finishBy = Math.max(...tailConflict.map((b) => b.start)) - o.beforeRestBuffer
          continue
        }
        start = s
        break
      }
      if (start === null) {
        flags.push({
          code: 'cannot_schedule',
          date: meal.date,
          mealId: meal.id,
          dishId: item.dishId,
          text: `Could not find a time to make ${item.title} for the ${mealLabel}`,
        })
        continue
      }
      if (own && start < own.run.start) {
        const runKind = own.run.segments[0].kind === 'shabbat' ? 'Shabbat' : 'Yom Tov'
        notes.push(
          `Made before ${runKind} begins (candle lighting ${clock12(fromAbs(own.run.start).minutes)})`,
        )
      }
      if (!own && natural.length) {
        const run = natural[0].run
        const kinds = new Set(run.segments.map((x) => x.kind))
        const what =
          kinds.size === 2 ? 'Yom Tov and Shabbat' : kinds.has('shabbat') ? 'Shabbat' : 'Yom Tov'
        flags.push({
          code: 'cooking_for_after_rest',
          date: fromAbs(start).date,
          mealId: meal.id,
          dishId: item.dishId,
          text: `Can't cook on ${what} for after ${what}: ${item.title} is made before ${what} begins (or serve it later and cook it after nightfall)`,
        })
        notes.push(`Not cooked on ${what}`)
      }
      const at = segmentAt(start)
      if (at?.kind === 'yomtov') {
        if (own?.kind === 'shabbat') notes.push('On Yom Tov under the eruv tavshilin')
        else if (at.yomTovDay === 2 && own === at)
          notes.push('After nightfall, so cooking for the second day of Yom Tov is allowed')
        else notes.push('Cooked on Yom Tov for this meal')
      }

      if (item.servingStyle === 'hot' && own && !item.holdsOnBlech && !allowed.length) {
        flags.push({
          code: 'hot_not_blech_safe',
          date: meal.date,
          mealId: meal.id,
          dishId: item.dishId,
          text: `${item.title} is served hot but is made before ${own.kind === 'shabbat' ? 'Shabbat' : 'Yom Tov'} and does not hold well on a blech; plan to rewarm it`,
        })
      }
      if (item.servingStyle === 'hot' && own && item.holdsOnBlech)
        notes.push('Keep warm on the blech')
      if (item.servingStyle === 'cold') notes.push('Chill until serving')
      if (item.cooksThroughShabbat)
        notes.push('Cooks through Shabbat; put it on before candle lighting')

      // The cooking itself.
      if (total > 0) {
        pushTask({
          mealId: meal.id,
          start,
          end: start + active,
          label: `${item.servingStyle === 'hot' ? 'Cook' : 'Make'} ${item.title}`,
          dish: item.title,
          dishId: item.dishId,
          kind: 'active',
          notes: [
            `Served ${STYLE_LABEL[item.servingStyle]} at the ${mealLabel} (${clock12(time)})`,
            ...notes,
          ],
        })
        if (total > active) {
          pushTask({
            mealId: meal.id,
            start: start + active,
            end: start + total,
            label: `${item.title} cooking`,
            dish: item.title,
            dishId: item.dishId,
            kind: 'passive',
            notes: ['Unattended'],
          })
        }
      }

      // Pre-prep steps, each starting its lead time before cooking.
      for (const step of item.prePrep ?? []) {
        const a = step.activeMinutes ?? 10
        const s = placeBefore(start - step.leadMinutes, a, blocked)
        if (s === null) {
          flags.push({
            code: 'cannot_schedule',
            date: meal.date,
            mealId: meal.id,
            dishId: item.dishId,
            text: `Could not find a time for "${step.label}" for ${item.title}`,
          })
          continue
        }
        const spans = segments.filter(
          (seg) => seg.start > s + a && overlaps(s + a, start, seg.start, seg.end),
        )
        pushTask({
          mealId: meal.id,
          start: s,
          end: s + a,
          label: `${step.label} (${leadText(step.leadMinutes)})`,
          dish: item.title,
          dishId: item.dishId,
          kind: 'active',
          notes: [`For ${item.title}, ${mealLabel} on ${weekdayName(meal.date)}`],
        })
        if (start > s + a) {
          pushTask({
            mealId: meal.id,
            start: s + a,
            end: start,
            label: step.label,
            dish: item.title,
            dishId: item.dishId,
            kind: 'passive',
            notes: spans.length
              ? [
                  `Passive: continues through ${spans.some((x) => x.kind === 'shabbat') ? 'Shabbat' : 'Yom Tov'}, started beforehand`,
                ]
              : ['Passive'],
          })
        }
      }
    }
  }

  // Eruv tavshilin: every Yom Tov that runs into Shabbat, when there is a meal in or around it.
  for (const run of runs) {
    if (!run.eruvTavshilin) continue
    const lastDate = run.segments[run.segments.length - 1].date
    if (!input.meals.some((m) => m.date >= run.erevDate && m.date <= lastDate)) continue
    const erev = byDate.get(run.erevDate)!
    flags.push({
      code: 'eruv_tavshilin',
      date: run.erevDate,
      text: `Make an eruv tavshilin on ${weekdayName(run.erevDate)} before Yom Tov (it allows cooking on Yom Tov for Shabbat)`,
    })
    pushTask({
      mealId: '',
      start: abs(run.erevDate, (erev.candleLighting ?? 1000) - 60),
      end: abs(run.erevDate, (erev.candleLighting ?? 1000) - 45),
      label: 'Make the eruv tavshilin',
      kind: 'setup',
      notes: [
        'Set aside bread or matzah and a cooked food; say the blessing and the declaration before candle lighting',
      ],
    })
  }

  // Set up the blech or hot plate before each run that has a hot dish ready beforehand.
  for (const run of runs) {
    const lastDate = run.segments[run.segments.length - 1].date
    const hotMeals = input.meals.filter(
      (m) =>
        m.date >= run.erevDate &&
        m.date <= lastDate &&
        segmentAt(abs(m.date, m.time ?? defaultMealTime(m.date, m.slot ?? 'dinner', loc)))?.run ===
          run &&
        m.items.some((i) => !i.brought && i.servingStyle === 'hot'),
    )
    if (!hotMeals.length) continue
    const erev = byDate.get(run.erevDate)!
    pushTask({
      mealId: hotMeals[0].id,
      start: abs(run.erevDate, (erev.candleLighting ?? 1000) - 40),
      end: abs(run.erevDate, (erev.candleLighting ?? 1000) - 30),
      label: 'Set up the blech and hot plate; put hot dishes on',
      kind: 'setup',
      notes: ['Before candle lighting'],
    })
  }

  tasks.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.label.localeCompare(b.label),
  )
  flags.sort((a, b) => a.date.localeCompare(b.date))

  // Group by day.
  const dayKeys = new Set<DateString>([
    ...tasks.map((t) => t.date),
    ...flags.map((f) => f.date),
    ...resolvedMeals.map((m) => m.date),
  ])
  const days: PrepDay[] = [...dayKeys].sort().map((date) => {
    const cal = byDate.get(date) ?? calendarDay(date, loc)
    const notes: string[] = []
    if (cal.isShabbat) notes.push('Shabbat: no cooking')
    if (cal.isYomTov)
      notes.push(
        `Yom Tov${cal.yomTovDay ? ` (day ${cal.yomTovDay})` : ''}: cooking only for today's meals`,
      )
    if (cal.isCholHamoed && !cal.isShabbat) notes.push('Chol Hamoed')
    if (cal.candleLighting !== undefined)
      notes.push(
        cal.candleLightingKind === 'after_nightfall'
          ? `Candle lighting after nightfall, ${clock12(cal.candleLighting)}`
          : `Candle lighting ${clock12(cal.candleLighting)}`,
      )
    if (cal.havdalah !== undefined) notes.push(`Ends ${clock12(cal.havdalah)}`)
    return {
      date,
      weekday: weekdayName(date),
      hebrew: cal.hebrew.text,
      holidays: [...cal.jewishHolidays, ...cal.civilHolidays],
      notes,
      meals: input.meals
        .filter((m) => m.date === date)
        .map((m) => ({
          mealId: m.id,
          label: m.label ?? m.slot?.replace(/_/g, ' ') ?? 'meal',
          time: resolvedMeals.find((r) => r.mealId === m.id)!.time,
        })),
      tasks: tasks.filter((t) => t.date === date),
      flags: flags.filter((f) => f.date === date),
    }
  })

  return { days, tasks, flags, meals: resolvedMeals }
}
