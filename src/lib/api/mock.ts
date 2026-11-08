/**
 * In-memory implementation of BishulApi. It imitates what the server will do (dining brief,
 * ranking, shopping math, prep schedule) with simplified logic, so the UI can be clicked through.
 */
import {
  addDays,
  diffDays,
  hebrewDate,
  rangeDays,
  shortDate,
  weekday,
  weekdayName,
} from '@/lib/dates'
import { DISCLAIMER } from '@/lib/strings'
import { formatAmount } from '@/lib/units'

import type { BishulApi } from './client'
import { bindHouseholds, mockPlan } from './mock-plan'
import {
  buildHouseholds,
  buildMeals,
  buildPantry,
  buildRecipes,
  DEFAULT_COLLECTIONS,
  HOST_HOUSEHOLD,
  holidaysOn,
  parashaOn,
  TODAY,
  type PantryRow,
} from './mock-data'
import type {
  BriefLine,
  CalendarDay,
  Collection,
  Constraint,
  CookingTask,
  Course,
  DiningBrief,
  Household,
  HiddenDish,
  Id,
  ISODate,
  IngredientLine,
  Kind,
  Meal,
  MealChip,
  MealDetail,
  MealItem,
  MealPerson,
  MealReview,
  Occasion,
  OccasionDay,
  PantryList,
  Person,
  PrepDay,
  PrepTask,
  Reason,
  Recipe,
  RecipeFilters,
  RecipeSummary,
  RecipeVersion,
  ShoppingLine,
  Suggestion,
  SuggestionResult,
} from './types'

// ---- State ----

const households: Household[] = buildHouseholds()
bindHouseholds(() => households)
const recipes: Recipe[] = buildRecipes()
let meals: Meal[] = buildMeals()
let pantry: PantryRow[] = buildPantry()
let collections: Collection[] = [...DEFAULT_COLLECTIONS]
const shop = { checked: new Set<string>(), order: [] as string[], custom: [] as ShoppingLine[] }
let seq = 100

const PESACH_2027 = ['2027-04-21', '2027-04-29']

const allPeople = (): Person[] => households.flatMap((h) => h.people)
const personById = (id: Id): Person | undefined => allPeople().find((p) => p.id === id)
const hostPeople = (): Person[] => households.find((h) => h.id === HOST_HOUSEHOLD)?.people ?? []
const delay = <T>(v: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(structuredClone(v)), 15))
const nextId = (p: string) => `${p}-${++seq}`

