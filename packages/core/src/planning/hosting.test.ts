import { describe, expect, it } from 'vitest'

import { calendarDay } from './calendar'
import { JERUSALEM, NEW_YORK } from './fixtures'
import {
  autoMealName,
  compareMealsInDay,
  compareMealsInHolyDay,
  displayHolidays,
  eveLinkOn,
  holyDateOfMeal,
  holyDatesOf,
  hostedKeyFor,
  hostedRuns,
  mealKey,
  namingJewishHoliday,
  nameToStore,
  parseHostedKey,
  runKey,
  runStartingOn,
  type DaySlot,
} from './hosting'

const names = (r: ReturnType<typeof hostedRuns>[number]) => r.holyDays.map((d) => d.label)

describe('hosted runs: diaspora', () => {
  it('Pesach I, Pesach II and Shabbat form one run; the Seder belongs to Pesach I', () => {
    const runs = hostedRuns('2027-04-18', '2027-04-24', NEW_YORK)
    expect(runs).toHaveLength(1)
    const [run] = runs
    expect(run.key).toBe('run-2027-04-22')
    expect(run.startsOn).toBe('2027-04-21')
    expect(run.from).toBe('2027-04-22')
    expect(run.to).toBe('2027-04-24')
    expect(names(run)).toEqual(['Pesach I', 'Pesach II', 'Shabbat'])
    expect(run.title).toBe('Pesach · first days')
    const [p1, p2, sh] = run.holyDays
    expect(p1.defaultMeals).toEqual([
      { part: 'night', date: '2027-04-21', slot: 'dinner', name: 'Seder I' },
      { part: 'day', date: '2027-04-22', slot: 'lunch', name: 'Yom Tov day' },
    ])
    expect(p2.defaultMeals.map((m) => m.name)).toEqual(['Seder II', 'Yom Tov day'])
    expect(p2.defaultMeals[0].date).toBe('2027-04-22')
    expect(sh.defaultMeals.map((m) => m.name)).toEqual(['Leil Shabbat', 'Shabbat day'])
    expect(sh.defaultMeals[0].date).toBe('2027-04-23')
    expect(sh.isCholHamoed).toBe(true)
  })

  it('a plain Shabbat is a run of one, titled with the parsha', () => {
    const runs = hostedRuns('2026-11-08', '2026-11-14', NEW_YORK)
    expect(runs.map((r) => [r.key, r.title, names(r)])).toEqual([
      ['run-2026-11-14', 'Shabbat Toldot', ['Shabbat']],
    ])
  })

  it('a run is included when only its first night is in range (the Friday)', () => {
    const runs = hostedRuns('2026-11-13', '2026-11-13', NEW_YORK)
    expect(runs).toHaveLength(1)
    expect(runs[0].startsOn).toBe('2026-11-13')
    expect(hostedRuns('2026-11-09', '2026-11-12', NEW_YORK)).toEqual([])
  })

  it('Rosh Hashana on Shabbat: two days, first one is also Shabbat but takes the Yom Tov name', () => {
    const [run] = hostedRuns('2026-09-12', '2026-09-13', NEW_YORK)
    expect(names(run)).toEqual(['Rosh Hashana I', 'Rosh Hashana II'])
    expect(run.title).toBe('Rosh Hashana')
    expect(run.holyDays[0].defaultMeals[0].name).toBe('Leil Yom Tov')
  })

  it('Shmini Atzeret and Simchat Torah are one run; Sukkot leaves Chol Hamoed between', () => {
    const runs = hostedRuns('2026-09-25', '2026-10-05', NEW_YORK)
    expect(runs.map((r) => r.title)).toEqual(['Sukkot', 'Shmini Atzeret and Simchat Torah'])
    expect(names(runs[0])).toEqual(['Sukkot I', 'Sukkot II'])
  })

  it('Yom Kippur is not a holy day with meals', () => {
    expect(hostedRuns('2026-09-20', '2026-09-22', NEW_YORK)).toEqual([])
  })

  it('Pesach VII and VIII', () => {
    const [run] = hostedRuns('2027-04-28', '2027-04-29', NEW_YORK)
    expect(names(run)).toEqual(["Shvi'i shel Pesach", 'Acharon shel Pesach'])
    expect(run.title).toBe('Pesach · last days')
    expect(run.holyDays[0].defaultMeals[0].name).toBe('Leil Yom Tov')
  })

  it('Shavuot', () => {
    const [run] = hostedRuns('2027-06-10', '2027-06-13', NEW_YORK)
    expect(names(run)).toEqual(['Shavuot I', 'Shavuot II'])
  })
})

