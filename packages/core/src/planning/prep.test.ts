import { describe, expect, it } from 'vitest'

import { calendarDay } from './calendar'
import { JERUSALEM, NEW_YORK } from './fixtures'
import { buildPrepSchedule, defaultMealTime, type PrepItem, type PrepTask } from './prep'
import { abs } from './time'

const chicken: PrepItem = {
  dishId: 'chicken',
  title: 'Chicken',
  activeMinutes: 20,
  totalMinutes: 120,
  servingStyle: 'hot',
  holdsOnBlech: true,
  prePrep: [{ label: 'Marinate chicken', leadMinutes: 720 }],
}
const kugel: PrepItem = {
  dishId: 'kugel',
  title: 'Kugel',
  activeMinutes: 30,
  totalMinutes: 90,
  servingStyle: 'hot',
}
const salad: PrepItem = {
  dishId: 'salad',
  title: 'Salad',
  activeMinutes: 20,
  totalMinutes: 20,
  servingStyle: 'cold',
}
const cholent: PrepItem = {
  dishId: 'cholent',
  title: 'Cholent',
  activeMinutes: 30,
  totalMinutes: 1000,
  servingStyle: 'hot',
  holdsOnBlech: true,
  cooksThroughShabbat: true,
}

const startAbs = (t: PrepTask) => abs(t.date, t.start)
const endAbs = (t: PrepTask) =>
  t.end === undefined ? startAbs(t) : abs(t.endDate ?? t.date, t.end)
const find = (tasks: PrepTask[], label: string, mealId?: string) =>
  tasks.find((t) => t.label === label && (mealId === undefined || t.mealId === mealId))!

describe('defaultMealTime', () => {
  it('Friday night is after shul, the seder after nightfall, the second night after the first', () => {
    const fri = calendarDay('2026-11-13', NEW_YORK)
    expect(defaultMealTime('2026-11-13', 'dinner', NEW_YORK)).toBe(fri.candleLighting! + 90)
    expect(defaultMealTime('2026-11-14', 'lunch', NEW_YORK)).toBe(13 * 60)
    expect(defaultMealTime('2026-11-12', 'dinner', NEW_YORK)).toBe(18 * 60 + 30)
    const erev = calendarDay('2027-04-21', NEW_YORK)
    expect(defaultMealTime('2027-04-21', 'dinner', NEW_YORK)).toBeGreaterThanOrEqual(
      erev.nightfall! + 30,
    )
    const day1 = calendarDay('2027-04-22', NEW_YORK)
    expect(defaultMealTime('2027-04-22', 'dinner', NEW_YORK)).toBe(day1.nightfall! + 60)
    const sat = calendarDay('2026-11-14', NEW_YORK)
    expect(defaultMealTime('2026-11-14', 'dinner', NEW_YORK)).toBe(
      Math.max(18 * 60 + 30, sat.havdalah! + 30),
    )
    expect(defaultMealTime('2026-11-13', 'dinner', JERUSALEM)).toBe(1050) // 40 minutes before a 17:00 sunset, plus 90
  })
})

