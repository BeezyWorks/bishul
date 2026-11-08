import { describe, expect, it } from 'vitest'

import type { DiningBriefInput } from './diningBrief'
import { NEW_YORK } from './fixtures'
import { rankCandidates, suggestMenu, type RankContext } from './rank'
import { constraint, dish, ing, person } from './testData'

const george = person('george', 'George')
const esther = person('esther', 'Esther')
const noa = person('noa', 'Noa', [constraint({ type: 'allergen', value: 'sesame' })])

const meal = (o: Partial<DiningBriefInput> = {}): DiningBriefInput => ({
  location: NEW_YORK,
  date: '2026-11-13', // Shabbat Toldot, Friday night
  time: 18 * 60,
  attendees: [george, esther],
  hostPersons: [],
  selected: [],
  ...o,
})

const ctx = (o: Partial<RankContext> = {}): RankContext => ({ today: '2026-11-10', ...o })

const kugel = dish('kugel', 'Potato kugel', 'parve', [ing('potato')], {
  course: 'side',
  form: 'kugel',
})
const rice = dish('rice', 'Rice pilaf', 'parve', [ing('rice')], { course: 'side', form: 'rice' })
const soup = dish('soup', 'Squash soup', 'parve', [ing('butternut squash'), ing('onion')], {
  course: 'soup',
  form: 'soup',
})

const ids = (r: { ranked: { dish: { id: string } }[] }) => r.ranked.map((x) => x.dish.id)

describe('rankCandidates: likes and dislikes', () => {
  it('boosts a liked dish for the people coming, with the reason', () => {
    const r = rankCandidates(
      meal(),
      [rice, kugel],
      ctx({ reactions: [{ personId: 'george', versionId: 'kugel', type: 'like' }] }),
    )
    expect(ids(r)).toEqual(['kugel', 'rice'])
    expect(r.ranked[0].reasons.map((x) => x.text)).toContain('George liked it')
  })

  it('ignores likes from people who are not coming', () => {
    const r = rankCandidates(
      meal({ attendees: [esther] }),
      [rice, kugel],
      ctx({ reactions: [{ personId: 'george', versionId: 'kugel', type: 'like' }] }),
    )
    expect(
      r.ranked.find((x) => x.dish.id === 'kugel')!.reasons.some((x) => x.code === 'liked'),
    ).toBe(false)
  })

  it('the like boost fades when George was served it recently, and recovers over time', () => {
    const like = [{ personId: 'george', versionId: 'kugel', type: 'like' as const }]
    const boost = (daysAgo: number | null) => {
      const servings =
        daysAgo === null
          ? []
          : [{ personId: 'george', versionId: 'kugel', date: addDaysTo('2026-11-13', -daysAgo) }]
      const r = rankCandidates(meal(), [kugel], ctx({ reactions: like, servings }))
      return r.ranked[0].reasons.find((x) => x.code === 'liked')!
    }
    expect(boost(null).delta).toBe(3)
    expect(boost(7).delta).toBeCloseTo(0.5)
    expect(boost(7).text).toBe('George liked it, but had it a week ago')
    expect(boost(21).delta).toBeCloseTo(1.5)
    expect(boost(60).delta).toBe(3)
    expect(boost(60).text).toBe('George liked it')
  })

  it('a dislike demotes for good and never hides', () => {
    const dislike = [{ personId: 'esther', versionId: 'kugel', type: 'dislike' as const }]
    // Served a year ago: still demoted.
    const r = rankCandidates(
      meal(),
      [kugel, rice],
      ctx({
        reactions: dislike,
        servings: [{ personId: 'esther', versionId: 'kugel', date: '2025-11-13' }],
      }),
    )
    expect(ids(r)).toEqual(['rice', 'kugel'])
    const k = r.ranked.find((x) => x.dish.id === 'kugel')!
    expect(k.reasons.map((x) => x.text)).toContain("Esther didn't like it")
    expect(k.score).toBeLessThan(0)
    expect(r.hidden).toEqual([])
  })
})