describe('hosted runs: Israel', () => {
  it('Shvi’i shel Pesach is its own run; Thursday keeps it apart from Shabbat', () => {
    const runs = hostedRuns('2027-04-25', '2027-05-01', JERUSALEM)
    expect(runs.map((r) => [r.title, names(r), r.startsOn])).toEqual([
      ["Shvi'i shel Pesach", ["Shvi'i shel Pesach"], '2027-04-27'],
      ['Shabbat Achrei Mot', ['Shabbat'], '2027-04-30'],
    ])
  })

  it('a single Seder, and a single Pesach day', () => {
    const [run] = hostedRuns('2027-04-21', '2027-04-24', JERUSALEM)
    expect(names(run)).toEqual(['Pesach'])
    expect(run.holyDays[0].defaultMeals[0].name).toBe('Seder')
  })

  it('Shavuot is one day, and it runs into Shabbat', () => {
    const [run] = hostedRuns('2027-06-10', '2027-06-13', JERUSALEM)
    expect(names(run)).toEqual(['Shavuot', 'Shabbat'])
  })

  it('the same dates abroad join, because the second day is Yom Tov there', () => {
    expect(names(hostedRuns('2027-06-10', '2027-06-13', NEW_YORK)[0])).toEqual([
      'Shavuot I',
      'Shavuot II',
    ])
  })
})

describe('runStartingOn and keys', () => {
  it('finds a run by the date in its key', () => {
    expect(runStartingOn('2027-04-22', NEW_YORK)?.title).toBe('Pesach · first days')
    expect(runStartingOn('2027-04-23', NEW_YORK)).toBeNull()
  })

  it('keys round-trip', () => {
    expect(parseHostedKey(runKey('2027-04-22'))).toEqual({ type: 'run', date: '2027-04-22' })
    expect(parseHostedKey(mealKey('01JABC_def'))).toEqual({ type: 'meal', mealId: '01JABC_def' })
    expect(parseHostedKey('nope')).toBeNull()
    expect(hostedKeyFor({ id: 'm1', runKey: 'run-2027-04-22' })).toBe('run-2027-04-22')
    expect(hostedKeyFor({ id: 'm1', runKey: null })).toBe('meal-m1')
    expect(hostedKeyFor({ id: 'm1' })).toBe('meal-m1')
  })
})

describe('which holy day a meal belongs to', () => {
  const runs = hostedRuns('2027-04-18', '2027-04-24', NEW_YORK)
  const holy = holyDatesOf(runs)
  const at = (date: string, slot: DaySlot) => holyDateOfMeal({ date, slot }, holy)

  it('dinner on the eve belongs to the holy day that starts that evening', () => {
    expect(at('2027-04-21', 'dinner')).toBe('2027-04-22')
    expect(at('2027-04-22', 'dinner')).toBe('2027-04-23')
    expect(at('2027-04-23', 'oneg')).toBe('2027-04-24')
  })

  it('daytime meals belong to the day itself', () => {
    expect(at('2027-04-22', 'lunch')).toBe('2027-04-22')
    expect(at('2027-04-24', 'kiddush')).toBe('2027-04-24')
  })

  it('the eve’s daytime and the evening after the last holy day are ordinary meals', () => {
    expect(at('2027-04-21', 'lunch')).toBeNull()
    expect(at('2027-04-24', 'dinner')).toBeNull()
    expect(at('2027-04-26', 'dinner')).toBeNull()
  })

  it('the eve has a link to its evening meal', () => {
    expect(eveLinkOn('2027-04-21', runs)).toEqual({
      runKey: 'run-2027-04-22',
      holyDate: '2027-04-22',
      mealName: 'Seder I',
      holyDayLabel: 'Pesach I',
    })
    expect(eveLinkOn('2027-04-23', runs)?.mealName).toBe('Leil Shabbat')
    expect(eveLinkOn('2027-04-20', runs)).toBeNull()
  })
})