describe('Shabbat Toldot (New York, 13-14 Nov 2026)', () => {
  const meals = [
    {
      id: 'fri-night',
      date: '2026-11-13',
      slot: 'dinner' as const,
      items: [chicken, kugel, salad],
    },
    { id: 'sat-lunch', date: '2026-11-14', slot: 'lunch' as const, items: [cholent, salad] },
  ]
  const sched = buildPrepSchedule({ location: NEW_YORK, meals })
  const candle = abs('2026-11-13', calendarDay('2026-11-13', NEW_YORK).candleLighting!)
  const havdalah = abs('2026-11-14', calendarDay('2026-11-14', NEW_YORK).havdalah!)

  it('uses zmanim for the meal times', () => {
    expect(sched.meals).toEqual([
      { mealId: 'fri-night', date: '2026-11-13', time: 1071 },
      { mealId: 'sat-lunch', date: '2026-11-14', time: 780 },
    ])
  })

  it('does no active work from candle lighting to nightfall, and everything is ready before candles', () => {
    for (const t of sched.tasks) {
      if (t.kind === 'passive') continue
      expect(endAbs(t), `${t.label} ends before candle lighting`).toBeLessThanOrEqual(
        candle - 20 + 20,
      )
      expect(startAbs(t) >= candle && startAbs(t) < havdalah, t.label).toBe(false)
    }
    const dinnerCooking = sched.tasks.filter(
      (t) => t.mealId === 'fri-night' && t.kind === 'passive' && !t.label.startsWith('Marinate'),
    )
    for (const t of dinnerCooking) expect(endAbs(t)).toBeLessThanOrEqual(candle - 20)
    expect(sched.days.find((d) => d.date === '2026-11-14')!.tasks).toEqual([])
  })

  it('works backwards: marinade the night before, cooking in the afternoon', () => {
    const marinate = find(sched.tasks, 'Marinate chicken (12h)', 'fri-night')
    expect(marinate.date).toBe('2026-11-12')
    expect(marinate.kind).toBe('active')
    const wait = sched.tasks.find((t) => t.label === 'Marinate chicken')!
    expect(wait).toMatchObject({ kind: 'passive', date: '2026-11-12', endDate: '2026-11-13' })
    const cook = find(sched.tasks, 'Cook Chicken')
    expect(cook.date).toBe('2026-11-13')
    // Marinade has run at least its 12 hours by the time cooking starts.
    expect(startAbs(cook) - startAbs(marinate)).toBeGreaterThanOrEqual(720)
    // Ready (start + total) by candle lighting minus the buffer.
    expect(startAbs(cook) + 120).toBeLessThanOrEqual(candle - 20)
    expect(cook.notes).toContain('Keep warm on the blech')
  })

  it('puts cholent on before Shabbat and lets it cook through', () => {
    const put = find(sched.tasks, 'Cook Cholent')
    expect(put.date).toBe('2026-11-13')
    expect(endAbs(put)).toBeLessThanOrEqual(candle - 20)
    const through = sched.tasks.find((t) => t.label === 'Cholent cooking')!
    expect(through.kind).toBe('passive')
    expect(through.endDate).toBe('2026-11-14')
  })

  it('adds the blech setup before candle lighting and no eruv tavshilin', () => {
    const setup = sched.tasks.find((t) => t.kind === 'setup')!
    expect(setup.label).toMatch(/blech/)
    expect(endAbs(setup)).toBeLessThanOrEqual(candle)
    expect(sched.flags.some((f) => f.code === 'eruv_tavshilin')).toBe(false)
  })

  it('flags a hot dish that does not hold on a blech', () => {
    expect(sched.flags.filter((f) => f.code === 'hot_not_blech_safe').map((f) => f.dishId)).toEqual(
      ['kugel'],
    )
  })

  it('days carry the Shabbat facts', () => {
    const fri = sched.days.find((d) => d.date === '2026-11-13')!
    expect(fri.weekday).toBe('Friday')
    expect(fri.notes).toContain('Candle lighting 4:21 PM')
    const sat = sched.days.find((d) => d.date === '2026-11-14')!
    expect(sat.notes[0]).toBe('Shabbat: no cooking')
    expect(sat.meals).toEqual([{ mealId: 'sat-lunch', label: 'lunch', time: 780 }])
  })

  it('Jerusalem uses its own candle lighting', () => {
    const il = buildPrepSchedule({ location: JERUSALEM, meals: [meals[0]] })
    const jc = abs('2026-11-13', calendarDay('2026-11-13', JERUSALEM).candleLighting!)
    for (const t of il.tasks.filter((x) => x.kind !== 'passive'))
      expect(endAbs(t)).toBeLessThanOrEqual(jc)
  })
})

