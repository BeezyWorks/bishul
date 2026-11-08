import { createDishChecker, type DiningBriefInput, type DishCheck } from './diningBrief'
import { isKid } from './age'
import { daysBetween, weekdayName } from './time'
import type { DateString, DishVersion, OccasionFit } from './types'

// ---------------------------------------------------------------------------
// Input

export interface Reaction {
  personId: string
  versionId: string
  type: 'like' | 'dislike'
  note?: string
}

/** A version served to a person at a meal that has passed. */
export interface ServingRecord {
  personId: string
  versionId: string
  date: DateString
}

export interface PantryItem {
  name: string
  /** Expired items are never suggested. */
  expiresOn?: DateString
  /** A chametz item's effective expiry is the pre-Pesach cutoff (`RankContext.chametzCutoff`). */
  chametz?: boolean
}

export interface RankWeights {
  /** Full boost for a liked version nobody was served recently. */
  like: number
  /** Days after which a like has its full boost back. */
  likeRecoveryDays: number
  /** Permanent demotion per person who disliked it. */
  dislike: number
  /** Bonus when the group has never had it, and when it has been long enough. */
  freshness: number
  /** At or beyond this many days since last served to any attendee the full freshness bonus applies. */
  freshnessFullDays: number
  /** Penalty for something served in the last `recentDays`, scaled by how recent. */
  recentPenalty: number
  recentDays: number
  /** Per pantry item that expires soon, scaled by urgency; capped at `pantryCap` items. */
  pantry: number
  pantryCap: number
  /** Days ahead of today that count as "expiring soon". */
  pantrySoonDays: number
  occasion: Record<OccasionFit, number>
  /** Dimension marking dishes kids love; boosted (by its fit) when a kid is coming. */
  kidsDimension: string
  kidsLove: Record<OccasionFit, number>
  eatAroundRuins: number
  eatAroundMinor: number
  /** Subtracted when a menu already has a dish of the same form (suggestMenu only). */
  sameForm: number
}

export const DEFAULT_WEIGHTS: RankWeights = {
  like: 3,
  likeRecoveryDays: 42,
  dislike: -6,
  freshness: 2,
  freshnessFullDays: 56,
  recentPenalty: -2,
  recentDays: 14,
  pantry: 1.5,
  pantryCap: 3,
  pantrySoonDays: 7,
  occasion: { fine: 0.5, good: 1.5, especially_suited: 3 },
  kidsDimension: 'kids_love_it',
  kidsLove: { fine: 0.5, good: 2, especially_suited: 3.5 },
  eatAroundRuins: -3,
  eatAroundMinor: -0.5,
  sameForm: -2,
}

export interface RankContext {
  /** Today in the household's time zone. */
  today: DateString
  reactions?: Reaction[]
  servings?: ServingRecord[]
  pantry?: PantryItem[]
  /** Occasion dimensions this meal is for, e.g. `shabbat_night`. */
  occasions?: string[]
  /** Only rank dishes of this course (`main`, `side`, `dessert`, ...). */
  course?: string
  /** Date of the pre-Pesach chametz cutoff, to give chametz pantry items their effective expiry. */
  chametzCutoff?: DateString
  weights?: Partial<RankWeights>
}

// ---------------------------------------------------------------------------
// Output

export interface RankReason {
  code:
    | 'liked'
    | 'disliked'
    | 'not_served'
    | 'served_recently'
    | 'pantry'
    | 'occasion'
    | 'kids'
    | 'eat_around'
  text: string
  delta: number
}

export interface RankedDish {
  dish: DishVersion
  score: number
  reasons: RankReason[]
  check: DishCheck
}

export interface HiddenDish {
  dish: DishVersion
  /** Why it does not fit, from the dining brief. */
  why: string[]
  check: DishCheck
}

export interface RankResult {
  ranked: RankedDish[]
  hidden: HiddenDish[]
}

// ---------------------------------------------------------------------------
// Helpers

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const phrase = (hay: string, needle: string) => ` ${norm(hay)} `.includes(` ${norm(needle)} `)

function weeksAgo(days: number): string {
  const w = Math.round(days / 7)
  return w <= 1 ? 'a week' : `${w} weeks`
}

