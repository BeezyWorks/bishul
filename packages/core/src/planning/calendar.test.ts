import { describe, expect, it } from 'vitest'

import { calendarDay, calendarDays, chametzCutoff, isActive, periodsOnDay } from './calendar'
import { JERUSALEM, NEW_YORK } from './fixtures'

describe('calendarDays: Shabbat Toldot 5787', () => {
  it('New York: Friday and Shabbat', () => {
    const [fri, sat] = calendarDays('2026-11-13', '2026-11-14', NEW_YORK)
    expect(fri.hebrew.text).toBe('3rd of Kislev, 5787')
    expect(fri.parasha).toBe('Toldot')
    expect(fri.isErevShabbat).toBe(true)
    expect(fri.noMelacha).toBe(false)
    expect(fri.candleLighting).toBe(981) // 4:21 PM, 18 minutes before sunset
    expect(fri.candleLightingKind).toBe('before_sunset')
    expect(sat.isShabbat).toBe(true)
    expect(sat.noMelacha).toBe(true)
    expect(sat.parasha).toBe('Toldot')
    expect(sat.havdalah).toBe(sat.nightfall)
    expect(sat.havdalah).toBeGreaterThan(sat.sunset!)
    expect(sat.candleLighting).toBeUndefined()
  })

  it('Jerusalem: 40 minute candle lighting before sunset', () => {
    const fri = calendarDay('2026-11-13', JERUSALEM)
    expect(fri.parasha).toBe('Toldot')
    expect(fri.sunset! - fri.candleLighting!).toBe(40)
  })

  it('Thanksgiving is a civil holiday in New York only', () => {
    const ny = calendarDay('2026-11-26', NEW_YORK)
    expect(ny.civilHolidays).toEqual(['Thanksgiving'])
    expect(ny.jewishHolidays).toEqual([])
    expect(ny.weekday).toBe(4)
    expect(calendarDay('2026-11-26', JERUSALEM).civilHolidays).toEqual([])
  })
})

describe('calendarDays: Pesach 5787', () => {
  const ny = calendarDays('2027-04-20', '2027-04-30', NEW_YORK)
  const il = calendarDays('2027-04-20', '2027-04-30', JERUSALEM)
  const by = (days: typeof ny, date: string) => days.find((d) => d.date === date)!

  it('diaspora: Erev Pesach Wednesday flags eruv tavshilin for Thu-Fri-Shabbat', () => {
    const erev = by(ny, '2027-04-21')
    expect(erev.isErevYomTov).toBe(true)
    expect(erev.eruvTavshilin).toBe(true)
    expect(erev.jewishHolidays).toContain('Erev Pesach')
    expect(erev.candleLightingKind).toBe('before_sunset')
    expect(by(ny, '2027-04-20').eruvTavshilin).toBe(false)
  })

  it('diaspora: Yom Tov days 1 and 2, then a Chol Hamoed Shabbat', () => {
    const d1 = by(ny, '2027-04-22')
    const d2 = by(ny, '2027-04-23')
    const shabbat = by(ny, '2027-04-24')
    expect(d1.yomTovDay).toBe(1)
    expect(d2.yomTovDay).toBe(2)
    expect(d1.jewishHolidays).toEqual(['Pesach I'])
    expect(d1.candleLightingKind).toBe('after_nightfall')
    expect(d1.candleLighting).toBe(d1.nightfall)
    expect(d1.havdalah).toBeUndefined()
    expect(d2.candleLightingKind).toBe('before_sunset')
    expect(d2.havdalah).toBeUndefined() // Yom Tov runs into Shabbat
    expect(shabbat.isShabbat).toBe(true)
    expect(shabbat.isCholHamoed).toBe(true)
    expect(shabbat.isYomTov).toBe(false)
    expect(shabbat.noMelacha).toBe(true)
    expect(shabbat.havdalah).toBeDefined()
    expect(by(ny, '2027-04-25').isCholHamoed).toBe(true)
    expect(by(ny, '2027-04-25').noMelacha).toBe(false)
  })

  it('diaspora: Pesach VII and VIII, then Shabbat-less Friday', () => {
    expect(by(ny, '2027-04-28').yomTovDay).toBe(1)
    expect(by(ny, '2027-04-29').yomTovDay).toBe(2)
    expect(by(ny, '2027-04-29').havdalah).toBeDefined()
    expect(by(ny, '2027-04-28').eruvTavshilin).toBe(false)
  })

  it('Israel: one day of Yom Tov, no eruv tavshilin (Friday is Chol Hamoed)', () => {
    expect(by(il, '2027-04-21').eruvTavshilin).toBe(false)
    const d1 = by(il, '2027-04-22')
    expect(d1.isYomTov).toBe(true)
    expect(d1.yomTovDay).toBe(1)
    expect(d1.havdalah).toBeDefined()
    const fri = by(il, '2027-04-23')
    expect(fri.isYomTov).toBe(false)
    expect(fri.isCholHamoed).toBe(true)
    expect(fri.isErevShabbat).toBe(true)
    expect(fri.candleLighting).toBeDefined()
    expect(by(il, '2027-04-29').isYomTov).toBe(false)
    expect(by(il, '2027-04-28').isYomTov).toBe(true)
  })

  it('names the periods', () => {
    expect(by(ny, '2027-04-21').periods).toContain('pesach')
    expect(by(ny, '2027-04-20').periods).not.toContain('pesach')
    expect(by(ny, '2027-04-23').periods).toEqual(['pesach'])
    // Last day of Pesach in the diaspora is the 22nd; in Israel the 22nd is already over.
    expect(by(ny, '2027-04-29').periods).toContain('pesach')
    expect(by(il, '2027-04-29').periods).not.toContain('pesach')
  })
})