describe('a regular weekday: Thanksgiving, Thursday 26 Nov 2026', () => {
  it('brines a day ahead and roasts backwards from the meal', () => {
    const turkey: PrepItem = {
      dishId: 'turkey',
      title: 'Turkey',
      activeMinutes: 30,
      totalMinutes: 240,
      servingStyle: 'hot',
      prePrep: [{ label: 'Brine the turkey', leadMinutes: 1440 }],
    }
    const s = buildPrepSchedule({
      location: NEW_YORK,
      meals: [
        {
          id: 'tg',
          date: '2026-11-26',
          time: 16 * 60,
          label: 'Thanksgiving dinner',
          items: [turkey],
        },
      ],
    })
    const cook = find(s.tasks, 'Cook Turkey')
    expect(cook).toMatchObject({ date: '2026-11-26', start: 16 * 60 - 15 - 240 })
    const brine = find(s.tasks, 'Brine the turkey (1d)')
    expect(brine).toMatchObject({ date: '2026-11-25', start: 16 * 60 - 15 - 240 })
    expect(s.flags).toEqual([])
    expect(s.days.find((d) => d.date === '2026-11-26')!.holidays).toEqual(['Thanksgiving'])
    expect(s.tasks.filter((t) => t.kind === 'setup')).toEqual([])
  })

  it('keeps hands-on work inside waking hours', () => {
    const early: PrepItem = {
      dishId: 'x',
      title: 'Roast',
      activeMinutes: 30,
      totalMinutes: 300,
      servingStyle: 'hot',
    }
    const s = buildPrepSchedule({
      location: NEW_YORK,
      meals: [{ id: 'm', date: '2026-11-26', time: 9 * 60, items: [early] }],
    })
    const cook = find(s.tasks, 'Cook Roast')
    // 9:00 meal needs a 3:45 start; moved to the evening before, within waking hours.
    expect(cook.date).toBe('2026-11-25')
    expect(cook.start).toBeLessThanOrEqual(22 * 60 + 30 - 30)
  })

  it('uses cold and room temperature buffers', () => {
    const s = buildPrepSchedule({
      location: NEW_YORK,
      meals: [
        {
          id: 'm',
          date: '2026-11-26',
          time: 17 * 60,
          items: [
            salad,
            { ...salad, dishId: 'r', title: 'Rice salad', servingStyle: 'room_temperature' },
          ],
        },
      ],
    })
    expect(find(s.tasks, 'Make Salad').start).toBe(17 * 60 - 120 - 20)
    expect(find(s.tasks, 'Make Rice salad').start).toBe(17 * 60 - 45 - 20)
  })

  it('skips brought dishes and empty plans', () => {
    expect(buildPrepSchedule({ location: NEW_YORK, meals: [] }).days).toEqual([])
    const s = buildPrepSchedule({
      location: NEW_YORK,
      meals: [{ id: 'm', date: '2026-11-26', time: 17 * 60, items: [{ ...kugel, brought: true }] }],
    })
    expect(s.tasks).toEqual([])
  })
})

describe('passive steps may span Shabbat if they start before', () => {
  it('a three-day marinade for Sunday lunch starts before candle lighting on Friday', () => {
    const brisket: PrepItem = {
      dishId: 'brisket',
      title: 'Brisket',
      activeMinutes: 30,
      totalMinutes: 240,
      servingStyle: 'hot',
      prePrep: [{ label: 'Rub and rest the brisket', leadMinutes: 40 * 60 }],
    }
    const s = buildPrepSchedule({
      location: NEW_YORK,
      meals: [{ id: 'sun', date: '2026-11-15', time: 13 * 60, items: [brisket] }],
    })
    const cook = find(s.tasks, 'Cook Brisket')
    expect(cook.date).toBe('2026-11-15')
    const rub = find(s.tasks, 'Rub and rest the brisket (40h)')
    const candle = abs('2026-11-13', calendarDay('2026-11-13', NEW_YORK).candleLighting!)
    expect(endAbs(rub)).toBeLessThanOrEqual(candle - 20)
    const wait = s.tasks.find((t) => t.label === 'Rub and rest the brisket')!
    expect(wait.notes[0]).toBe('Passive: continues through Shabbat, started beforehand')
    expect(wait.endDate).toBe('2026-11-15')
  })
})