describe('ordering', () => {
  const m = (slot: DaySlot, time?: number) => ({ slot, time })
  it('orders a day by slot, then time', () => {
    const day = [
      m('oneg'),
      m('dinner'),
      m('lunch', 800),
      m('breakfast'),
      m('lunch', 700),
      m('kiddush'),
    ]
    expect(day.sort(compareMealsInDay).map((x) => x.slot + (x.time ?? ''))).toEqual([
      'breakfast',
      'kiddush',
      'lunch700',
      'lunch800',
      'dinner',
      'oneg',
    ])
  })
  it('starts a holy day with its evening', () => {
    const day = [m('lunch'), m('kiddush'), m('oneg'), m('dinner')]
    expect(day.sort(compareMealsInHolyDay).map((x) => x.slot)).toEqual([
      'dinner',
      'oneg',
      'kiddush',
      'lunch',
    ])
  })
})

describe('automatic names', () => {
  const name = (date: string, slot: DaySlot = 'dinner', loc = NEW_YORK) =>
    autoMealName(calendarDay(date, loc), slot)

  it('plain weekday', () => expect(name('2026-11-17')).toBe('Tuesday dinner'))
  it('Rosh Chodesh', () => expect(name('2026-11-11')).toBe('Rosh Chodesh Kislev'))
  it('Thanksgiving', () => expect(name('2026-11-26')).toBe('Thanksgiving'))
  it('Chanuka beats Rosh Chodesh', () => expect(name('2026-12-10')).toBe('Chanuka'))
  it('Chanuka', () => expect(name('2026-12-05')).toBe('Chanuka'))
  it('Purim', () => expect(name('2026-03-03')).toBe('Purim'))
  it('Jewish holiday wins over a civil one', () => {
    expect(
      autoMealName(
        {
          date: '2013-11-28',
          jewishHolidays: ['Chanukah: 1 Candle'],
          civilHolidays: ['Thanksgiving'],
        },
        'dinner',
      ),
    ).toBe('Chanuka')
  })
  it('never a public holiday', () => {
    expect(name('2026-12-25')).toBe('Friday dinner')
    expect(calendarDay('2026-12-25', NEW_YORK).civilHolidays).toEqual(['Public holiday'])
    expect(displayHolidays(calendarDay('2026-12-25', NEW_YORK))).toEqual([])
  })
  it('names the slot', () => {
    expect(name('2026-11-17', 'brunch')).toBe('Tuesday brunch')
    expect(name('2026-11-17', 'seudah_shlishit')).toBe('Tuesday seudah shlishit')
  })
  it('Chol Hamoed and Erev days', () => {
    expect(name('2027-04-26')).toBe('Chol Hamoed Pesach')
    expect(name('2027-04-21', 'lunch')).toBe('Erev Pesach')
  })
  it('skips noise', () => {
    expect(namingJewishHoliday(['Yom Kippur Katan Kislev', 'Sigd'])).toBeNull()
    expect(namingJewishHoliday(['Tzom Gedaliah'])).toBe('Tzom Gedaliah')
  })
  it('displays holidays without hebcal decoration', () => {
    expect(displayHolidays(calendarDay('2026-12-05', NEW_YORK)).map((h) => h.name)).toEqual([
      'Chanuka',
    ])
  })
})

describe('keeping edited names', () => {
  it('does not overwrite a user-edited name', () => {
    expect(
      nameToStore({ name: 'Bubby’s birthday', nameEdited: true }, { auto: 'Tuesday dinner' }),
    ).toEqual({
      name: 'Bubby’s birthday',
      nameEdited: true,
    })
  })
  it('re-derives an automatic name', () => {
    expect(
      nameToStore({ name: 'Tuesday dinner', nameEdited: false }, { auto: 'Thanksgiving' }),
    ).toEqual({
      name: 'Thanksgiving',
      nameEdited: false,
    })
  })
  it('an explicit name marks it edited', () => {
    expect(nameToStore({ name: 'x', nameEdited: false }, { name: ' Seder ', auto: 'y' })).toEqual({
      name: 'Seder',
      nameEdited: true,
    })
  })
})