describe('Yom Tov into Shabbat elsewhere', () => {
  it('Shavuot on Friday in Israel needs an eruv tavshilin on Thursday', () => {
    // Shavuot 5784 was Sunday-Monday; 5787 Shavuot is Friday 22 May 2026 (Israel one day, diaspora Fri-Sat)
    const il = calendarDays('2026-05-20', '2026-05-24', JERUSALEM)
    const thu = il.find((d) => d.date === '2026-05-21')!
    expect(il.find((d) => d.date === '2026-05-22')!.jewishHolidays).toEqual(['Shavuot'])
    expect(thu.eruvTavshilin).toBe(true)
  })
})

describe('periods and isActive', () => {
  it('always / range', () => {
    expect(isActive({ always: true }, '2026-11-13', NEW_YORK)).toBe(true)
    expect(
      isActive({ range: { from: '2026-11-10', to: '2026-11-12' } }, '2026-11-13', NEW_YORK),
    ).toBe(false)
    expect(
      isActive({ range: { from: '2026-11-10', to: '2026-11-13' } }, '2026-11-13', NEW_YORK),
    ).toBe(true)
  })

  it('Pesach is exact about time on Erev Pesach and the last night', () => {
    const when = { period: 'pesach' } as const
    expect(isActive(when, '2027-04-21', NEW_YORK)).toBe(true) // any part of the day
    expect(isActive(when, '2027-04-21', NEW_YORK, 8 * 60)).toBe(false) // breakfast: chametz still fine
    expect(isActive(when, '2027-04-21', NEW_YORK, 20 * 60)).toBe(true) // the seder
    expect(isActive(when, '2027-04-29', NEW_YORK, 12 * 60)).toBe(true)
    expect(isActive(when, '2027-04-29', NEW_YORK, 22 * 60)).toBe(false) // after nightfall ending Pesach
    expect(isActive(when, '2027-04-28', JERUSALEM, 12 * 60)).toBe(true)
    expect(isActive(when, '2027-04-29', JERUSALEM, 12 * 60)).toBe(false)
  })

  it('Aseret Yemei Teshuva 5787 (RH 12 Sep 2026, YK 21 Sep 2026)', () => {
    const when = { period: 'aseret_yemei_teshuva' } as const
    expect(isActive(when, '2026-09-11', NEW_YORK, 12 * 60)).toBe(false)
    expect(isActive(when, '2026-09-11', NEW_YORK, 22 * 60)).toBe(true) // night of Rosh Hashana
    expect(isActive(when, '2026-09-16', NEW_YORK)).toBe(true)
    expect(isActive(when, '2026-09-21', NEW_YORK, 12 * 60)).toBe(true)
    expect(isActive(when, '2026-09-22', NEW_YORK, 12 * 60)).toBe(false)
  })

  it("the Nine Days 5786 (RC Av Wed 15 Jul 2026, Tish'a B'Av Thu 23 Jul 2026)", () => {
    const when = { period: 'nine_days' } as const
    expect(isActive(when, '2026-07-14', NEW_YORK, 12 * 60)).toBe(false)
    expect(isActive(when, '2026-07-14', NEW_YORK, 22 * 60)).toBe(true) // from the sunset before Rosh Chodesh
    expect(isActive(when, '2026-07-15', NEW_YORK, 12 * 60)).toBe(true)
    expect(isActive(when, '2026-07-24', NEW_YORK, 10 * 60)).toBe(true) // until midday of the 10th
    expect(isActive(when, '2026-07-24', NEW_YORK, 14 * 60)).toBe(false)
  })

  it("the Nine Days end with the fast when Tish'a B'Av is pushed off Shabbat (5789: Sunday 22 Jul 2029)", () => {
    const when = { period: 'nine_days' } as const
    expect(isActive(when, '2029-07-22', NEW_YORK, 10 * 60)).toBe(true)
    expect(isActive(when, '2029-07-22', NEW_YORK, 23 * 60)).toBe(false) // fast over, meat allowed
    expect(isActive(when, '2029-07-23', NEW_YORK, 8 * 60)).toBe(false)
  })
})

describe('chametzCutoff', () => {
  it('Erev Pesach 2027 (Wednesday 21 April) in New York', () => {
    const c = chametzCutoff(2027, NEW_YORK)
    expect(c.erevPesach).toBe('2027-04-21')
    expect(c.date).toBe('2027-04-21')
    expect(c.opinion).toBe('mga')
    expect(c.minutes).toBe(c.burnMga)
    expect(c.burnMga).toBeLessThan(c.burnGra)
    expect(c.eatMinutes).toBeLessThan(c.minutes)
    expect(c.minutes).toBeGreaterThan(10 * 60 + 30)
    expect(c.minutes).toBeLessThan(12 * 60)
    expect(chametzCutoff(2027, NEW_YORK, 'gra').minutes).toBe(c.burnGra)
  })

  it('burns on Friday when Erev Pesach is Shabbat (5785: Shabbat 12 Apr 2025)', () => {
    const c = chametzCutoff(2025, NEW_YORK)
    expect(c.erevPesach).toBe('2025-04-12')
    expect(c.date).toBe('2025-04-11')
    expect(c.eatMinutes).toBeLessThan(c.minutes)
  })

  it('a weekday Erev Pesach (5786: Wed 1 Apr 2026)', () => {
    expect(chametzCutoff(2026, NEW_YORK).date).toBe('2026-04-01')
  })
})
