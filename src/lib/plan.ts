/**
 * Plan tab helpers: routes, slots, and small text helpers shared by the Plan, hosted, print and wizard screens.
 * Route contract: docs/plan-redesign-contract.md. Hrefs are plain strings (pass them to `Button href`, `ListRow href`
 * or `router.push(href as Href)`).
 */
import type { DaySlot, GuestHousehold, Id, ISODate } from '@/lib/api/types'

// ---- Routes ----

/** Plan week at `/`; `week` is any date in the week, `view` is `month` for the month toggle. */
export function planHref(opts: { week?: ISODate; view?: 'week' | 'month' } = {}): string {
  const q = new URLSearchParams()
  if (opts.week) q.set('week', opts.week)
  if (opts.view === 'month') q.set('view', 'month')
  const s = q.toString()
  return s ? `/?${s}` : '/'
}

/** A hosted run or a single hosted meal. `key` is `MealCard.hostedKey` / `RunSummary.key`. */
export const hostedHref = (key: string): string => `/hosted/${key}`
/** The fridge sheet for the same key. */
export const printHref = (key: string): string => `/print/${key}`
/** The wizard, which plans ONE meal and starts with guests. Step: `guests` | `menu` | `check`. */
export const wizardHref = (mealId: Id, step?: 'guests' | 'menu' | 'check'): string =>
  step ? `/meal/${mealId}?step=${step}` : `/meal/${mealId}`

/** The hosted key of a meal (its run's key when it belongs to a run, else `meal-<id>`). */
export function hostedKeyFor(meal: {
  id: Id | null
  runKey?: string | null
  hostedKey?: string
}): string {
  if (meal.hostedKey) return meal.hostedKey
  if (meal.runKey) return meal.runKey
  return `meal-${meal.id}`
}

export type HostedKey = { type: 'run'; date: ISODate } | { type: 'meal'; mealId: Id }

export function parseHostedKey(key: string): HostedKey | null {
  const run = /^run-(\d{4}-\d{2}-\d{2})$/.exec(key)
  if (run) return { type: 'run', date: run[1] }
  const meal = /^meal-([0-9A-Za-z_-]+)$/.exec(key)
  return meal ? { type: 'meal', mealId: meal[1] } : null
}

// ---- Slots ----

export const SLOT_LABEL: Record<DaySlot, string> = {
  breakfast: 'Breakfast',
  kiddush: 'Kiddush',
  brunch: 'Brunch',
  lunch: 'Lunch',
  seudah_shlishit: 'Seudah shlishit',
  dinner: 'Dinner',
  oneg: 'Oneg',
}

/** What the "Kind" picker in "Host a meal…" offers, in day order. Seudah shlishit is a button on the page. */
export const PICKABLE_SLOTS: DaySlot[] = [
  'breakfast',
  'kiddush',
  'brunch',
  'lunch',
  'dinner',
  'oneg',
]

// ---- Text ----

/** `2 adults, 1 child`; empty for nobody. */
export function countsText(c: { adults: number; children: number }): string {
  const parts: string[] = []
  if (c.adults) parts.push(`${c.adults} ${c.adults === 1 ? 'adult' : 'adults'}`)
  if (c.children) parts.push(`${c.children} ${c.children === 1 ? 'child' : 'children'}`)
  return parts.join(', ')
}

/** `18:30` to `6:30 pm`. */
export function timeLabel(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = +m[1]
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`
}

/** Dish titles as one line: `Brisket, potato kugel` (first word capitalized, the rest as the recipe titles). */
export function summaryLine(titles: string[]): string {
  return titles.join(', ')
}

/** Household members who are away (unticked). */
export const awayNames = (h: GuestHousehold): string[] =>
  h.members.filter((m) => !m.present).map((m) => m.name)
