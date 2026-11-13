/**
 * The demo build's Plan tab: a small in-memory model of weeks, runs and hosted meals. It imitates the worker's shapes
 * (docs/plan-redesign-contract.md) with simplified logic: three fixed runs (two Shabbatot in November 2026 and Pesach
 * 2027, New York) and no dining brief, so problems are always empty. Real behaviour lives in the worker.
 */
import { addDays, hebrewDate, rangeDays, weekday } from '@/lib/dates'

import { holidaysOn, parashaOn, TODAY } from './mock-data'
import type {
  AddDishInput,
  UpdateDishInput,
  DaySlot,
  GuestHousehold,
  HostedCourse,
  HostedMeal,
  HostedPage,
  Household,
  Id,
  ISODate,
  MealCard,
  MealPatch,
  MealRecipeSearch,
  NewMealInput,
  PlanView,
  RunHolyDay,
  RunSummary,
  WeekDay,
} from './types'

const SLOTS: DaySlot[] = [
  'breakfast',
  'kiddush',
  'brunch',
  'lunch',
  'seudah_shlishit',
  'dinner',
  'oneg',
]
const LABEL: Record<DaySlot, string> = {
  breakfast: 'Breakfast',
  kiddush: 'Kiddush',
  brunch: 'Brunch',
  lunch: 'Lunch',
  seudah_shlishit: 'Seudah shlishit',
  dinner: 'Dinner',
  oneg: 'Oneg',
}
const NIGHT: DaySlot[] = ['dinner', 'oneg']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DISCLAIMER =
  "Tavshil helps you avoid serving the wrong thing, but it is not a guarantee. It's on the host: check labels, and confirm allergies with the guest."
const NO_PROBLEMS = { allergies: 0, gaps: 0, other: 0, total: 0 }

interface Run {
  key: string
  title: string
  days: { date: ISODate; label: string; yomTov: boolean; night: string; day: string }[]
}

const RUNS: Run[] = [
  {
    key: 'run-2026-11-14',
    title: 'Shabbat Toldot',
    days: [
      {
        date: '2026-11-14',
        label: 'Shabbat',
        yomTov: false,
        night: 'Leil Shabbat',
        day: 'Shabbat day',
      },
    ],
  },
  {
    key: 'run-2026-11-21',
    title: 'Shabbat Vayetzei',
    days: [
      {
        date: '2026-11-21',
        label: 'Shabbat',
        yomTov: false,
        night: 'Leil Shabbat',
        day: 'Shabbat day',
      },
    ],
  },
  {
    key: 'run-2027-04-22',
    title: 'Pesach · first days',
    days: [
      { date: '2027-04-22', label: 'Pesach I', yomTov: true, night: 'Seder I', day: 'Yom Tov day' },
      {
        date: '2027-04-23',
        label: 'Pesach II',
        yomTov: true,
        night: 'Seder II',
        day: 'Yom Tov day',
      },
      {
        date: '2027-04-24',
        label: 'Shabbat',
        yomTov: false,
        night: 'Leil Shabbat',
        day: 'Shabbat day',
      },
    ],
  },
]

interface MockItem {
  id: Id
  course: string
  title: string
  recipeId: Id | null
  broughtBy?: string
}
interface MockMeal {
  id: Id
  date: ISODate
  slot: DaySlot
  name: string
  nameEdited: boolean
  time: string | null
  hosted: boolean
  guestOf?: string
  /** Household id to the person ids present. A household with no entry for itself means everyone (the host). */
  guests: Record<Id, Id[]>
  items: MockItem[]
}

let seq = 1
const nid = (p: string) => `${p}-${seq++}`
const OWN = 'h-us'

let households: () => Household[] = () => []
/** The mock hands in its households so the plan model reads the same people. */
export function bindHouseholds(read: () => Household[]) {
  households = read
}

const state: MockMeal[] = [
  {
    id: 'pm-1',
    date: TODAY,
    slot: 'dinner',
    name: 'Dinner',
    nameEdited: false,
    time: null,
    hosted: false,
    guests: {},
    items: [
      { id: 'pi-1', course: 'main', title: 'Pasta bake', recipeId: null },
      { id: 'pi-2', course: 'main', title: 'Green salad', recipeId: null },
    ],
  },
  {
    id: 'pm-2',
    date: '2026-11-13',
    slot: 'dinner',
    name: 'Leil Shabbat',
    nameEdited: false,
    time: null,
    hosted: true,
    guests: {},
    items: [{ id: 'pi-3', course: 'main', title: 'Roast chicken', recipeId: null }],
  },
]

