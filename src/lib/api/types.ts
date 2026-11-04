/** Domain types for the Bishul UI. They follow BRIEF.md; the real API will return the same shapes. */

export type ISODate = string // YYYY-MM-DD in the household's time zone
export type Id = string

export type Course =
  'main' | 'side' | 'salad' | 'soup' | 'starter' | 'challah' | 'dessert' | 'other'
export const COURSES: Course[] = [
  'main',
  'side',
  'salad',
  'soup',
  'starter',
  'challah',
  'dessert',
  'other',
]

/** Meat / dairy / parve. Always shown as a text label, never colour alone. */
export type Kind = 'meat' | 'dairy' | 'parve'

export type Difficulty = 'easy' | 'average' | 'a pain'
export type Cost = '$' | '$$' | '$$$'
export type Fit = 'fine' | 'good' | 'especially suited'
export type SkipImpact = 'none' | 'minor' | 'ruins'

// ---- People and constraints (BRIEF §3, §4) ----

export type ConstraintKind = 'medical' | 'religious' | 'preference'
export type Severity = 'strict' | 'flexible'
export type ConstraintTagType =
  'allergen' | 'ingredient' | 'diet' | 'kashrut-dish' | 'kashrut-sourcing' | 'combination'
export type ConstraintSource = 'self' | 'host' | 'ai'

export interface Constraint {
  id: Id
  personId: Id
  /** Machine tag matched against ingredients, e.g. `sesame`, `cilantro`, `glatt`. */
  tag: string
  label: string
  tagType: ConstraintTagType
  kind: ConstraintKind
  severity: Severity
  /** `always`, a named period (`Pesach`) or a custom range. */
  activeWhen: string
  note?: string
  source: ConstraintSource
  /** True when it flows in live from the linked user's own profile. */
  fromProfile: boolean
}

export interface ServedEntry {
  date: ISODate
  versionId: Id
  title: string
}

export interface Person {
  id: Id
  name: string
  householdId: Id
  relation?: string
  age?: number
  constraints: Constraint[]
  /** Linked ghost: the real user's profile, live. */
  link?: { profileName: string; mode: 'merge' | 'overwrite' }
  /** Private layer: notes, likes, dislikes, history. Never visible to the real person. */
  notes: string[]
  likes: string[]
  dislikes: string[]
  served: ServedEntry[]
}

export interface Household {
  id: Id
  name: string
  isOwn: boolean
  /** Ghost contact households only. */
  note?: string
  people: Person[]
}

// ---- Recipes (BRIEF §6, §7) ----

export interface IngredientLine {
  id: Id
  name: string
  /** Canonical metric amount. */
  amount: number
  unit: 'g' | 'ml' | 'pc'
  /** The amount as written in the source. */
  original: string
  prep?: string
  skipImpact: SkipImpact
  allergens: string[]
  /** `meat`, `dairy`, `chametz`, `kitniyot`, ... */
  flags: string[]
  /** g per ml, where weight/volume conversion is meaningful. */
  density?: number
  /** True when allergen/kashrut data was filled by the AI rather than the seed or the user. */
  aiFilled?: boolean
}

export interface RecipeStep {
  id: Id
  text: string
  timerSec?: number
  ingredientIds: Id[]
}

export interface Reaction {
  personId: Id
  personName: string
  kind: 'like' | 'dislike'
  note?: string
  recordedBy: string
  date: ISODate
}

export interface EditEntry {
  date: ISODate
  by: string
  summary: string
}

export interface OccasionFit {
  dimension: string
  fit: Fit
}

export interface PrePrep {
  text: string
  leadHours: number
  passive: boolean
}

export interface RecipeVersion {
  id: Id
  recipeId: Id
  label: string
  parentId?: Id
  description: string
  servings: number
  kind: Kind
  difficulty: Difficulty
  activeMin: number
  totalMin: number
  prePrep: PrePrep[]
  serving: 'hot' | 'room temperature' | 'cold'
  holdsOnBlech: boolean
  easyToDeliver: boolean
  equipment: { name: string; designation: Kind | 'pesach' }[]
  flags: string[]
  cost: Cost
  occasionFit: OccasionFit[]
  source?: { label: string; url: string }
  pesachFriendly: boolean
  ingredients: IngredientLine[]
  steps: RecipeStep[]
  reactions: Reaction[]
  history: EditEntry[]
}

export interface Recipe {
  id: Id
  title: string
  aliases: string[]
  course: Course
  form: string
  versions: RecipeVersion[]
}

export interface RecipeSummary {
  id: Id
  title: string
  course: Course
  form: string
  kinds: Kind[]
  versionCount: number
  defaultVersionId: Id
  activeMin: number
  totalMin: number
  difficulty: Difficulty
  cost: Cost
  pesachFriendly: boolean
  lastServed?: ISODate
  fits: OccasionFit[]
  /** For the chosen "safe for" people, who can't have it and why. */
  unsafeFor: { personId: Id; personName: string; reason: string }[]
}

