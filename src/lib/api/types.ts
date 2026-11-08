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
  /** Can they eat spicy food? Unset means not known; never assumed from age. */
  spicy?: 'yes' | 'no'
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

// ---- Sharing (BRIEF §10) ----

export interface RecipeShare {
  id: Id
  url: string
}

export interface SharedVersion {
  title: string
  description: string | null
  servings: number | null
  totalMinutes: number | null
  ingredients: { section?: string | null; text: string; allergens: string[] }[]
  steps: { text: string; section?: string }[]
  equipment: string[]
}

/** A recipe as its author has it right now, read from a share link. */
export interface SharedRecipe {
  title: string
  versions: SharedVersion[]
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

export interface NutritionInfo {
  perServing?: boolean
  calories?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  fiberG?: number
  sugarG?: number
  sodiumMg?: number
  source?: 'ai' | 'user'
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
  nutrition?: NutritionInfo
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
  /** Hand-set dish flags (`spicy`, `kid_friendly`). Send the full set; it replaces the old one. */
  flags?: Record<string, boolean>
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

// ---- Plan tab: weeks, runs and hosted meals (docs/plan-redesign-contract.md) ----
// These mirror what the worker returns for GET /week, /plan and /hosted/:key. No adapting: the server shapes them.

/** Where a meal sits in the day. Orders meals within a day. */
export type DaySlot =
  'breakfast' | 'kiddush' | 'brunch' | 'lunch' | 'seudah_shlishit' | 'dinner' | 'oneg'

export interface Headcount {
  adults: number
  children: number
  total: number
}

/** A constraint as short text. Strict allergies are `strictAllergy` (danger color). */
export interface ConstraintLabel {
  text: string
  strictAllergy: boolean
  strict: boolean
}

export interface DayHoliday {
  name: string
  kind: 'jewish' | 'civil'
}

export interface MealProblemCounts {
  allergies: number
  gaps: number
  other: number
  total: number
}

/** A meal as a tile: enough for a week cell, a run tile or a folded row. */
export interface MealCard {
  /** Null for a default meal of a holy day that does not exist yet (`virtual`): create it with `create`. */
  id: Id | null
  virtual: boolean
  create: { date: ISODate; slot: DaySlot; name: string } | null
  date: ISODate
  slot: DaySlot
  slotLabel: string
  name: string
  nameEdited: boolean
  /** Minutes after midnight. */
  time: number | null
  /** 24-hour `HH:MM`. */
  timeText: string | null
  status: 'draft' | 'accepted'
  kind: Kind | null
  /** Has a full page: flagged, in a run, or has a guest from another household. */
  hosted: boolean
  /** `run-2027-04-22` when the meal belongs to a run of Shabbat / Yom Tov days. */
  runKey: string | null
  /** Open `/hosted/${hostedKey}`. */
  hostedKey: string
  /** The holy day (its date) and part of it: `night` is the evening that starts it. */
  holyDate: ISODate | null
  part: 'night' | 'day' | null
  /** Dish titles of the main course (else the first course with dishes) in menu order. Empty: "Not planned". */
  summary: string[]
  itemCount: number
  planned: boolean
  headcount: Headcount
  /** `2 adults, 1 child` */
  headcountText: string
  /** `Jochanan away` */
  awayText: string
  guestHouseholds: number
  hasGuests: boolean
  problems: MealProblemCounts
}

export interface WeekDay {
  date: ISODate
  /** 0 = Sunday. */
  weekday: number
  isToday: boolean
  hebrew: string
  parasha: string | null
  holidays: DayHoliday[]
  isShabbat: boolean
  isYomTov: boolean
  isCholHamoed: boolean
  isErevShabbat: boolean
  isErevYomTov: boolean
  /** Minutes and text (`4:21`) of the candle lighting that starts tomorrow's holy day. */
  candleLighting: { minutes: number; text: string } | null
  havdalah: { minutes: number; text: string } | null
  /** Set when this day is a holy day of a run: the run's tile is shown, not meal cells. */
  holyDay: { runKey: string; label: string } | null
  /** Tonight's holy-day meal: replaces this day's dinner slot with a "Plan Seder I →" link. */
  eve: {
    runKey: string
    holyDate: ISODate
    mealName: string
    holyDayLabel: string
    /** The meal if it exists already (then link to its page), else null (use `ensureRunMeal`). */
    meal: MealCard | null
  } | null
  /** Weekday meals of this date, in order. Meals that belong to a run are in the run, not here. */
  meals: MealCard[]
}

export interface RunHolyDay {
  date: ISODate
  /** The civil day before: the evening that starts this holy day. */
  eveDate: ISODate
  /** `Pesach I`, `Pesach II`, `Shabbat`, `Shvi'i shel Pesach`... */
  label: string
  isShabbat: boolean
  isYomTov: boolean
  isCholHamoed: boolean
  /** Evening meal first. Default meals that are not created yet are `virtual`. */
  meals: MealCard[]
}

export interface RunSummary {
  /** `run-2027-04-22` */
  key: string
  /** `Pesach · first days`, `Shabbat Toldot` */
  title: string
  from: ISODate
  to: ISODate
  /** The civil date of the first night. */
  startsOn: ISODate
  holyDays: RunHolyDay[]
  mealCount: number
  toPlan: number
  problems: { allergies: number; gaps: number; total: number }
}

export interface PlanView {
  today: ISODate
  from: ISODate
  to: ISODate
  location: { timeZone: string; israel: boolean }
  parasha: string | null
  days: WeekDay[]
  runs: RunSummary[]
}

export interface GuestMember {
  personId: Id
  name: string
  isChild: boolean
  /** Ticked = coming. */
  present: boolean
  constraints: ConstraintLabel[]
}

export interface GuestHousehold {
  householdId: Id
  name: string
  /** Your own household: always on the list, not removable. */
  isHost: boolean
  members: GuestMember[]
  counts: Headcount
  countsText: string
  awayText: string
  /** Everyone's constraints combined, strict allergies first. */
  constraints: ConstraintLabel[]
  removable: boolean
}

export interface MealProblem {
  kind: 'allergy' | 'exclusion' | 'rule' | 'meal' | 'gap'
  severity: 'error' | 'warning'
  text: string
  dishId?: Id
  dishTitle?: string
  /** Menu items to highlight and offer "Replace dish" on. */
  itemIds: Id[]
  personId?: Id
  personName?: string
  course?: string
}

export interface MealProblems {
  problems: MealProblem[]
  aiNotes: { dishId: Id; dishTitle: string; itemIds: Id[]; text: string }[]
  unchecked: { dishId: Id; title: string; by: string; itemIds: Id[] }[]
  counts: MealProblemCounts
}

export interface HostedMenuItem {
  itemId: Id
  position: number
  course: string | null
  title: string
  recipeId: Id | null
  versionId: Id | null
  versionTitle: string | null
  kashrut: Kind | null
  /** Typed in, with no recipe (or brought by a guest). */
  noRecipe: boolean
  broughtBy: string | null
  problems: MealProblem[]
}

export interface HostedCourse {
  /** `starter`, `main`, `dessert`, or custom. The defaults are always present, empty or not. */
  course: string
  label: string
  items: HostedMenuItem[]
}

export interface HostedMeal extends MealCard {
  menu: HostedCourse[]
  households: GuestHousehold[]
  problemDetails: MealProblems
  /** Food notes for the printed menu ("peanut-free meal"): never names. */
  foodNotes: string[]
  disclaimer: string
}

export interface HostedHolyDay {
  date: ISODate
  /** Empty for a single weekday meal. */
  label: string
  isShabbat: boolean
  isYomTov: boolean
  meals: HostedMeal[]
}

export type HostedFix = MealProblem & { mealId: Id | null; mealName: string; dayLabel: string }

export interface HostedPage {
  key: string
  type: 'run' | 'meal'
  title: string
  from: ISODate
  to: ISODate
  startsOn: ISODate
  today: ISODate
  location: { timeZone: string; israel: boolean }
  paper: 'letter' | 'a4'
  days: HostedHolyDay[]
  totals: { meals: number; toPlan: number; withGuests: number; withProblems: number }
  fixes: HostedFix[]
  disclaimer: string
}

export interface NewMealInput {
  date: ISODate
  /** Leave out to name it after its day. */
  name?: string
  slot?: DaySlot
  /** 24-hour "18:30". */
  time?: string
  hosted?: boolean
  /** Guest households to invite (all their members come). */
  householdIds?: Id[]
}

export interface MealPatch {
  name?: string
  /** 24-hour "18:30"; empty string clears it. */
  time?: string
  slot?: DaySlot
  date?: ISODate
  hosted?: boolean
}

export interface AddDishInput {
  /** `starter`, `main`, `dessert` or a custom course. */
  course: string
  /** A recipe version… */
  versionId?: Id
  /** …or a dish without a recipe. */
  description?: string
  kashrut?: Kind
  broughtBy?: string
  servings?: number
}

export interface MealRecipeHit {
  recipeId: Id
  versionId: Id
  title: string
  versionTitle: string
  course: string | null
  kashrut: Kind
  /** `pareve · fits everyone` */
  note: string
  /** Why it does not fit; empty when it does. */
  why: string[]
  failsFor: { personId: Id; personName: string }[]
  eatAround: string[]
  aiWarnings: string[]
}

export interface MealRecipeSearch {
  mealId: Id
  attendees: { personId: Id; name: string }[]
  fits: MealRecipeHit[]
  excluded: MealRecipeHit[]
  total: number
  disclaimer: string
}

/** A household as the guest search sees it (build the list with `useGuestPool()`). */
export interface PickableHousehold {
  id: Id
  name: string
  members: { id: Id; name: string; isChild: boolean; constraints: ConstraintLabel[] }[]
}
