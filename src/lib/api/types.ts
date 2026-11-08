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

export interface PersonReaction {
  versionId: Id
  title: string
  kind: 'like' | 'dislike'
  note?: string
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
  /** Whole years, worked out by the server from the birthday (so it ticks up on its own). */
  age?: number
  /** `YYYY-MM-DD`; absent when only an age was given. */
  birthDate?: ISODate
  /** The birthday was estimated from a stated age; ask for the real one when convenient. */
  birthDateApprox?: boolean
  constraints: Constraint[]
  /** Linked ghost: the real user's profile, live. */
  link?: { profileName: string; mode: 'merge' | 'overwrite' }
  isChild?: boolean
  /** A signed-in member of the household (cannot be removed). */
  isMember?: boolean
  /** Opt-in combination and equipment rules (`no_fish_dairy`, ...). */
  rules?: string[]
  /** Likes and dislikes with the version they are about (the badges below show titles). */
  reactions?: PersonReaction[]
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
  /** No quantity could be read ("salt to taste"): show `original` as written. */
  unquantified?: boolean
  /** The part of the recipe it belongs to: "Cake", or "Chocolate Mousse > Meringue". */
  section?: string
}

export interface RecipeStep {
  id: Id
  text: string
  timerSec?: number
  ingredientIds: Id[]
  /** Share (0-1) of an ingredient this step uses when its amount is divided between steps; absent means all. */
  portions?: Record<Id, number>
  /** The part of the recipe this step belongs to; steps and ingredients are sectioned independently. */
  section?: string
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
  /** Pesach-friendly only for those who eat kitniyot. */
  pesachKitniyot?: boolean
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
  /** Pesach-friendly only for those who eat kitniyot. */
  pesachKitniyot?: boolean
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
  /** Null while the meal has no declared type and no dishes. */
  kind: Kind | null
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
  isShabbat?: boolean
  isYomTov?: boolean
  /** "4:28 PM", on the evening before Shabbat and Yom Tov. */
  candleLighting?: string
  /** "5:48 PM", at the end of Shabbat and Yom Tov. */
  havdalah?: string
  meals: MealChip[]
  /** What has to be cooked on this day, from accepted and draft menus. */
  cooking: CookingTask[]
}

export interface OccasionDay {
  date: ISODate
  label?: string
  hebrew: string
  candleLighting?: string
  havdalah?: string
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
  /** Checked off on the accepted menu. */
  done?: boolean
  adjustments: string[]
}

export interface Meal {
  id: Id
  date: ISODate
  name: string
  kind: Kind
  /** False when the meal has no declared type yet (`kind` is then only a fallback). */
  kindDeclared?: boolean
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
  householdName: string
}

export interface MealReview {
  handsOnMin: number
  adjustments: { item: string; text: string }[]
  issues: string[]
  /** Problems that do not block accepting. */
  warnings?: string[]
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
  /** "some" when no quantity was given. */
  quantity: string
  /** Use-by date (for chametz, the pre-Pesach cutoff if that is sooner). */
  expires?: ISODate
  /** Held aside for an accepted menu. */
  heldFor?: string
  expired?: boolean
  expiringSoon?: boolean
}

export interface PantryList {
  today: ISODate
  items: PantryItem[]
}

// ---- Settings, keys, import, editing ----

export interface HouseholdLocation {
  lat: number
  lng: number
  timeZone: string
  israel: boolean
  name?: string
}

export interface HouseholdInfo {
  id: Id
  name: string
  location: HouseholdLocation
  locationSet: boolean
  /** Today in the household's time zone. */
  today: ISODate
  isOwner: boolean
}

export interface DisplayPrefs {
  system: 'us' | 'metric'
}

export interface ApiKey {
  id: Id
  prefix: string
  scope: 'read' | 'write'
  createdAt: number
  lastUsedAt?: number | null
  revoked: boolean
}

export interface CreatedApiKey extends ApiKey {
  /** The full key. Shown once. */
  key: string
}

export interface ImportPreview {
  title?: string
  servings?: number
  ingredients: { line: string; name: string; skipImpact: SkipImpact; section?: string }[]
  steps: { text: string; section?: string }[]
}

export interface ImportResult {
  recipeId: Id
  versionId: Id
  needsReview: string[]
  unquantified: string[]
}

/** What the version editor can change. Ingredients and steps are plain text, one per line, each in its section. */
export interface VersionEdit {
  /** Recipe title (the dish). */
  recipeTitle?: string
  /** This version's name. */
  label?: string
  course?: Course
  kind?: Kind
  servings?: number
  activeMin?: number
  totalMin?: number
  difficulty?: Difficulty
  cost?: Cost
  serving?: RecipeVersion['serving']
  holdsOnBlech?: boolean
  description?: string
  ingredients?: { text: string; section?: string }[]
  steps?: {
    text: string
    section?: string
    /** Ingredient lines (0-based positions in the ingredient list). Omit to keep the step's current links. */
    uses?: { line: number; portion?: number }[]
  }[]
}

export type ConstraintTagInput =
  'allergen' | 'ingredient' | 'diet' | 'kashrut-dish' | 'kashrut-sourcing'

export interface ConstraintInput {
  tagType: ConstraintTagInput
  tag: string
  kind: ConstraintKind
  severity: Severity
  /** `always`, a period (`pesach`, `aseret_yemei_teshuva`, `nine_days`) or a custom range. */
  activeWhen: string | { from: ISODate; to: ISODate }
  note?: string
}

export const PERSON_RULES: { id: string; label: string }[] = [
  { id: 'no_fish_dairy', label: 'No fish with dairy' },
  { id: 'no_fish_meat', label: 'No fish with meat' },
  { id: 'no_parve_from_dairy_at_meat', label: 'No parve dish from a dairy pot at a meat meal' },
  { id: 'no_parve_from_meat_at_dairy', label: 'No parve dish from a meat pot at a dairy meal' },
  { id: 'pesach_equipment_only', label: 'Pesach equipment only' },
]

export const PERIODS: { id: string; label: string }[] = [
  { id: 'pesach', label: 'Pesach' },
  { id: 'aseret_yemei_teshuva', label: 'Aseret Yemei Teshuva' },
  { id: 'nine_days', label: 'The Nine Days' },
]