// Serving history: the Levins have had these recently.
const SERVED: Record<Id, ISODate> = {
  'v-sweet-kugel': '2026-10-31',
  'v-cholent': '2026-10-24',
  'v-silan': '2026-10-24',
  'v-soup': '2026-10-24',
  'v-brisket': '2026-10-03',
  'v-pasta-bake': '2026-10-20',
  'v-potato-kugel': '2026-09-05',
  'v-brownies-cakey': '2026-10-17',
  'v-brownies-fudgy': '2026-09-12',
  'v-israeli-salad': '2026-11-06',
  'v-sufganiyot': '2025-12-20',
  'v-lentil-soup': '2026-09-28',
}
function seedServed() {
  for (const h of households) {
    for (const p of h.people) {
      p.served = Object.entries(SERVED)
        .filter(
          ([vid]) => p.householdId === HOST_HOUSEHOLD || vid === 'v-silan' || vid === 'v-cholent',
        )
        .map(([versionId, date]) => ({
          versionId,
          date,
          title: versionById(versionId)?.title ?? versionId,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    }
  }
}
function versionById(id: Id): (RecipeVersion & { title: string; course: Course }) | undefined {
  for (const r of recipes) {
    const v = r.versions.find((x) => x.id === id)
    if (v) return { ...v, title: r.title, course: r.course }
  }
}
const recipeById = (id: Id) => recipes.find((r) => r.id === id)
function lastServedOf(r: Recipe): ISODate | undefined {
  const dates = r.versions.map((v) => SERVED[v.id]).filter(Boolean)
  return dates.sort().pop()
}
seedServed()

// ---- Constraint evaluation ----

function activeOn(c: Constraint, date: ISODate): boolean {
  if (c.activeWhen === 'always') return true
  if (c.activeWhen === 'Pesach') return date >= PESACH_2027[0] && date <= PESACH_2027[1]
  return false
}
const activeConstraints = (p: Person, date: ISODate) =>
  p.constraints.filter((c) => activeOn(c, date))

interface Verdict {
  /** Strict reason this dish is ruled out for these guests. */
  hidden?: string
  adjustments: string[]
  warnings: string[]
  sourcing: { tag: string; person: string; text: string }[]
}

function lineMatches(l: IngredientLine, tag: string): boolean {
  return (
    l.allergens.includes(tag) ||
    l.flags.includes(tag) ||
    l.name.toLowerCase().includes(tag.toLowerCase())
  )
}

function evaluate(v: RecipeVersion, people: Person[], date: ISODate, mealKind: Kind): Verdict {
  const out: Verdict = { adjustments: [], warnings: [], sourcing: [] }
  if (v.kind !== 'parve' && v.kind !== mealKind) {
    out.hidden = `${cap(v.kind)} dish; this is a ${mealKind} meal`
    return out
  }
  const host = hostPeople()
  for (const p of people) {
    for (const c of activeConstraints(p, date)) {
      if (c.tagType === 'kashrut-sourcing') {
        const stricter = !host.some((h) => activeConstraints(h, date).some((x) => x.tag === c.tag))
        const hasMeat = v.ingredients.some((l) => l.flags.includes('meat'))
        const hasDairy = v.ingredients.some((l) => l.flags.includes('dairy'))
        if (stricter && c.tag === 'glatt' && hasMeat)
          out.sourcing.push({ tag: c.tag, person: p.name, text: 'Glatt' })
        if (stricter && c.tag === 'chalav-yisrael' && hasDairy)
          out.sourcing.push({ tag: c.tag, person: p.name, text: 'Chalav Yisrael' })
        continue
      }
      if (c.tagType === 'combination') {
        const fish = v.ingredients.some((l) => l.flags.includes('fish'))
        const dairy = v.ingredients.some((l) => l.flags.includes('dairy'))
        if (c.tag === 'no-fish-dairy' && fish && dairy)
          out.hidden = out.hidden ?? `Combines fish and dairy (${p.name}: ${c.label.toLowerCase()})`
        continue
      }
      const hits = v.ingredients.filter((l) => lineMatches(l, c.tag))
      for (const l of hits) {
        if (c.severity === 'strict') {
          out.hidden =
            out.hidden ?? `Contains ${l.name.toLowerCase()} — ${p.name} (${c.label.toLowerCase()})`
        } else if (l.skipImpact === 'ruins') {
          out.warnings.push(`Skipping the ${l.name.toLowerCase()} would ruin it for ${p.name}`)
        } else if (l.skipImpact === 'minor') {
          out.adjustments.push(`Skip the ${l.name.toLowerCase()} for ${p.name} (small change)`)
        } else {
          out.adjustments.push(`Leave out the ${l.name.toLowerCase()} for ${p.name}`)
        }
      }
    }
  }
  return out
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---- Meals ----

const mealById = (id: Id): Meal => {
  const m = meals.find((x) => x.id === id)
  if (!m) throw new Error(`Meal ${id} not found`)
  return m
}
const attendees = (m: Meal): Person[] => [
  ...hostPeople().filter((p) => !m.notComing.includes(p.id)),
  ...m.guestIds.map(personById).filter((p): p is Person => !!p),
]
const mealKey = (m: Meal) => `${m.date} ${m.time}`

function occasionLabel(date: ISODate): string | undefined {
  const wd = weekday(date)
  const sat = wd === 6 ? date : wd === 5 ? addDays(date, 1) : undefined
  const par = sat ? parashaOn(sat) : undefined
  const hol = holidaysOn(date).find((h) => h.type !== 'rosh-chodesh')
  if (hol) return hol.name
  return par ? `Shabbat ${par}` : undefined
}

function isShabbatMeal(m: Meal): boolean {
  const wd = weekday(m.date)
  return wd === 6 || (wd === 5 && m.time >= '16:00')
}

function buildBrief(m: Meal): DiningBrief {
  const people = attendees(m)
  const groups = new Map<string, { c: Constraint; names: string[] }>()
  for (const p of people)
    for (const c of activeConstraints(p, m.date)) {
      const key = `${c.tag}|${c.severity}`
      const g = groups.get(key) ?? { c, names: [] }
      g.names.push(p.name)
      groups.set(key, g)
    }
  const host = hostPeople()
  const lines: BriefLine[] = []
  let hasAllergy = false
  for (const [key, { c, names }] of groups) {
    const who = names.join(', ')
    if (c.tagType === 'kashrut-sourcing') {
      const stricter = !host.some((h) => activeConstraints(h, m.date).some((x) => x.tag === c.tag))
      if (!stricter) continue
      lines.push({
        id: key,
        tone: 'info',
        text: `${c.label}: buy ${c.tag === 'glatt' ? 'glatt meat' : 'chalav Yisrael dairy'} for this meal. It never rules out a dish.`,
        people: names,
      })
    } else if (c.kind === 'medical') {
      hasAllergy = hasAllergy || c.tagType === 'allergen'
      lines.push({
        id: key,
        tone: c.severity === 'strict' ? 'danger' : 'warn',
        text:
          c.severity === 'strict'
            ? `${c.label}: dishes with ${c.tag} are hidden.${c.note ? ` ${c.note}` : ''}`
            : `${c.label}: can eat around it, with a note on the dish.`,
        people: names,
      })
    } else if (c.kind === 'religious') {
      lines.push({
        id: key,
        tone: 'warn',
        text:
          c.tagType === 'combination'
            ? `${c.label}${c.note ? ` (${c.note.toLowerCase().replace(/\.$/, '')})` : ''}: no dish may combine them, and keep them out of the same meal.`
            : `${c.label}: dishes that break it are hidden.`,
        people: names,
      })
    } else {
      lines.push({
        id: key,
        tone: 'preference',
        text: `${c.label}. Dishes still show; you will see a note.`,
        people: names,
      })
    }
  }
  const order = { danger: 0, warn: 1, info: 2, preference: 3 } as const
  lines.sort((a, b) => order[a.tone] - order[b.tone])
  // Allergy checks that pass only on AI-filled ingredient data.
  if (hasAllergy) {
    const ai = new Set<string>()
    for (const it of m.items) {
      const v = it.versionId ? versionById(it.versionId) : undefined
      v?.ingredients.filter((l) => l.aiFilled).forEach((l) => ai.add(l.name.toLowerCase()))
    }
    if (ai.size)
      lines.push({
        id: 'ai-filled',
        tone: 'info',
        text: `These pass the allergy check only on AI-filled ingredient data: ${[...ai].join(', ')}. Check the labels yourself.`,
        people: [],
        aiFilled: true,
      })
  }
  lines.push({
    id: 'kind',
    tone: 'info',
    text:
      m.kind === 'parve'
        ? 'Parve meal: meat and dairy dishes are both hidden from the picker.'
        : `${cap(m.kind)} meal: ${m.kind === 'meat' ? 'dairy' : 'meat'} dishes are hidden.`,
    people: [],
  })
  return { lines, hasAllergy, disclaimer: DISCLAIMER }
}

function itemView(m: Meal, it: MealItem): MealItem {
  if (!it.versionId) return it
  const v = versionById(it.versionId)
  if (!v) return it
  const verdict = evaluate(v, attendees(m), m.date, m.kind)
  return {
    ...it,
    adjustments: [
      ...verdict.adjustments,
      ...verdict.warnings,
      ...(verdict.hidden ? [verdict.hidden] : []),
    ],
  }
}

function buildReview(m: Meal): MealReview {
  const items = m.items.map((it) => itemView(m, it))
  const issues: string[] = []
  for (const it of items)
    if (it.kind !== 'parve' && it.kind !== m.kind && m.kind !== 'parve')
      issues.push(
        `${it.title} is ${it.kind}, but this is a ${m.kind} meal. Meat and dairy can't share a meal.`,
      )
    else if (m.kind === 'parve' && it.kind !== 'parve')
      issues.push(`${it.title} is ${it.kind}, but this is a parve meal.`)
  const sourcing = new Map<string, Set<string>>()
  for (const it of m.items) {
    const v = it.versionId ? versionById(it.versionId) : undefined
    if (!v || it.broughtBy) continue
    for (const s of evaluate(v, attendees(m), m.date, m.kind).sourcing) {
      const k = `${s.text}, for ${s.person}`
      sourcing.set(k, (sourcing.get(k) ?? new Set()).add(it.title))
    }
  }
  const need = aggregate([m])
  const toBuy = need.filter((n) => n.remaining > 0).length
  const next = meals
    .filter((x) => x.id !== m.id && mealKey(x) > mealKey(m) && x.status === 'draft')
    .sort((a, b) => (mealKey(a) < mealKey(b) ? -1 : 1))[0]
  return {
    handsOnMin: m.items.filter((i) => !i.broughtBy).reduce((n, i) => n + i.activeMin, 0),
    adjustments: items.flatMap((it) => it.adjustments.map((text) => ({ item: it.title, text }))),
    issues,
    sourcing: [...sourcing].map(([k, v]) => `${k} (${[...v].join(', ')})`),
    shopping: need.length
      ? [
          `${toBuy} of ${need.length} ingredients to buy; the rest you already have to use up.`,
          ...need
            .filter((n) => n.soon)
            .map((n) => `Use your ${n.name.toLowerCase()} soon: it expires ${shortDate(n.soon!)}.`)
            .slice(0, 3),
        ]
      : [],
    nextMealId: next?.id,
    nextMealName: next ? `${next.name} (${shortDate(next.date)})` : undefined,
  }
}

const householdNameOf = (p: Person) => households.find((h) => h.id === p.householdId)?.name ?? ''

function mealDetail(id: Id): MealDetail {
  const m = mealById(id)
  const guests = m.guestIds.map(personById).filter((p): p is Person => !!p)
  const people: MealPerson[] = [
    ...hostPeople().map((person) => ({
      person,
      coming: !m.notComing.includes(person.id),
      isGuest: false,
      householdName: householdNameOf(person),
    })),
    ...guests.map((person) => ({
      person,
      coming: true,
      isGuest: true,
      householdName: householdNameOf(person),
    })),
  ]
  return {
    meal: { ...m, items: m.items.map((it) => itemView(m, it)) },
    people,
    brief: buildBrief(m),
    review: buildReview(m),
    occasionLabel: occasionLabel(m.date),
  }
}

// ---- Pantry, shopping math ----

const pantryLive = (): PantryRow[] => pantry.filter((p) => p.expires >= TODAY)

interface Need {
  key: string
  name: string
  unit: 'g' | 'ml' | 'pc'
  density?: number
  total: number
  have: number
  remaining: number
  flags: Set<string>
  people: Person[]
  meals: string[]
  soon?: ISODate
}

function aggregate(from: Meal[]): Need[] {
  const map = new Map<string, Need>()
  for (const m of from) {
    for (const it of m.items) {
      const v = it.versionId ? versionById(it.versionId) : undefined
      if (!v || it.broughtBy) continue
      for (const l of v.ingredients) {
        const key = `${l.name.toLowerCase()}|${l.unit}`
        const n =
          map.get(key) ??
          ({
            key,
            name: l.name,
            unit: l.unit,
            density: l.density,
            total: 0,
            have: 0,
            remaining: 0,
            flags: new Set(),
            people: [],
            meals: [],
          } as Need)
        n.total += l.amount * it.scale
        l.flags.forEach((f) => n.flags.add(f))
        attendees(m).forEach((p) => !n.people.includes(p) && n.people.push(p))
        if (!n.meals.includes(m.name)) n.meals.push(m.name)
        map.set(key, n)
      }
    }
  }
  for (const n of map.values()) {
    const rows = pantryLive().filter((p) => p.name.toLowerCase() === n.name.toLowerCase())
    n.have = rows.filter((r) => r.unit === n.unit).reduce((s, r) => s + r.amount, 0)
    n.remaining = Math.max(0, n.total - n.have)
    const soon = rows
      .filter((r) => r.expires && diffDays(TODAY, r.expires) <= 7)
      .map((r) => r.expires!)
      .sort()[0]
    n.soon = soon
  }
  return [...map.values()]
}

function sourcingNote(n: Need): string | undefined {
  const host = hostPeople()
  const notes: string[] = []
  const stricter = (tag: string) =>
    n.people.filter(
      (p) =>
        p.constraints.some((c) => c.tag === tag) &&
        !host.some((h) => h.constraints.some((c) => c.tag === tag)),
    )
  if (n.flags.has('meat') && stricter('glatt').length)
    notes.push(
      `Glatt, for ${stricter('glatt')
        .map((p) => p.name)
        .join(', ')}`,
    )
  if (n.flags.has('dairy') && stricter('chalav-yisrael').length)
    notes.push(
      `Chalav Yisrael, for ${stricter('chalav-yisrael')
        .map((p) => p.name)
        .join(', ')}`,
    )
  return notes.join('; ') || undefined
}

const fmt = (n: { unit: 'g' | 'ml' | 'pc'; density?: number }, amount: number) =>
  formatAmount({ amount, unit: n.unit, density: n.density }, 1, 'metric').text

function shoppingLines(): ShoppingLine[] {
  const accepted = meals.filter((m) => m.status === 'accepted')
  const lines: ShoppingLine[] = aggregate(accepted)
    .filter((n) => n.remaining > 0)
    .map((n) => ({
      id: `sl-${n.key.replace(/[^a-z0-9]+/g, '-')}`,
      name: n.name,
      need: fmt(n, n.remaining),
      have: n.have > 0 ? fmt(n, n.have) : undefined,
      note: sourcingNote(n),
      checked: shop.checked.has(`sl-${n.key.replace(/[^a-z0-9]+/g, '-')}`),
    }))
  const all = [...lines, ...shop.custom.map((l) => ({ ...l, checked: shop.checked.has(l.id) }))]
  const rank = (id: string) => {
    const i = shop.order.indexOf(id)
    return i < 0 ? 1e6 : i
  }
  return all
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l.id) - rank(b.l.id) || a.i - b.i)
    .map((x) => x.l)
}

// ---- Cooking schedule ----

interface Scheduled {
  date: ISODate
  time: string
  text: string
  passive: boolean
  mealId: Id
  mealName: string
}

function shift(date: ISODate, time: string, deltaMin: number): { date: ISODate; time: string } {
  const [h, mi] = time.split(':').map(Number)
  let total = h * 60 + mi + deltaMin
  let d = date
  while (total < 0) {
    total += 1440
    d = addDays(d, -1)
  }
  while (total >= 1440) {
    total -= 1440
    d = addDays(d, 1)
  }
  const hh = Math.floor(total / 60)
  const mm = Math.floor((total % 60) / 15) * 15
  return { date: d, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
}

export function clock12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`
}

const CANDLES = '16:25'

function scheduleMeal(m: Meal): Scheduled[] {
  const out: Scheduled[] = []
  const shabbat = isShabbatMeal(m)
  const friday = weekday(m.date) === 6 ? addDays(m.date, -1) : m.date
  const deadline = shabbat ? { date: friday, time: '15:30' } : { date: m.date, time: m.time }
  for (const it of m.items) {
    const v = it.versionId ? versionById(it.versionId) : undefined
    if (!v || it.broughtBy) continue
    const long = shabbat && v.holdsOnBlech && v.totalMin > 300
    const start = shift(deadline.date, deadline.time, -(long ? v.activeMin : v.totalMin))
    out.push({
      ...start,
      text: `${long ? 'Start' : 'Cook'} ${it.title.toLowerCase()} (${v.activeMin} min hands-on${long ? ', then it stays on the blech' : ''})`,
      passive: false,
      mealId: m.id,
      mealName: m.name,
    })
    for (const pre of v.prePrep) {
      let p = shift(start.date, start.time, -pre.leadHours * 60)
      if (p.time < '07:00') p = { date: addDays(p.date, -1), time: '21:00' }
      out.push({
        ...p,
        text: `${pre.text} (${pre.leadHours} h)`,
        passive: pre.passive,
        mealId: m.id,
        mealName: m.name,
      })
    }
  }
  return out.sort((a, b) => (`${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1))
}

// ---- Suggestions ----

function suggestionsFor(m: Meal, course: Course): SuggestionResult {
  const people = attendees(m)
  const fits: (Suggestion & { score: number })[] = []
  const hidden: HiddenDish[] = []
  const onMenu = new Set(m.items.map((i) => i.versionId))
  const kids = people.some((p) => (p.age ?? 99) < 13)
  for (const r of recipes.filter((x) => x.course === course)) {
    for (const v of r.versions) {
      if (onMenu.has(v.id)) continue
      const label = r.versions.length > 1 ? `${r.title} (${v.label})` : r.title
      const verdict = evaluate(v, people, m.date, m.kind)
      if (verdict.hidden) {
        hidden.push({ recipeId: r.id, title: label, why: verdict.hidden })
        continue
      }
      let score = 0
      const reasons: Reason[] = []
      const likers = new Set<string>()
      for (const re of v.reactions)
        if (re.kind === 'like' && people.some((p) => p.id === re.personId))
          likers.add(re.personName)
      for (const p of people)
        if (p.likes.some((l) => r.title.toLowerCase().includes(l.toLowerCase()))) likers.add(p.name)
      if (likers.size) {
        score += 3 * likers.size
        reasons.push({
          tone: 'good',
          text: `${[...likers].slice(0, 3).join(', ')} like${likers.size === 1 ? 's' : ''} it`,
        })
      }
      for (const re of v.reactions)
        if (re.kind === 'dislike' && people.some((p) => p.id === re.personId)) {
          score -= 3
          reasons.push({
            tone: 'warn',
            text: `${re.personName} didn’t like it${re.note ? `: ${re.note.toLowerCase().replace(/\.$/, '')}` : ''}`,
          })
        }
      const soon = v.ingredients
        .map((l) =>
          pantryLive().find(
            (p) =>
              p.name.toLowerCase() === l.name.toLowerCase() &&
              p.expires &&
              diffDays(TODAY, p.expires) <= 7,
          ),
        )
        .filter(Boolean)[0]
      if (soon) {
        score += 2
        reasons.push({
          tone: 'info',
          text: `Uses your ${soon.name.toLowerCase()}, expiring ${shortDate(soon.expires!)}`,
        })
      }
      const last = SERVED[v.id]
      if (!last) reasons.push({ tone: 'muted', text: 'Never served' })
      else {
        const days = diffDays(last, TODAY)
        if (days >= 28) {
          score += 1
          reasons.push({ tone: 'muted', text: `Not served in ${Math.round(days / 7)} weeks` })
        } else if (days < 14) {
          score -= 2
          reasons.push({ tone: 'warn', text: `Served ${days} days ago` })
        }
      }
      if (kids && v.occasionFit.some((f) => f.dimension === 'Kids love it' && f.fit !== 'fine')) {
        score += 1
        reasons.push({ tone: 'good', text: 'Kids love it' })
      }
      const slot = m.name.toLowerCase().includes('leil')
        ? 'Shabbat night'
        : m.name.toLowerCase().includes('lunch') && isShabbatMeal(m)
          ? 'Shabbat day'
          : m.name.toLowerCase().includes('thanksgiving')
            ? 'Thanksgiving'
            : undefined
      const fit = slot ? v.occasionFit.find((f) => f.dimension === slot) : undefined
      if (fit && fit.fit !== 'fine') {
        score += fit.fit === 'especially suited' ? 2 : 1
        reasons.push({ tone: 'good', text: `${cap(fit.fit)} for ${slot?.toLowerCase()}` })
      }
      const notes = [...verdict.adjustments, ...verdict.warnings]
      for (const n of notes) reasons.push({ tone: 'warn', text: n })
      fits.push({
        recipeId: r.id,
        versionId: v.id,
        title: r.title,
        versionLabel: v.label,
        kind: v.kind,
        course: r.course,
        activeMin: v.activeMin,
        totalMin: v.totalMin,
        reasons: reasons.filter((x) => !notes.includes(x.text)).slice(0, 4),
        adjustment: notes.length ? notes.join('. ') : undefined,
        score,
      })
    }
  }
  fits.sort((a, b) => b.score - a.score)
  return {
    course,
    fits: fits.map(({ score: _s, ...rest }) => rest),
    hidden,
    hasAllergyChecks: people.some((p) =>
      activeConstraints(p, m.date).some((c) => c.kind === 'medical'),
    ),
  }
}

function addVersionItem(m: Meal, course: Course, versionId: Id, scale = 1) {
  const v = versionById(versionId)
  if (!v) throw new Error('Unknown version')
  m.items.push({
    id: nextId('mi'),
    course,
    recipeId: v.recipeId,
    versionId: v.id,
    title: v.title,
    versionLabel: v.label,
    scale,
    servings: Math.round(v.servings * scale),
    kind: v.kind,
    activeMin: v.activeMin,
    adjustments: [],
  })
}

// ---- Recipes search ----

const ALIASES: [RegExp, string][] = [
  [/shabbos/g, 'shabbat'],
  [/kitniyos/g, 'kitniyot'],
  [/cholov/g, 'chalav'],
  [/yisroel/g, 'yisrael'],
  [/cholent|chulent|tsholnt/g, 'cholent'],
  [/doughnuts?|donuts?/g, 'sufganiyot'],
  [/thanksgiving/g, 'thanksgiving'],
]
const norm = (s: string) => ALIASES.reduce((t, [re, to]) => t.replace(re, to), s.toLowerCase())
const DIFF = { easy: 0, average: 1, 'a pain': 2 } as const

function summarize(r: Recipe, filters: RecipeFilters, people: Person[]): RecipeSummary | null {
  const d = r.versions[0]
  const safe = r.versions.filter((v) =>
    people.every((p) => !evaluate(v, [p], TODAY, 'parve').hidden),
  )
  if (people.length && !safe.length) return null
  const unsafeFor = people
    .filter((p) => evaluate(d, [p], TODAY, 'parve').hidden)
    .map((p) => ({
      personId: p.id,
      personName: p.name,
      reason: `Not the ${d.label.toLowerCase()} version: ${evaluate(d, [p], TODAY, 'parve').hidden?.toLowerCase()}`,
    }))
  return {
    id: r.id,
    title: r.title,
    course: r.course,
    form: r.form,
    kinds: [...new Set(r.versions.map((v) => v.kind))],
    versionCount: r.versions.length,
    defaultVersionId: (safe[0] ?? d).id,
    activeMin: d.activeMin,
    totalMin: d.totalMin,
    difficulty: d.difficulty,
    cost: d.cost,
    pesachFriendly: r.versions.some((v) => v.pesachFriendly),
    lastServed: lastServedOf(r),
    fits: d.occasionFit,
    unsafeFor,
  }
}

function matchesFilters(r: Recipe, f: RecipeFilters): boolean {
  if (f.course && r.course !== f.course) return false
  if (f.kind && !r.versions.some((v) => v.kind === f.kind)) return false
  if (f.pesachFriendly && !r.versions.some((v) => v.pesachFriendly)) return false
  if (f.underMinutes && !r.versions.some((v) => v.totalMin <= f.underMinutes!)) return false
  if (f.difficulty && !r.versions.some((v) => v.difficulty === f.difficulty)) return false
  if (f.cost && !r.versions.some((v) => v.cost === f.cost)) return false
  if (f.dimension) {
    const dim = norm(f.dimension)
    if (
      !r.versions.some((v) =>
        v.occasionFit.some((o) => norm(o.dimension).includes(dim) && o.fit !== 'fine'),
      )
    )
      return false
  }
  if (f.notServedWeeks) {
    const last = lastServedOf(r)
    if (last && diffDays(last, TODAY) < f.notServedWeeks * 7) return false
  }
  return true
}

// ---- Calendar ----

function chip(m: Meal): MealChip {
  return { id: m.id, name: m.name, status: m.status, kind: m.kind, itemCount: m.items.length }
}

function calendarDay(date: ISODate): CalendarDay {
  const dayMeals = meals.filter((m) => m.date === date).sort((a, b) => (a.time < b.time ? -1 : 1))
  const cooking: CookingTask[] = meals
    .flatMap(scheduleMeal)
    .filter((t) => t.date === date)
    .map((t) => ({ mealId: t.mealId, mealName: t.mealName, text: `${clock12(t.time)}: ${t.text}` }))
  return {
    date,
    hebrew: hebrewDate(date),
    parasha: weekday(date) === 6 ? parashaOn(date) : undefined,
    holidays: holidaysOn(date),
    meals: dayMeals.map(chip),
    cooking,
  }
}

function occasionDay(date: ISODate, label?: string): OccasionDay {
  return {
    date,
    label,
    hebrew: hebrewDate(date),
    meals: meals
      .filter((m) => m.date === date)
      .sort((a, b) => (a.time < b.time ? -1 : 1))
      .map(chip),
  }
}

function defaultTime(name: string, date: ISODate): string {
  const n = name.toLowerCase()
  if (n.includes('leil')) return '17:30'
  if (n.includes('shlishit')) return '17:00'
  if (n.includes('lunch')) return '12:30'
  if (n.includes('breakfast')) return '09:00'
  return weekday(date) === 5 ? '17:30' : '18:30'
}

// ---- API ----

export const mockApi: BishulApi = {
  // Plan tab (simplified in-memory model: mock-plan.ts)
  getWeek: (date) => delay(mockPlan.getWeek(date)),
  getPlan: (range) => delay(mockPlan.getPlan(range)),
  getHosted: (key) => delay(mockPlan.getHosted(key)),
  getHostedMeal: (id) => delay(mockPlan.getHostedMeal(id)),
  ensureRunMeal: (input) => delay(mockPlan.ensureRunMeal(input)),
  createPlanMeal: (input) => delay(mockPlan.createPlanMeal(input)),
  updatePlanMeal: (id, patch) => delay(mockPlan.updatePlanMeal(id, patch)),
  addMealHousehold: (id, hid) => delay(mockPlan.addMealHousehold(id, hid)),
  removeMealHousehold: (id, hid) => delay(mockPlan.removeMealHousehold(id, hid)),
  setMealPerson: (id, pid, present) => delay(mockPlan.setMealPerson(id, pid, present)),
  addMealDish: (id, dish) => delay(mockPlan.addMealDish(id, dish)),
  removeMealDish: (id, itemId) => delay(mockPlan.removeMealDish(id, itemId)),
  moveMealDish: (id, itemId, to) => delay(mockPlan.moveMealDish(id, itemId, to)),
  searchRecipesForMeal: (id) => delay(mockPlan.searchRecipesForMeal(id)),
  createContactHousehold: async (name) => {
    const h: Household = { id: `h-new-${households.length}`, name, isOwn: false, people: [] }
    households.push(h)
    return delay(h)
  },

  getUpcoming: () =>
    delay<Occasion[]>([
      {
        id: 'o-shabbat',
        title: 'This Shabbat: Toldot',
        subtitle: `Fri 13 Nov – Shabbat 14 Nov · ${hebrewDate('2026-11-13')} – ${hebrewDate('2026-11-14')}`,
        from: '2026-11-13',
        to: '2026-11-14',
        days: [occasionDay('2026-11-13', 'Leil Shabbat'), occasionDay('2026-11-14', 'Shabbat day')],
      },
      {
        id: 'o-thanksgiving',
        title: 'Thanksgiving',
        subtitle: `Thursday 26 Nov · ${hebrewDate('2026-11-26')}`,
        from: '2026-11-26',
        to: '2026-11-26',
        days: [occasionDay('2026-11-26', 'Thanksgiving')],
      },
      {
        id: 'o-chanukah',
        title: 'Chanukah',
        subtitle: `Fri 4 Dec – Shabbat 12 Dec · eight nights, first candle ${hebrewDate('2026-12-04')}`,
        from: '2026-12-04',
        to: '2026-12-12',
        days: [
          occasionDay('2026-12-04', 'First candle and Leil Shabbat'),
          occasionDay('2026-12-05', 'Shabbat Chanukah'),
        ],
        moreInCalendar: 'See all eight days in the calendar',
      },
    ]),

  getCalendar: ({ from, to }) => delay(rangeDays(from, to).map(calendarDay)),

  getMeal: (id) => delay(mealDetail(id)),

  createMeal: async (date, name) => {
    const n = name.toLowerCase()
    const m: Meal = {
      id: nextId('m'),
      date,
      name: name.trim() || 'Meal',
      kind: n.includes('shlishit') ? 'dairy' : 'meat',
      status: 'draft',
      time: defaultTime(name, date),
      notComing: [],
      guestIds: [],
      items: [],
    }
    meals = [...meals, m]
    return delay(m)
  },

  setMealKind: async (id, kind) => {
    mealById(id).kind = kind
    return delay(mealDetail(id))
  },

  updateMealDetails: async (id, { name, time }) => {
    const m = mealById(id)
    if (name !== undefined && name.trim()) m.name = name.trim()
    if (time !== undefined) m.time = time.trim()
    return delay(mealDetail(id))
  },

  setAttendees: async (id, a) => {
    const m = mealById(id)
    m.guestIds = a.guestIds
    m.notComing = a.notComing
    return delay(mealDetail(id))
  },

  addMenuItem: async (id, course, item) => {
    const m = mealById(id)
    if ('versionId' in item) addVersionItem(m, course, item.versionId, item.scale)
    else
      m.items.push({
        id: nextId('mi'),
        course,
        title: item.brought.name,
        scale: 1,
        servings: 0,
        kind: item.brought.kind,
        activeMin: 0,
        broughtBy: item.brought.by,
        adjustments: [],
      })
    return delay(mealDetail(id))
  },

  removeMenuItem: async (id, itemId) => {
    const m = mealById(id)
    m.items = m.items.filter((i) => i.id !== itemId)
    return delay(mealDetail(id))
  },

  setItemDone: async (id, itemId, done) => {
    const it = mealById(id).items.find((i) => i.id === itemId)
    if (it) it.done = done
    return delay(mealDetail(id))
  },

  getSuggestions: async (id, course) => delay(suggestionsFor(mealById(id), course)),

  suggestMenu: async (id) => {
    const m = mealById(id)
    const wanted: Course[] = ['soup', 'main', 'side', 'salad', 'dessert']
    if (isShabbatMeal(m)) wanted.unshift('challah')
    for (const course of wanted) {
      if (m.items.some((i) => i.course === course)) continue
      const top = suggestionsFor(m, course).fits[0]
      if (top) addVersionItem(m, course, top.versionId)
    }
    return delay(mealDetail(id))
  },

  acceptMeals: async (ids) => {
    for (const id of ids) mealById(id).status = 'accepted'
    return delay({ accepted: ids, blocked: [] })
  },
  reopenMeals: async (ids) => {
    for (const id of ids) mealById(id).status = 'draft'
    return delay(undefined)
  },
  deleteMeal: async (id) => {
    meals = meals.filter((m) => m.id !== id)
    mockPlan.deleteMeal(id)
    return delay(undefined)
  },

  searchRecipes: async (query, filters) => {
    const q = norm(query).split(/\s+/).filter(Boolean)
    const people = (filters.safeFor ?? []).map(personById).filter((p): p is Person => !!p)
    const rows = recipes
      .filter((r) => matchesFilters(r, filters))
      .filter((r) => {
        if (!q.length) return true
        const hay = norm(
          [
            r.title,
            ...r.aliases,
            r.form,
            r.course,
            ...r.versions.flatMap((v) => [
              v.label,
              v.description,
              v.kind,
              ...v.ingredients.map((l) => l.name),
            ]),
          ].join(' '),
        )
        return q.every((t) => hay.includes(t))
      })
      .map((r) => ({ r, s: summarize(r, filters, people) }))
      .filter((x): x is { r: Recipe; s: RecipeSummary } => !!x.s)
    const sort = filters.sort ?? 'relevance'
    rows.sort((a, b) => {
      switch (sort) {
        case 'quickest':
          return a.s.totalMin - b.s.totalMin
        case 'easiest':
          return DIFF[a.s.difficulty] - DIFF[b.s.difficulty] || a.s.totalMin - b.s.totalMin
        case 'longest-unserved':
          return (a.s.lastServed ?? '0') < (b.s.lastServed ?? '0') ? -1 : 1
        case 'a-z':
          return a.s.title.localeCompare(b.s.title)
        default: {
          const t = (x: { s: RecipeSummary }) =>
            q.length && norm(x.s.title).includes(q[0]) ? 0 : 1
          return t(a) - t(b) || a.s.title.localeCompare(b.s.title)
        }
      }
    })
    return delay(rows.map((x) => x.s))
  },

  getRecipe: async (id) => {
    const r = recipeById(id)
    if (!r) throw new Error('Recipe not found')
    return delay(r)
  },

  getVersion: async (versionId) => {
    const recipe = recipes.find((r) => r.versions.some((v) => v.id === versionId))
    const version = recipe?.versions.find((v) => v.id === versionId)
    if (!recipe || !version) throw new Error('Version not found')
    return delay({ recipe, version })
  },

  getCollections: () => delay(collections),
  saveCollection: async (name, filters) => {
    const col = { id: nextId('col'), name, filters }
    collections = [...collections, col]
    return delay(col)
  },

  getHousehold: () => delay(households.find((h) => h.isOwn)!),
  getContacts: () => delay(households.filter((h) => !h.isOwn)),
  getPerson: async (id) => {
    const person = personById(id)
    const household = households.find((h) => h.id === person?.householdId)
    if (!person || !household) throw new Error('Person not found')
    return delay({ person, household })
  },
  addPersonNote: async (id, note) => {
    personById(id)?.notes.unshift(note)
    return delay(undefined)
  },

  getShoppingList: () => delay(shoppingLines()),
  setShoppingChecked: async (id, checked) => {
    if (checked) shop.checked.add(id)
    else shop.checked.delete(id)
    return delay(undefined)
  },
  setShoppingOrder: async (ids) => {
    shop.order = ids
    return delay(undefined)
  },
  removeShoppingLine: async (id) => {
    shop.custom = shop.custom.filter((l) => l.id !== id)
    return delay(undefined)
  },
  addShoppingLine: async (name) => {
    shop.custom.push({ id: nextId('sl-custom'), name, need: '', checked: false, custom: true })
    return delay(undefined)
  },

  getPrepSchedule: async () => {
    const accepted = meals.filter((m) => m.status === 'accepted')
    const tasks = accepted.flatMap(scheduleMeal)
    const groups = new Map<string, PrepDay>()
    for (const t of tasks) {
      const night = t.time >= '20:00'
      const key = `${t.date}${night ? 'n' : ''}`
      const g =
        groups.get(key) ??
        ({
          id: key,
          label: `${weekdayName(t.date)}${night ? ' night' : ''}`,
          date: t.date,
          tasks: [],
        } as PrepDay)
      const task: PrepTask = {
        id: `${key}-${g.tasks.length}`,
        time: clock12(t.time),
        text: t.text,
        mealName: t.mealName,
        passive: t.passive,
      }
      g.tasks.push(task)
      groups.set(key, g)
    }
    const days = [...groups.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
    for (const d of days)
      if (weekday(d.date) === 5 && !d.id.endsWith('n') && accepted.some(isShabbatMeal))
        d.note = `Candle lighting is ${clock12(CANDLES)}. Hands-on cooking is finished by ${clock12('15:30')}.`
    for (const m of accepted.filter(isShabbatMeal)) {
      const sat = weekday(m.date) === 6 ? m.date : addDays(m.date, 1)
      if (!days.some((d) => d.id === `${sat}-shabbat`))
        days.push({
          id: `${sat}-shabbat`,
          label: 'Shabbat',
          date: sat,
          tasks: [],
          note: 'Nothing scheduled over Shabbat. Passive cooking, like the cholent, carries on by itself.',
        })
    }
    return delay(
      days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1)),
    )
  },

  getPantry: async (): Promise<PantryList> => {
    const heldBy = new Map<string, string[]>()
    for (const n of aggregate(meals.filter((m) => m.status === 'accepted')))
      heldBy.set(n.name.toLowerCase(), n.meals)
    return delay({
      today: TODAY,
      items: [...pantry]
        .sort((a, b) => a.expires.localeCompare(b.expires))
        .map((p) => ({
          id: p.id,
          name: p.name,
          quantity: fmt(p, p.amount),
          expires: p.expires,
          heldFor: heldBy.get(p.name.toLowerCase())?.join(', '),
        })),
    })
  },
  addPantryItem: async ({ name, quantity, expires }) => {
    if (!expires) throw new Error(`Give ${name} a use-by date: this list is for things to use up.`)
    const m = quantity.trim().match(/^([\d.]+)\s*(g|kg|ml|l)?/i)
    const amount = m ? parseFloat(m[1]) : 1
    const u = (m?.[2] ?? '').toLowerCase()
    pantry = [
      ...pantry,
      {
        id: nextId('pa'),
        name,
        amount: u === 'kg' || u === 'l' ? amount * 1000 : amount,
        unit: u === 'g' || u === 'kg' ? 'g' : u === 'ml' || u === 'l' ? 'ml' : 'pc',
        expires,
      },
    ]
    return delay(undefined)
  },

  // ---- Added with the real API; the demo supports these only in part. ----
  getHouseholdInfo: () =>
    delay({
      id: HOST_HOUSEHOLD,
      name: 'The Levins',
      location: { lat: 40.8, lng: -74, timeZone: 'America/New_York', israel: false },
      locationSet: true,
      today: TODAY,
      isOwner: true,
    }),
  updateHousehold: async () => demoOnly(),
  getPrefs: () => delay({ system: 'us' as const }),
  setPrefs: async (p) => delay({ system: p.system ?? 'us' }),
  listApiKeys: () => delay([]),
  createApiKey: async () => demoOnly(),
  revokeApiKey: async () => demoOnly(),
  previewImport: async () => demoOnly(),
  importRecipe: async () => demoOnly(),
  saveVersion: async () => demoOnly(),
  createVariation: async () => demoOnly(),
  addPerson: async () => demoOnly(),
  setPersonBirth: async () => demoOnly(),
  setPersonSpicy: async () => demoOnly(),
  addConstraint: async () => demoOnly(),
  removeConstraint: async () => demoOnly(),
  setPersonRules: async () => demoOnly(),
  recordReaction: async () => demoOnly(),
  updatePantryItem: async () => demoOnly(),
  removePantryItem: async (id) => {
    pantry = pantry.filter((p) => p.id !== id)
    return delay(undefined)
  },
}

function demoOnly(): never {
  throw new Error('That isn’t available in the offline demo.')
}