describe('rankCandidates: serving history', () => {
  it('says how long since the group had it', () => {
    const servings = [{ personId: 'george', versionId: 'kugel', date: '2026-09-18' }] // 8 weeks before
    const r = rankCandidates(meal(), [kugel, rice], ctx({ servings }))
    const k = r.ranked.find((x) => x.dish.id === 'kugel')!
    expect(k.reasons.map((x) => x.text)).toContain('Not served in 8 weeks')
    expect(r.ranked.find((x) => x.dish.id === 'rice')!.reasons.map((x) => x.text)).toContain(
      'Not served to this group before',
    )
  })

  it('penalizes what was served last week, to any attendee', () => {
    const servings = [{ personId: 'esther', versionId: 'kugel', date: '2026-11-08' }]
    const r = rankCandidates(meal(), [kugel, rice], ctx({ servings }))
    expect(ids(r)).toEqual(['rice', 'kugel'])
    expect(r.ranked[1].reasons.map((x) => x.text)).toContain('Served 5 days ago')
  })

  it('ignores servings to people who are not coming and servings on or after the meal date', () => {
    const servings = [
      { personId: 'other', versionId: 'kugel', date: '2026-11-08' },
      { personId: 'george', versionId: 'kugel', date: '2026-11-13' },
    ]
    const r = rankCandidates(meal(), [kugel], ctx({ servings }))
    expect(r.ranked[0].reasons.map((x) => x.code)).toEqual(['not_served'])
    expect(r.ranked[0].reasons[0].text).toBe('Not served to this group before')
  })
})

describe('rankCandidates: pantry', () => {
  it('uses squash expiring Monday', () => {
    const r = rankCandidates(
      meal(),
      [soup, rice],
      ctx({ pantry: [{ name: 'squash', expiresOn: '2026-11-16' }] }),
    )
    expect(ids(r)[0]).toBe('soup')
    expect(r.ranked[0].reasons.map((x) => x.text)).toContain('Uses squash expiring Monday')
  })

  it('never uses what is expired by the meal date, and ignores what is not close to expiring', () => {
    const expired = rankCandidates(
      meal(),
      [soup],
      ctx({ pantry: [{ name: 'squash', expiresOn: '2026-11-12' }] }),
    )
    expect(expired.ranked[0].reasons.some((x) => x.code === 'pantry')).toBe(false)
    const far = rankCandidates(
      meal(),
      [soup],
      ctx({ pantry: [{ name: 'squash', expiresOn: '2026-12-30' }] }),
    )
    expect(far.ranked[0].reasons.some((x) => x.code === 'pantry')).toBe(false)
    const none = rankCandidates(meal(), [soup], ctx({ pantry: [{ name: 'squash' }] }))
    expect(none.ranked[0].reasons.some((x) => x.code === 'pantry')).toBe(false)
  })

  it('a sooner expiry is a bigger boost', () => {
    const delta = (expiresOn: string) =>
      rankCandidates(
        meal(),
        [soup],
        ctx({ pantry: [{ name: 'squash', expiresOn }] }),
      ).ranked[0].reasons.find((r) => r.code === 'pantry')!.delta
    expect(delta('2026-11-13')).toBeGreaterThan(delta('2026-11-16'))
  })

  it('chametz pantry items are used up before the Pesach cutoff, and unusable after it', () => {
    const pasta = dish('pasta', 'Pasta salad', 'parve', [ing('macaroni', { flags: ['chametz'] })], {
      course: 'side',
    })
    const pantry = [{ name: 'macaroni', chametz: true }]
    const before = rankCandidates(
      meal({ date: '2027-04-18' }),
      [pasta],
      ctx({ today: '2027-04-15', pantry, chametzCutoff: '2027-04-21' }),
    )
    expect(before.ranked[0].reasons.map((r) => r.text)).toContain(
      'Uses macaroni expiring Wednesday',
    )
    const after = rankCandidates(
      meal({ date: '2027-04-23' }),
      [pasta],
      ctx({ today: '2027-04-15', pantry, chametzCutoff: '2027-04-21' }),
    )
    expect(after.ranked[0].reasons.some((r) => r.code === 'pantry')).toBe(false)
  })
})