const holyOf = (m: Pick<MockMeal, 'date' | 'slot'>) => {
  const part = NIGHT.includes(m.slot) ? ('night' as const) : ('day' as const)
  const target = part === 'night' ? addDays(m.date, 1) : m.date
  for (const run of RUNS) {
    const day = run.days.find((d) => d.date === target)
    if (day) return { run, day, part }
  }
  return null
}

const countsText = (c: { adults: number; children: number }) =>
  [
    c.adults && `${c.adults} ${c.adults === 1 ? 'adult' : 'adults'}`,
    c.children && `${c.children} ${c.children === 1 ? 'child' : 'children'}`,
  ]
    .filter(Boolean)
    .join(', ')

function guestViews(m: MockMeal): GuestHousehold[] {
  const view = (id: Id, present: Id[] | null): GuestHousehold | null => {
    const h = households().find((x) => x.id === id)
    if (!h) return null
    const members = h.people.map((p) => ({
      personId: p.id,
      name: p.name,
      isChild: !!p.isChild,
      present: present === null || present.includes(p.id),
      constraints: p.constraints.map((c) => ({
        text: c.label,
        strict: c.severity === 'strict',
        strictAllergy: c.tagType === 'allergen' && c.severity === 'strict',
      })),
    }))
    const adults = members.filter((x) => x.present && !x.isChild).length
    const children = members.filter((x) => x.present && x.isChild).length
    const away = members.filter((x) => !x.present).map((x) => x.name)
    return {
      householdId: id,
      name: h.name,
      isHost: id === OWN,
      members,
      counts: { adults, children, total: adults + children },
      countsText: countsText({ adults, children }),
      awayText: away.length ? `${away.join(' and ')} away` : '',
      constraints: [
        ...new Map(members.flatMap((x) => x.constraints).map((c) => [c.text, c])).values(),
      ],
      removable: id !== OWN,
    }
  }
  const own = view(OWN, m.guests[OWN] ?? null)
  const others = Object.keys(m.guests)
    .filter((id) => id !== OWN)
    .map((id) => view(id, m.guests[id]))
  return [own, ...others].filter((x): x is GuestHousehold => !!x)
}

function groups(m: MockMeal): HostedCourse[] {
  const base = ['main', 'side', 'dessert']
  const rank = (c: string) => (base.includes(c) ? base.indexOf(c) : 1.5)
  return [...new Set([...base, ...m.items.map((i) => i.course)])]
    .sort((a, b) => rank(a) - rank(b))
    .map((course) => ({
      course,
      label: course === 'side' ? 'Sides' : course.charAt(0).toUpperCase() + course.slice(1),
      items: m.items
        .filter((i) => i.course === course)
        .map((i, position) => ({
          itemId: i.id,
          position,
          course: i.course,
          title: i.title,
          recipeId: i.recipeId,
          versionId: null,
          versionTitle: null,
          kashrut: null,
          noRecipe: !i.recipeId,
          broughtBy: i.broughtBy ?? null,
          problems: [],
        })),
    }))
}

function card(m: MockMeal): MealCard {
  const holy = holyOf(m)
  const hs = guestViews(m)
  const adults = hs.reduce((n, h) => n + h.counts.adults, 0)
  const children = hs.reduce((n, h) => n + h.counts.children, 0)
  const guests = hs.filter((h) => !h.isHost)
  const away = hs.flatMap((h) => h.members.filter((x) => !x.present).map((x) => x.name))
  const main = m.items.filter((i) => i.course === 'main')
  const first = groups(m).find((g) => g.items.length)
  const lead = main.length ? main : first ? m.items.filter((i) => i.course === first.course) : []
  return {
    id: m.id,
    virtual: false,
    create: null,
    date: m.date,
    slot: m.slot,
    slotLabel: LABEL[m.slot],
    name: m.name,
    nameEdited: m.nameEdited,
    time: m.time ? +m.time.slice(0, 2) * 60 + +m.time.slice(3) : null,
    timeText: m.time,
    status: 'draft',
    kind: null,
    hosted: m.hosted || !!holy || guests.length > 0,
    guestOf: m.guestOf ?? null,
    runKey: holy?.run.key ?? null,
    hostedKey: holy?.run.key ?? `meal-${m.id}`,
    holyDate: holy?.day.date ?? null,
    part: holy?.part ?? null,
    summary: lead.map((i) => i.title),
    itemCount: m.items.length,
    planned: m.items.length > 0,
    headcount: { adults, children, total: adults + children },
    headcountText: countsText({ adults, children }),
    awayText: away.length ? `${away.join(' and ')} away` : '',
    guestHouseholds: guests.length,
    hasGuests: guests.length > 0,
    problems: NO_PROBLEMS,
  }
}

