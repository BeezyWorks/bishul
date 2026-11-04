import { describe, expect, it } from 'vitest'

import { buildDiningBrief } from './diningBrief'
import { NEW_YORK } from './fixtures'
import { effectiveFlags, inferKashrutFlags, pesachProblems } from './kashrutFlags'
import { constraint, dish, ing, person } from './testData'

const flagsOf = (name: string) => inferKashrutFlags([name]).sort()

describe('inferKashrutFlags', () => {
  it.each([
    'rice',
    'Basmati rice',
    'rice flour',
    'corn',
    'cornstarch',
    'black beans',
    'red lentils',
    'chickpeas',
    'green peas',
    'split peas',
    'tofu',
    'soy sauce',
    'buckwheat groats',
    'millet',
    'mustard seeds',
    'tahini',
    'peanut butter',
  ])('%s is kitniyot', (name) => {
    expect(flagsOf(name)).toContain('kitniyot')
  })

  it.each([
    'wheat flour',
    'all-purpose flour',
    'bread crumbs',
    'pasta',
    'egg noodles',
    'barley',
    'rye bread',
    'rolled oats',
    'spelt flour',
    'beer',
    'couscous',
  ])('%s is chametz', (name) => {
    expect(flagsOf(name)).toContain('chametz')
  })

  it('rice flour is kitniyot but not chametz, and rice noodles likewise', () => {
    expect(flagsOf('rice flour')).toEqual(['kitniyot'])
    expect(flagsOf('rice noodles')).toEqual(['kitniyot'])
  })

  it('matzah meal is gebrokts, not chametz', () => {
    expect(flagsOf('matzah meal')).toEqual(['gebrokts'])
    expect(flagsOf('Matzo meal')).toEqual(['gebrokts'])
    expect(flagsOf('cake meal')).toEqual(['gebrokts'])
  })

  it('whole matzah and whole-wheat matzah are not chametz', () => {
    expect(flagsOf('matzah')).toEqual([])
    expect(flagsOf('whole wheat matzah')).toEqual([])
  })

  it('does not trip on look-alikes', () => {
    for (const name of [
      'almond flour',
      'potato starch',
      'coconut flour',
      'vanilla bean',
      'green beans',
      'peppercorns',
      'ginger ale',
      'root beer',
      'cornish hen',
      'sweet potato',
      'buckwheat'.replace('buckwheat', 'chicken breast'),
    ])
      expect(flagsOf(name)).not.toContain('chametz')
    expect(flagsOf('vanilla bean')).toEqual([])
    expect(flagsOf('green beans')).toEqual([])
    expect(flagsOf('cornish hen')).toEqual([])
    expect(flagsOf('peppercorns')).toEqual([])
    expect(flagsOf('almond flour')).toEqual([])
  })

  it('buckwheat is kitniyot, not chametz', () => {
    expect(flagsOf('buckwheat')).toEqual(['kitniyot'])
  })

  it('leaves products labelled for Passover alone', () => {
    expect(flagsOf('Kosher for Passover cake flour')).toEqual([])
  })
})

describe('effectiveFlags', () => {
  it('keeps explicit flags and adds inferred ones', () => {
    expect(effectiveFlags(ing('rice', { flags: ['grain'] })).sort()).toEqual(['grain', 'kitniyot'])
  })

  it('an explicit "not" on the catalog row wins over the name', () => {
    expect(effectiveFlags(ing('rice', { flagsOff: ['kitniyot'] }))).toEqual([])
  })

  it('reads aliases', () => {
    expect(effectiveFlags(ing('garbanzos', { aliases: ['chickpeas'] }))).toEqual(['kitniyot'])
  })
})

describe('pesachProblems', () => {
  it('lists chametz and kitniyot lines', () => {
    expect(pesachProblems([ing('rice'), ing('flour'), ing('matzah meal'), ing('onion')])).toEqual({
      chametz: ['flour'],
      kitniyot: ['rice'],
    })
  })
})

describe('dining brief on Pesach', () => {
  const pesach = '2027-04-23'
  const noKitniyot = person('k', 'Kobi', [
    constraint(
      { type: 'kashrut', value: 'kitniyot' },
      { kind: 'religious', activeWhen: { period: 'pesach' } },
    ),
  ])
  const noChametz = person('c', 'Chana', [
    constraint(
      { type: 'kashrut', value: 'chametz' },
      { kind: 'religious', activeWhen: { period: 'pesach' } },
    ),
  ])
  const noGebrokts = person('g', 'Gila', [
    constraint(
      { type: 'kashrut', value: 'gebrokts' },
      { kind: 'religious', activeWhen: { period: 'pesach' } },
    ),
  ])
  const run = (p: ReturnType<typeof person>, d: ReturnType<typeof dish>) =>
    buildDiningBrief({
      location: NEW_YORK,
      date: pesach,
      time: 12 * 60,
      attendees: [p],
      hostPersons: [],
      selected: [d],
    })

  it('a rice dish with no explicit flags fails a no-kitniyot Pesach constraint', () => {
    const pilaf = dish('pilaf', 'Rice pilaf', 'parve', [ing('rice'), ing('onion')])
    const brief = run(noKitniyot, pilaf)
    expect(brief.hardExclusions).toHaveLength(1)
    expect(brief.hardExclusions[0].ingredients).toEqual(['rice'])
    expect(brief.dishes[0].fits).toBe(false)
  })

  it('a wheat-flour cake fails a no-chametz constraint, a matzah-meal cake does not', () => {
    const cake = dish('cake', 'Cake', 'parve', [ing('all-purpose flour'), ing('egg')])
    const mcake = dish('mcake', 'Matzah cake', 'parve', [ing('matzah meal'), ing('egg')])
    expect(run(noChametz, cake).hardExclusions).toHaveLength(1)
    expect(run(noChametz, mcake).hardExclusions).toEqual([])
  })

  it('matzah meal fails a no-gebrokts constraint', () => {
    const kneidlach = dish('k', 'Kneidlach', 'parve', [ing('matzah meal'), ing('egg')])
    expect(run(noGebrokts, kneidlach).hardExclusions).toHaveLength(1)
  })

  it('a clean dish passes', () => {
    const d = dish('d', 'Roast potatoes', 'parve', [ing('potato'), ing('olive oil')])
    expect(run(noKitniyot, d).hardExclusions).toEqual([])
  })
})