describe('rankCandidates: occasion, course, hidden', () => {
  it('occasion fit', () => {
    const cholent = dish('cholent', 'Cholent', 'meat', [ing('beef', { category: 'meat' })], {
      course: 'main',
      occasionFit: { shabbat_day: 'especially_suited', shabbat_night: 'fine' },
    })
    const stew = dish('stew', 'Stew', 'meat', [ing('beef', { category: 'meat' })], {
      course: 'main',
      occasionFit: { shabbat_day: 'good' },
    })
    const r = rankCandidates(meal(), [stew, cholent], ctx({ occasions: ['shabbat_day'] }))
    expect(ids(r)).toEqual(['cholent', 'stew'])
    expect(r.ranked[0].reasons.map((x) => x.text)).toContain('Especially suited to shabbat day')
    expect(r.ranked[1].reasons.map((x) => x.text)).toContain('Good for shabbat day')
  })

  it('only ranks the requested course', () => {
    const r = rankCandidates(meal(), [kugel, soup, rice], ctx({ course: 'side' }))
    expect(ids(r).sort()).toEqual(['kugel', 'rice'])
  })

  it('hides dishes that do not fit, with why, and keeps flexible eat-around ones', () => {
    const tahini = dish(
      'tahini',
      'Tahini salad',
      'parve',
      [ing('tahini', { allergens: ['sesame'] })],
      { course: 'salad' },
    )
    const cilantro = dish(
      'cil',
      'Cilantro slaw',
      'parve',
      [ing('cilantro', { skipImpact: 'ruins' })],
      { course: 'salad' },
    )
    const g = person('george', 'George', [
      constraint(
        { type: 'ingredient', value: 'cilantro' },
        { severity: 'flexible', kind: 'preference' },
      ),
    ])
    const r = rankCandidates(meal({ attendees: [g, noa] }), [tahini, cilantro], ctx())
    expect(r.hidden).toHaveLength(1)
    expect(r.hidden[0].dish.id).toBe('tahini')
    expect(r.hidden[0].why[0]).toBe('Noa (sesame allergy): Tahini salad contains sesame (tahini)')
    expect(ids(r)).toEqual(['cil'])
    expect(r.ranked[0].reasons.some((x) => x.code === 'eat_around' && x.delta < 0)).toBe(true)
  })

  it('does not offer what is already on the menu', () => {
    const r = rankCandidates(meal({ selected: [kugel] }), [kugel, rice], ctx())
    expect(ids(r)).toEqual(['rice'])
  })
})