function hostedMeal(m: MockMeal): HostedMeal {
  return {
    ...card(m),
    menu: groups(m),
    households: guestViews(m),
    problemDetails: { problems: [], aiNotes: [], unchecked: [], counts: NO_PROBLEMS },
    foodNotes: [],
    disclaimer: DISCLAIMER,
  }
}

function virtualCard(run: Run, d: Run['days'][number], part: 'night' | 'day'): MealCard {
  const slot: DaySlot = part === 'night' ? 'dinner' : 'lunch'
  const date = part === 'night' ? addDays(d.date, -1) : d.date
  const people = households().find((h) => h.id === OWN)?.people ?? []
  const adults = people.filter((p) => !p.isChild).length
  const children = people.length - adults
  const name = part === 'night' ? d.night : d.day
  return {
    id: null,
    virtual: true,
    create: { date, slot, name },
    date,
    slot,
    slotLabel: LABEL[slot],
    name,
    nameEdited: false,
    time: null,
    timeText: null,
    status: 'draft',
    kind: null,
    hosted: true,
    guestOf: null,
    runKey: run.key,
    hostedKey: run.key,
    holyDate: d.date,
    part,
    summary: [],
    itemCount: 0,
    planned: false,
    headcount: { adults, children, total: adults + children },
    headcountText: countsText({ adults, children }),
    awayText: '',
    guestHouseholds: 0,
    hasGuests: false,
    problems: NO_PROBLEMS,
  }
}

const order = (
  a: { slot: DaySlot; time: number | null },
  b: { slot: DaySlot; time: number | null },
  holy: boolean,
) => {
  const r = (s: DaySlot) => (holy && !NIGHT.includes(s) ? 10 : 0) + SLOTS.indexOf(s)
  return r(a.slot) - r(b.slot) || (a.time ?? 1e9) - (b.time ?? 1e9)
}

/** Cards (and placeholders for the default meals that do not exist yet) of each holy day of a run. */
function runDays<T extends MealCard>(
  run: Run,
  build: (m: MockMeal) => T,
  placeholder: (c: MealCard) => T,
): { day: Run['days'][number]; meals: T[] }[] {
  return run.days.map((day) => {
    const meals: T[] = state
      .filter((m) => holyOf(m)?.day.date === day.date && holyOf(m)?.run.key === run.key)
      .map(build)
    for (const part of ['night', 'day'] as const) {
      const slot = part === 'night' ? 'dinner' : 'lunch'
      if (!meals.some((x) => x.part === part && x.slot === slot))
        meals.push(placeholder(virtualCard(run, day, part)))
    }
    return { day, meals: meals.sort((a, b) => order(a, b, true)) }
  })
}

function plan(from: ISODate, to: ISODate): PlanView {
  const runs: RunSummary[] = RUNS.filter(
    (r) => r.days[r.days.length - 1].date >= from && addDays(r.days[0].date, -1) <= to,
  ).map((r) => {
    const holyDays: RunHolyDay[] = runDays(r, card, (c) => c).map(({ day, meals }) => ({
      date: day.date,
      eveDate: addDays(day.date, -1),
      label: day.label,
      isShabbat: !day.yomTov,
      isYomTov: day.yomTov,
      isCholHamoed: false,
      meals,
    }))
    const all = holyDays.flatMap((d) => d.meals)
    return {
      key: r.key,
      title: r.title,
      from: r.days[0].date,
      to: r.days[r.days.length - 1].date,
      startsOn: addDays(r.days[0].date, -1),
      holyDays,
      mealCount: all.length,
      toPlan: all.filter((m) => !m.planned).length,
      problems: { allergies: 0, gaps: 0, total: 0 },
    }
  })
  const pairs = RUNS.flatMap((r) => r.days.map((d) => ({ r, d })))
  const days: WeekDay[] = rangeDays(from, to).map((date) => {
    const holy = pairs.find((x) => x.d.date === date)
    const eve = pairs.find((x) => addDays(x.d.date, -1) === date)
    const eveMeal = eve
      ? state.find((m) => holyOf(m)?.day.date === eve.d.date && m.slot === 'dinner')
      : undefined
    const wd = weekday(date)
    return {
      date,
      weekday: wd,
      isToday: date === TODAY,
      hebrew: hebrewDate(date),
      parasha: parashaOn(date) ?? null,
      holidays: holidaysOn(date).map((h) => ({
        name: h.name,
        kind: h.type === 'civil' ? ('civil' as const) : ('jewish' as const),
      })),
      isShabbat: wd === 6,
      isYomTov: !!holy?.d.yomTov,
      isCholHamoed: false,
      isErevShabbat: wd === 5,
      isErevYomTov: !!eve?.d.yomTov,
      candleLighting: eve ? { minutes: 981, text: '4:21' } : null,
      havdalah: null,
      holyDay: holy ? { runKey: holy.r.key, label: holy.d.label } : null,
      eve: eve
        ? {
            runKey: eve.r.key,
            holyDate: eve.d.date,
            mealName: eve.d.night,
            holyDayLabel: eve.d.label,
            meal: eveMeal ? card(eveMeal) : null,
          }
        : null,
      meals: state
        .filter((m) => m.date === date && !holyOf(m))
        .map(card)
        .sort((a, b) => order(a, b, false)),
    }
  })
  return {
    today: TODAY,
    from,
    to,
    location: { timeZone: 'America/New_York', israel: false },
    parasha: days.find((d) => d.parasha)?.parasha ?? null,
    days,
    runs,
  }
}