function label(dimension: string): string {
  const t = dimension.replace(/[_-]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function expiryText(expiry: DateString, today: DateString): string {
  const d = daysBetween(today, expiry)
  if (d <= 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d < 7) return weekdayName(expiry)
  return `on ${expiry}`
}

/** Effective expiry of a pantry item (null: no expiry). Chametz items stop being usable at the cutoff. */
function effectiveExpiry(item: PantryItem, ctx: RankContext): DateString | null {
  let e = item.expiresOn ?? null
  if (item.chametz && ctx.chametzCutoff && (!e || ctx.chametzCutoff < e)) e = ctx.chametzCutoff
  return e
}

// ---------------------------------------------------------------------------
// Ranking

/**
 * Ranks `candidates` for the meal described by `meal` (attendees, date, kind, dishes already selected). Dishes that
 * do not fit the people coming or the meal go to `hidden`, with why. Dislikes demote but never hide.
 */
export function rankCandidates(
  meal: DiningBriefInput,
  candidates: DishVersion[],
  ctx: RankContext,
): RankResult {
  const w: RankWeights = {
    ...DEFAULT_WEIGHTS,
    ...ctx.weights,
    occasion: { ...DEFAULT_WEIGHTS.occasion, ...ctx.weights?.occasion },
    kidsLove: { ...DEFAULT_WEIGHTS.kidsLove, ...ctx.weights?.kidsLove },
  }
  const checker = createDishChecker(meal)
  const selectedIds = new Set(meal.selected.map((d) => d.id))
  const attendeeIds = new Set(meal.attendees.map((p) => p.id))
  const nameOf = new Map(meal.attendees.map((p) => [p.id, p.name]))
  const reactions = (ctx.reactions ?? []).filter((r) => attendeeIds.has(r.personId))
  const servings = (ctx.servings ?? []).filter(
    (s) => attendeeIds.has(s.personId) && s.date < meal.date,
  )

  const kids = meal.attendees.filter((p) => isKid(p.age))

  const ranked: RankedDish[] = []
  const hidden: HiddenDish[] = []

  for (const dish of candidates) {
    if (selectedIds.has(dish.id)) continue
    if (ctx.course && norm(dish.course ?? '') !== norm(ctx.course)) continue
    const check = checker.check(dish)
    if (!check.fits) {
      hidden.push({ dish, why: check.reasons, check })
      continue
    }

    const reasons: RankReason[] = []
    const add = (r: RankReason) => reasons.push(r)
    const served = servings.filter((s) => s.versionId === dish.id)
    const sinceFor = (personId: string): number | null => {
      const dates = served.filter((s) => s.personId === personId).map((s) => s.date)
      return dates.length ? daysBetween(dates.sort().at(-1)!, meal.date) : null
    }

    // Likes fade with recent servings; dislikes never do.
    for (const r of reactions.filter((r) => r.versionId === dish.id)) {
      const name = nameOf.get(r.personId)!
      if (r.type === 'dislike') {
        add({ code: 'disliked', text: `${name} didn't like it`, delta: w.dislike })
        continue
      }
      const since = sinceFor(r.personId)
      const decay = since === null ? 1 : Math.min(1, since / w.likeRecoveryDays)
      const delta = w.like * decay
      add({
        code: 'liked',
        text:
          decay >= 0.75
            ? `${name} liked it`
            : `${name} liked it, but had it ${weeksAgo(since!)} ago`,
        delta,
      })
    }

    // How long since anyone here was served it.
    if (!served.length) {
      add({ code: 'not_served', text: 'Not served to this group before', delta: w.freshness })
    } else {
      const days = daysBetween(
        served
          .map((s) => s.date)
          .sort()
          .at(-1)!,
        meal.date,
      )
      if (days < w.recentDays) {
        add({
          code: 'served_recently',
          text: days <= 1 ? 'Served yesterday' : `Served ${days} days ago`,
          delta: w.recentPenalty * (1 - days / w.recentDays),
        })
      } else {
        const delta =
          w.freshness * Math.min(1, (days - w.recentDays) / (w.freshnessFullDays - w.recentDays))
        add({ code: 'not_served', text: `Not served in ${weeksAgo(days)}`, delta })
      }
    }

    // Pantry items that expire soon and can still be used at this meal.
    const used: { text: string; delta: number }[] = []
    for (const item of ctx.pantry ?? []) {
      const expiry = effectiveExpiry(item, ctx)
      if (!expiry || expiry < meal.date) continue // expired by the meal: never suggested
      const until = daysBetween(ctx.today, expiry)
      if (until > w.pantrySoonDays) continue
      if (!dish.ingredients.some((i) => phrase(i.name, item.name) || phrase(item.name, i.name)))
        continue
      const urgency = 1 - Math.max(0, until) / (w.pantrySoonDays + 1)
      used.push({
        text: `Uses ${item.name} expiring ${expiryText(expiry, ctx.today)}`,
        delta: w.pantry * urgency,
      })
    }
    used.sort((a, b) => b.delta - a.delta)
    for (const u of used.slice(0, w.pantryCap)) add({ code: 'pantry', ...u })

    // Fit for the occasion.
    const fits = (ctx.occasions ?? [])
      .map((o) => ({ o, fit: dish.occasionFit?.[o] }))
      .filter((x): x is { o: string; fit: OccasionFit } => !!x.fit)
      .sort((a, b) => w.occasion[b.fit] - w.occasion[a.fit])
    if (fits.length) {
      const best = fits[0]
      add({
        code: 'occasion',
        text:
          best.fit === 'especially_suited'
            ? `Especially suited to ${label(best.o).toLowerCase()}`
            : best.fit === 'good'
              ? `Good for ${label(best.o).toLowerCase()}`
              : `Fine for ${label(best.o).toLowerCase()}`,
        delta: w.occasion[best.fit],
      })
    }

    // Kids at the table: dishes tagged as kid favourites rise.
    const kidFit =
      kids.length === 0
        ? undefined
        : (dish.occasionFit?.[w.kidsDimension] ??
          (dish.flags?.includes('kid_friendly') ? ('good' as const) : undefined))
    if (kidFit) {
      const who = kids.length === 1 ? kids[0].name : 'the kids'
      add({
        code: 'kids',
        text: kidFit === 'fine' ? `Fine for ${who}` : `Kid-friendly for ${who}`,
        delta: w.kidsLove[kidFit],
      })
    }

    // Eating around something costs a little, or a lot if it ruins the dish.
    for (const e of check.eatAround) {
      if (e.verdict === 'ruins') add({ code: 'eat_around', text: e.text, delta: w.eatAroundRuins })
      else if (e.verdict === 'skip_minor')
        add({ code: 'eat_around', text: e.text, delta: w.eatAroundMinor })
    }

    const score = Math.round(reasons.reduce((s, r) => s + r.delta, 0) * 1000) / 1000
    ranked.push({ dish, score, reasons, check })
  }

  ranked.sort((a, b) => b.score - a.score || a.dish.title.localeCompare(b.dish.title))
  return { ranked, hidden }
}

// ---------------------------------------------------------------------------
// Menu suggestion

export interface CourseSlot {
  course: string
  count?: number
}

/** A balanced default: a main, two sides, a salad and a dessert. Soup and starters are asked for explicitly. */
export const DEFAULT_COURSE_PLAN: CourseSlot[] = [
  { course: 'main' },
  { course: 'side', count: 2 },
  { course: 'salad' },
  { course: 'dessert' },
]

export interface SuggestOptions {
  /** Courses in the order they are served; mains are chosen first so the meal's kind is settled. */
  plan?: CourseSlot[]
  /** At most this many "a pain" dishes in the whole menu. Default 1. */
  maxHard?: number
}

export interface SuggestedItem {
  course: string
  dish: DishVersion
  score: number
  reasons: RankReason[]
}

export interface SuggestedMenu {
  menu: SuggestedItem[]
  /** Slots nothing fit. */
  unfilled: string[]
}

/**
 * Fills a balanced set of courses from the top-ranked dishes that fit together: nothing that mixes meat and dairy
 * with what is already chosen, no two versions of one recipe, a variety of forms, and not too many hard dishes.
 */
export function suggestMenu(
  meal: DiningBriefInput,
  candidates: DishVersion[],
  ctx: RankContext,
  opts: SuggestOptions = {},
): SuggestedMenu {
  const plan = opts.plan ?? DEFAULT_COURSE_PLAN
  const maxHard = opts.maxHard ?? 1
  const w = { ...DEFAULT_WEIGHTS, ...ctx.weights }
  const slots = plan.flatMap((s) => Array.from({ length: s.count ?? 1 }, () => s.course))
  const order = slots
    .map((course, i) => ({ course, i }))
    .sort((a, b) => Number(b.course === 'main') - Number(a.course === 'main') || a.i - b.i)

  let selected = [...meal.selected]
  const chosen = new Map<number, SuggestedItem>()
  const unfilled: string[] = []

  for (const { course, i } of order) {
    const current: DiningBriefInput = { ...meal, selected }
    const { ranked } = rankCandidates(current, candidates, { ...ctx, course })
    const hard = selected.filter((d) => d.difficulty === 'a_pain').length
    const options = ranked
      .filter((r) => !selected.some((s) => s.recipeId && s.recipeId === r.dish.recipeId))
      .filter((r) => hard < maxHard || r.dish.difficulty !== 'a_pain')
      .map((r) => {
        const dup = r.dish.form && selected.some((s) => s.form === r.dish.form)
        return { r, adjusted: r.score + (dup ? w.sameForm : 0) }
      })
      .sort((a, b) => b.adjusted - a.adjusted || a.r.dish.title.localeCompare(b.r.dish.title))
    const pick = options[0]?.r
    if (!pick) {
      unfilled.push(course)
      continue
    }
    selected = [...selected, pick.dish]
    chosen.set(i, { course, dish: pick.dish, score: pick.score, reasons: pick.reasons })
  }
  return { menu: [...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), unfilled }
}