describe('Pesach 5787 in the diaspora (Erev Pesach Wed 21 Apr 2027, Yom Tov Thu-Fri, Shabbat 24 Apr)', () => {
  const dayAt = (d: string) => calendarDay(d, NEW_YORK)
  const wedCandle = abs('2027-04-21', dayAt('2027-04-21').candleLighting!)
  const thuNight = abs('2027-04-22', dayAt('2027-04-22').nightfall!)
  const friCandle = abs('2027-04-23', dayAt('2027-04-23').candleLighting!)
  const satHavdalah = abs('2027-04-24', dayAt('2027-04-24').havdalah!)

  const sched = buildPrepSchedule({
    location: NEW_YORK,
    meals: [
      {
        id: 'seder1',
        date: '2027-04-21',
        slot: 'dinner',
        label: 'First seder',
        items: [chicken, kugel, salad],
      },
      { id: 'lunch1', date: '2027-04-22', slot: 'lunch', items: [kugel, salad] },
      {
        id: 'seder2',
        date: '2027-04-22',
        slot: 'dinner',
        label: 'Second seder',
        items: [
          { ...kugel, dishId: 'quick', title: 'Quick kugel', activeMinutes: 20, totalMinutes: 30 },
          salad,
          chicken,
        ],
      },
      {
        id: 'shabbat',
        date: '2027-04-24',
        slot: 'lunch',
        label: 'Shabbat lunch',
        items: [chicken, kugel, salad],
      },
    ],
  })
  const of = (mealId: string) => sched.tasks.filter((t) => t.mealId === mealId)

  it('flags the eruv tavshilin on Erev Pesach and schedules it before candle lighting', () => {
    const flag = sched.flags.find((f) => f.code === 'eruv_tavshilin')!
    expect(flag.date).toBe('2027-04-21')
    const setup = sched.tasks.find((t) => t.label === 'Make the eruv tavshilin')!
    expect(setup).toMatchObject({ kind: 'setup', date: '2027-04-21' })
    expect(endAbs(setup)).toBeLessThanOrEqual(wedCandle)
  })

  it('has the first seder entirely cooked before Yom Tov begins', () => {
    for (const t of of('seder1').filter((x) => x.kind !== 'passive'))
      expect(endAbs(t)).toBeLessThanOrEqual(wedCandle - 20)
    for (const t of of('seder1').filter((x) => x.kind === 'passive' && x.label.includes('cooking')))
      expect(endAbs(t)).toBeLessThanOrEqual(wedCandle - 20)
  })

  it('cooks a fresh hot dish on Yom Tov day 1 for the day-1 lunch', () => {
    const k = find(of('lunch1'), 'Cook Kugel')
    expect(k.date).toBe('2027-04-22')
    expect(k.notes).toContain('Cooked on Yom Tov for this meal')
    // The make-ahead salad is not.
    expect(find(of('lunch1'), 'Make Salad').date).toBe('2027-04-21')
  })

  it('does not cook on day 1 for day 2 except after nightfall', () => {
    // Quick kugel (30 minutes) fits between nightfall and the second seder.
    const quick = find(of('seder2'), 'Cook Quick kugel')
    expect(quick.date).toBe('2027-04-22')
    expect(startAbs(quick)).toBeGreaterThanOrEqual(thuNight)
    expect(quick.notes.some((n) => n.startsWith('After nightfall'))).toBe(true)
    // The chicken takes two hours: it must be made before Yom Tov.
    expect(endAbs(find(of('seder2'), 'Cook Chicken'))).toBeLessThanOrEqual(wedCandle - 20)
    // Nothing for the second seder is done during the day on day 1.
    for (const t of of('seder2').filter((x) => x.kind !== 'passive')) {
      const inDay1 = startAbs(t) >= wedCandle && startAbs(t) < thuNight
      expect(inDay1, t.label).toBe(false)
    }
  })

  it('cooks for Shabbat on Friday Yom Tov under the eruv, finished before Shabbat', () => {
    const cook = find(of('shabbat'), 'Cook Kugel')
    expect(cook.date).toBe('2027-04-23')
    expect(cook.notes).toContain('On Yom Tov under the eruv tavshilin')
    for (const t of of('shabbat').filter((x) => x.kind !== 'passive')) {
      expect(startAbs(t) >= thuNight || startAbs(t) < wedCandle, t.label).toBe(true) // never on day 1
      expect(endAbs(t), t.label).toBeLessThanOrEqual(friCandle - 20)
    }
    // Marinade for the Shabbat chicken starts after nightfall on Thursday, under the eruv.
    const marinade = find(of('shabbat'), 'Marinate chicken (12h)')
    expect(startAbs(marinade)).toBeGreaterThanOrEqual(thuNight)
    // No active work during Shabbat at all.
    for (const t of sched.tasks.filter((x) => x.kind !== 'passive'))
      expect(startAbs(t) >= friCandle && startAbs(t) < satHavdalah, t.label).toBe(false)
  })

  it('without an eruv (Israel there is none) Friday is ordinary and Shabbat still gets nothing', () => {
    const il = buildPrepSchedule({
      location: JERUSALEM,
      meals: [
        { id: 'l1', date: '2027-04-22', slot: 'lunch', items: [kugel, salad] },
        {
          id: 'sh',
          date: '2027-04-24',
          slot: 'lunch',
          label: 'Shabbat lunch',
          items: [chicken, kugel],
        },
      ],
    })
    expect(il.flags.some((f) => f.code === 'eruv_tavshilin')).toBe(false)
    const k = find(
      il.tasks.filter((t) => t.mealId === 'sh'),
      'Cook Kugel',
    )
    expect(k.date).toBe('2027-04-23')
    expect(k.notes).not.toContain('On Yom Tov under the eruv tavshilin')
    expect(
      find(
        il.tasks.filter((t) => t.mealId === 'l1'),
        'Cook Kugel',
      ).date,
    ).toBe('2027-04-22')
    expect(il.days.find((d) => d.date === '2027-04-24')!.tasks).toEqual([])
  })

  it('flags cooking on Yom Tov for after Yom Tov: made ahead unless the meal is late enough to cook afterwards', () => {
    const late = buildPrepSchedule({
      location: NEW_YORK,
      meals: [
        {
          id: 'motzei',
          date: '2027-04-24',
          time: 22 * 60 + 30,
          label: 'Motzei Shabbat dinner',
          items: [kugel],
        },
      ],
    })
    const kLate = find(late.tasks, 'Cook Kugel')
    expect(startAbs(kLate)).toBeGreaterThanOrEqual(satHavdalah)
    expect(late.flags.some((f) => f.code === 'cooking_for_after_rest')).toBe(false) // late enough to cook after Shabbat

    const early = buildPrepSchedule({
      location: NEW_YORK,
      meals: [
        {
          id: 'motzei',
          date: '2027-04-24',
          time: 20 * 60 + 59,
          label: 'Motzei Shabbat dinner',
          items: [kugel],
        },
      ],
    })
    const kEarly = find(early.tasks, 'Cook Kugel')
    expect(endAbs(kEarly)).toBeLessThanOrEqual(wedCandle - 20)
    expect(early.flags.find((f) => f.code === 'cooking_for_after_rest')!.text).toMatch(
      /Yom Tov and Shabbat begins/,
    )
  })

  it('lists Yom Tov days with their day number and candle lighting', () => {
    const thu = sched.days.find((d) => d.date === '2027-04-22')!
    expect(thu.notes).toContain("Yom Tov (day 1): cooking only for today's meals")
    expect(thu.notes.some((n) => n.startsWith('Candle lighting after nightfall'))).toBe(true)
    expect(thu.holidays).toEqual(['Pesach I'])
  })
})