const find = (id: Id): MockMeal => {
  const m = state.find((x) => x.id === id)
  if (!m) throw new Error('Meal not found')
  return m
}

const emptyHosted = (c: MealCard): HostedMeal => ({
  ...c,
  menu: groups({ items: [] } as unknown as MockMeal),
  households: guestViews({ guests: {} } as MockMeal),
  problemDetails: { problems: [], aiNotes: [], unchecked: [], counts: NO_PROBLEMS },
  foodNotes: [],
  disclaimer: DISCLAIMER,
})

function hostedPage(key: string): HostedPage {
  const mealRow = key.startsWith('meal-') ? state.find((x) => `meal-${x.id}` === key) : undefined
  const run = RUNS.find((r) => r.key === (mealRow ? holyOf(mealRow)?.run.key : key))
  const base = {
    today: TODAY,
    location: { timeZone: 'America/New_York', israel: false },
    paper: 'letter' as const,
    fixes: [],
    disclaimer: DISCLAIMER,
  }
  if (run) {
    const days = runDays(run, hostedMeal, emptyHosted).map(({ day, meals }) => ({
      date: day.date,
      label: day.label,
      isShabbat: !day.yomTov,
      isYomTov: day.yomTov,
      meals,
    }))
    const all = days.flatMap((d) => d.meals)
    return {
      ...base,
      key: run.key,
      type: 'run',
      title: run.title,
      from: run.days[0].date,
      to: run.days[run.days.length - 1].date,
      startsOn: addDays(run.days[0].date, -1),
      days,
      totals: {
        meals: all.length,
        toPlan: all.filter((m) => !m.planned).length,
        withGuests: all.filter((m) => m.hasGuests).length,
        withProblems: 0,
      },
    }
  }
  const m = mealRow ?? find(key.replace(/^meal-/, ''))
  return {
    ...base,
    key: `meal-${m.id}`,
    type: 'meal',
    title: m.name,
    from: m.date,
    to: m.date,
    startsOn: m.date,
    days: [{ date: m.date, label: '', isShabbat: false, isYomTov: false, meals: [hostedMeal(m)] }],
    totals: {
      meals: 1,
      toPlan: m.items.length ? 0 : 1,
      withGuests: Object.keys(m.guests).some((id) => id !== OWN) ? 1 : 0,
      withProblems: 0,
    },
  }
}

const autoName = (m: MockMeal) =>
  `${WEEKDAYS[new Date(`${m.date}T00:00:00Z`).getUTCDay()]} ${LABEL[m.slot].toLowerCase()}`