export type RecipeSort = 'relevance' | 'quickest' | 'easiest' | 'longest-unserved' | 'a-z'

export interface RecipeFilters {
  course?: Course
  kind?: Kind
  safeFor?: Id[]
  pesachFriendly?: boolean
  underMinutes?: number
  notServedWeeks?: number
  difficulty?: Difficulty
  cost?: Cost
  /** Occasion dimension at `good` or better. */
  dimension?: string
  sort?: RecipeSort
}

export interface Collection {
  id: Id
  name: string
  filters: RecipeFilters
}

// ---- Calendar and occasions (BRIEF §9) ----

export interface CalendarHoliday {
  name: string
  type: 'jewish' | 'civil' | 'rosh-chodesh'
}

export interface MealChip {
  id: Id
  name: string
  status: 'draft' | 'accepted'
  kind: Kind
  itemCount: number
}

export interface CookingTask {
  mealId: Id
  mealName: string
  text: string
}

export interface CalendarDay {
  date: ISODate
  hebrew: string
  parasha?: string
  holidays: CalendarHoliday[]
  meals: MealChip[]
  /** What has to be cooked on this day, from accepted and draft menus. */
  cooking: CookingTask[]
}

export interface OccasionDay {
  date: ISODate
  label?: string
  hebrew: string
  meals: MealChip[]
}

export interface Occasion {
  id: Id
  title: string
  subtitle: string
  from: ISODate
  to: ISODate
  days: OccasionDay[]
  /** Link text for days not shown, e.g. the other Chanukah days. */
  moreInCalendar?: string
}

// ---- Meals (BRIEF §9) ----

export interface MealItem {
  id: Id
  course: Course
  title: string
  versionLabel?: string
  recipeId?: Id
  versionId?: Id
  scale: number
  servings: number
  kind: Kind
  activeMin: number
  /** Someone else is bringing this dish: it counts for balance and kashrut, not cooking. */
  broughtBy?: string
  adjustments: string[]
}

export interface Meal {
  id: Id
  date: ISODate
  name: string
  kind: Kind
  status: 'draft' | 'accepted'
  time: string
  /** People who are not coming. */
  notComing: Id[]
  /** Guest persons added from contacts. */
  guestIds: Id[]
  items: MealItem[]
}

export type BriefTone = 'danger' | 'warn' | 'info' | 'preference'

export interface BriefLine {
  id: Id
  tone: BriefTone
  text: string
  people: string[]
  /** Allergy lines that pass only because of AI-filled ingredient data. */
  aiFilled?: boolean
}

export interface DiningBrief {
  lines: BriefLine[]
  hasAllergy: boolean
  disclaimer: string
}

export interface MealPerson {
  person: Person
  coming: boolean
  isGuest: boolean
}

export interface MealReview {
  handsOnMin: number
  adjustments: { item: string; text: string }[]
  issues: string[]
  sourcing: string[]
  shopping: string[]
  nextMealId?: Id
  nextMealName?: string
}

export interface MealDetail {
  meal: Meal
  people: MealPerson[]
  brief: DiningBrief
  review: MealReview
  occasionLabel?: string
}

export interface Reason {
  tone: 'good' | 'info' | 'warn' | 'muted'
  text: string
}

export interface Suggestion {
  recipeId: Id
  versionId: Id
  title: string
  versionLabel: string
  kind: Kind
  course: Course
  activeMin: number
  totalMin: number
  reasons: Reason[]
  adjustment?: string
}

export interface HiddenDish {
  recipeId: Id
  title: string
  why: string
}

export interface SuggestionResult {
  course: Course
  fits: Suggestion[]
  hidden: HiddenDish[]
  hasAllergyChecks: boolean
}

export type BroughtDish = { name: string; by: string; kind: Kind }

/** What to add: a recipe version, or a dish a guest is bringing. */
export type MenuItemInput = { versionId: Id; scale?: number } | { brought: BroughtDish }

// ---- Shopping, prep, pantry ----

export interface ShoppingLine {
  id: Id
  name: string
  /** Display text for the amount still to buy, e.g. `½ onion` or `200 g`. */
  need: string
  have?: string
  note?: string
  checked: boolean
  custom?: boolean
}

export interface PrepTask {
  id: Id
  time: string
  text: string
  mealName: string
  passive?: boolean
}

export interface PrepDay {
  id: Id
  label: string
  date: ISODate
  tasks: PrepTask[]
  /** Set on days nothing is scheduled, e.g. Shabbat. */
  note?: string
  flags?: string[]
}

export interface PantryItem {
  id: Id
  name: string
  quantity: string
  location?: string
  expires?: ISODate
  /** Held aside for an accepted menu. */
  heldFor?: string
}

export interface PantryList {
  today: ISODate
  items: PantryItem[]
}