describe('suggestMenu', () => {
  const brisket = dish('brisket', 'Brisket', 'meat', [ing('beef', { category: 'meat' })], {
    course: 'main',
    form: 'roast',
    difficulty: 'easy',
  })
  const chicken = dish('chicken', 'Roast chicken', 'meat', [ing('chicken', { category: 'meat' })], {
    course: 'main',
    form: 'roast',
    difficulty: 'easy',
  })
  const lasagna = dish('lasagna', 'Lasagna', 'dairy', [ing('cheese', { category: 'dairy' })], {
    course: 'main',
  })
  const kugel2 = dish('kugel2', 'Sweet potato kugel', 'parve', [ing('sweet potato')], {
    course: 'side',
    form: 'kugel',
  })
  const greenBeans = dish('beans', 'Green beans', 'parve', [ing('green beans')], {
    course: 'side',
    form: 'veg',
  })
  const salad = dish('salad', 'Israeli salad', 'parve', [ing('cucumber')], {
    course: 'salad',
    form: 'salad',
  })
  const cheesecake = dish(
    'cheesecake',
    'Cheesecake',
    'dairy',
    [ing('cream cheese', { category: 'dairy' })],
    { course: 'dessert' },
  )
  const sorbet = dish('sorbet', 'Lemon sorbet', 'parve', [ing('lemon')], { course: 'dessert' })

  const all = [
    brisket,
    chicken,
    lasagna,
    kugel,
    kugel2,
    rice,
    greenBeans,
    salad,
    cheesecake,
    sorbet,
  ]

  it('fills a balanced set that is consistent: a meat main means a parve dessert', () => {
    const likes = [
      { personId: 'george', versionId: 'brisket', type: 'like' as const },
      { personId: 'george', versionId: 'cheesecake', type: 'like' as const },
    ]
    const s = suggestMenu(meal(), all, ctx({ reactions: likes }))
    expect(s.unfilled).toEqual([])
    expect(s.menu.map((m) => m.course)).toEqual(['main', 'side', 'side', 'salad', 'dessert'])
    expect(s.menu[0].dish.id).toBe('brisket')
    expect(s.menu[4].dish.id).toBe('sorbet') // cheesecake would mix with the brisket
    const sides = s.menu.filter((m) => m.course === 'side').map((m) => m.dish.id)
    expect(new Set(sides).size).toBe(2)
    // Variety: not two kugels when another form is available.
    expect(sides.filter((id) => id === 'kugel' || id === 'kugel2').length).toBeLessThanOrEqual(1)
  })

  it('respects the people coming', () => {
    const tahiniSide = dish(
      't',
      'Tahini slaw',
      'parve',
      [ing('tahini', { allergens: ['sesame'] })],
      { course: 'salad' },
    )
    const s = suggestMenu(meal({ attendees: [noa] }), [...all, tahiniSide], ctx())
    expect(s.menu.find((m) => m.course === 'salad')!.dish.id).toBe('salad')
  })

  it('works with what is already on the menu and reports slots it cannot fill', () => {
    const s = suggestMenu(
      meal({ selected: [lasagna] }),
      [lasagna, brisket, salad, sorbet, cheesecake],
      ctx(),
      {
        plan: [{ course: 'main' }, { course: 'salad' }, { course: 'side' }],
      },
    )
    // The main slot has only meat options, which clash with the dairy lasagna.
    expect(s.unfilled).toEqual(['main', 'side'])
    expect(s.menu.map((m) => m.dish.id)).toEqual(['salad'])
  })

  it('limits hard dishes', () => {
    const hard1 = dish('h1', 'Hard main', 'meat', [ing('beef', { category: 'meat' })], {
      course: 'main',
      difficulty: 'a_pain',
    })
    const hard2 = dish('h2', 'Hard side', 'parve', [ing('x')], {
      course: 'side',
      difficulty: 'a_pain',
    })
    const easy = dish('e', 'Easy side', 'parve', [ing('y')], { course: 'side', difficulty: 'easy' })
    const s = suggestMenu(meal(), [hard1, hard2, easy], ctx(), {
      plan: [{ course: 'main' }, { course: 'side' }],
    })
    expect(s.menu.map((m) => m.dish.id)).toEqual(['h1', 'e'])
  })
})

function addDaysTo(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('rankCandidates: kids at the table', () => {
  const nuggets = dish('nuggets', 'Schnitzel bites', 'parve', [ing('flour')], {
    course: 'side',
    occasionFit: { kids_love_it: 'especially_suited' },
  })
  const kid = { ...person('dani', 'Dani'), age: 5 }

  it('raises kid favourites only when a kid is coming', () => {
    const withKid = rankCandidates(meal({ attendees: [george, kid] }), [kugel, nuggets], ctx())
    expect(ids(withKid)[0]).toBe('nuggets')
    expect(withKid.ranked[0].reasons.some((r) => r.code === 'kids')).toBe(true)
    const adults = rankCandidates(meal(), [kugel, nuggets], ctx())
    expect(
      adults.ranked.find((r) => r.dish.id === 'nuggets')!.reasons.some((r) => r.code === 'kids'),
    ).toBe(false)
  })
  it('raises a dish flagged kid friendly when a kid is coming', () => {
    const rice = {
      ...dish('rice', 'Plain rice', 'parve', [ing('rice')], { course: 'side' }),
      flags: ['kid_friendly'],
    }
    const r = rankCandidates(meal({ attendees: [george, kid] }), [kugel, rice], ctx())
    expect(ids(r)[0]).toBe('rice')
    expect(r.ranked[0].reasons.some((x) => x.code === 'kids')).toBe(true)
  })
  it('a teenager is not a kid', () => {
    const teen = { ...person('teen', 'Teen'), age: 14 }
    const r = rankCandidates(meal({ attendees: [teen] }), [nuggets], ctx())
    expect(r.ranked[0].reasons.some((x) => x.code === 'kids')).toBe(false)
  })
})