export const mockPlan = {
  getWeek: (date?: ISODate): PlanView => {
    const d = date ?? TODAY
    const from = addDays(d, -weekday(d))
    return plan(from, addDays(from, 6))
  },
  getPlan: (r: { from: ISODate; to: ISODate }) => plan(r.from, r.to),
  getHosted: hostedPage,
  getHostedMeal: (id: Id) => hostedMeal(find(id)),
  ensureRunMeal: (input: { runKey: string; holyDate: ISODate; part: 'night' | 'day' }) => {
    const run = RUNS.find((r) => r.key === input.runKey)
    const d = run?.days.find((x) => x.date === input.holyDate)
    if (!run || !d) throw new Error('Holy day not found')
    const slot: DaySlot = input.part === 'night' ? 'dinner' : 'lunch'
    const date = input.part === 'night' ? addDays(d.date, -1) : d.date
    const have = state.find((m) => m.date === date && m.slot === slot)
    if (have) return { mealId: have.id, created: false, hostedKey: run.key }
    const m: MockMeal = {
      id: nid('pm'),
      date,
      slot,
      name: input.part === 'night' ? d.night : d.day,
      nameEdited: false,
      time: null,
      hosted: true,
      guests: {},
      items: [],
    }
    state.push(m)
    return { mealId: m.id, created: true, hostedKey: run.key }
  },
  createPlanMeal: (input: NewMealInput) => {
    const hosted = !!input.hosted || !!input.householdIds?.length
    const m: MockMeal = {
      id: nid('pm'),
      date: input.date,
      slot: input.slot ?? 'dinner',
      name: '',
      nameEdited: !!input.name?.trim(),
      time: input.time ?? null,
      hosted,
      guests: Object.fromEntries(
        (input.householdIds ?? []).map((id) => [
          id,
          households()
            .find((h) => h.id === id)
            ?.people.map((p) => p.id) ?? [],
        ]),
      ),
      items: [],
    }
    m.name = input.name?.trim() || (hosted ? autoName(m) : LABEL[m.slot])
    state.push(m)
    return hostedMeal(m)
  },
  updatePlanMeal: (id: Id, patch: MealPatch) => {
    const m = find(id)
    if (patch.name !== undefined) {
      m.name = patch.name
      m.nameEdited = true
    }
    if (patch.time !== undefined) m.time = patch.time || null
    if (patch.slot) m.slot = patch.slot
    if (patch.date) m.date = patch.date
    if (patch.hosted !== undefined) m.hosted = patch.hosted
    if (patch.guestOf !== undefined) m.guestOf = patch.guestOf?.trim() || undefined
    if (!m.nameEdited && !holyOf(m)) m.name = m.hosted ? autoName(m) : LABEL[m.slot]
    return hostedMeal(m)
  },
  deleteMeal: (id: Id) => {
    const i = state.findIndex((m) => m.id === id)
    if (i >= 0) state.splice(i, 1)
  },
  addMealHousehold: (id: Id, householdId: Id) => {
    const m = find(id)
    m.guests[householdId] =
      households()
        .find((h) => h.id === householdId)
        ?.people.map((p) => p.id) ?? []
    m.hosted = true
    if (!m.nameEdited && !holyOf(m)) m.name = autoName(m)
    return hostedMeal(m)
  },
  removeMealHousehold: (id: Id, householdId: Id) => {
    const m = find(id)
    delete m.guests[householdId]
    return hostedMeal(m)
  },
  setMealPerson: (id: Id, personId: Id, present: boolean) => {
    const m = find(id)
    const h = households().find((x) => x.people.some((p) => p.id === personId))
    if (!h) throw new Error('Person not found')
    const cur = m.guests[h.id] ?? h.people.map((p) => p.id)
    m.guests[h.id] = present ? [...new Set([...cur, personId])] : cur.filter((x) => x !== personId)
    if (h.id !== OWN) m.hosted = true
    return hostedMeal(m)
  },
  addMealDish: (id: Id, dish: AddDishInput) => {
    const m = find(id)
    m.items.push({
      id: nid('pi'),
      course: dish.course,
      title: dish.description ?? (dish.broughtBy ? `A ${dish.course}` : 'Recipe'),
      recipeId: dish.versionId ?? null,
      broughtBy: dish.broughtBy,
    })
    return hostedMeal(m)
  },
  updateMealDish: (id: Id, itemId: Id, change: UpdateDishInput) => {
    const m = find(id)
    const it = m.items.find((i) => i.id === itemId)
    if (it) {
      if (change.description !== undefined) it.title = change.description
      if (change.broughtBy !== undefined) it.broughtBy = change.broughtBy ?? undefined
    }
    return hostedMeal(m)
  },
  removeMealDish: (id: Id, itemId: Id) => {
    const m = find(id)
    m.items = m.items.filter((i) => i.id !== itemId)
    return hostedMeal(m)
  },
  moveMealDish: (id: Id, itemId: Id, to: { course: string; beforeItemId?: Id }) => {
    const m = find(id)
    const it = m.items.find((i) => i.id === itemId)
    if (it) {
      it.course = to.course
      m.items = m.items.filter((i) => i !== it)
      const at = to.beforeItemId ? m.items.findIndex((i) => i.id === to.beforeItemId) : -1
      m.items.splice(at < 0 ? m.items.length : at, 0, it)
    }
    return hostedMeal(m)
  },
  /** The demo has no constraint engine: it returns nothing. */
  searchRecipesForMeal: (id: Id): MealRecipeSearch => ({
    mealId: id,
    attendees: [],
    fits: [],
    excluded: [],
    total: 0,
    disclaimer: DISCLAIMER,
  }),
}
