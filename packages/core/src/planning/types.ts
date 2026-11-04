// Plain-data input and output types for planning: calendar, dining brief, ranking and the prep schedule.
// These are not database rows; the API layer maps its rows onto them.

/** `YYYY-MM-DD`, a civil date in the household's time zone. */
export type DateString = string
/** Minutes since local midnight (may exceed 1439 or be negative where a span crosses midnight). */
export type Minutes = number

// ---------------------------------------------------------------------------
// Location and seasons

export interface HouseholdLocation {
  lat: number
  lng: number
  /** IANA zone, e.g. `America/New_York`. */
  timeZone: string
  /** Israel holiday schedule (one day of Yom Tov, Israel parsha cycle). */
  israel: boolean
  /** Meters above sea level. Passed to the engine; candle lighting and nightfall stay sea-level. */
  elevation?: number
  /** Minutes before sunset. Default: 40 in Jerusalem, 20 elsewhere in Israel, 18 in the diaspora. */
  candleLightingMinutes?: number
  /** Built-in civil holiday calendar. Default: inferred from the time zone (`America/*` gives US). */
  civilCalendar?: 'us' | 'uk' | 'ca' | 'ca-qc' | 'fr' | 'none'
}

export const PERIOD_NAMES = ['pesach', 'aseret_yemei_teshuva', 'nine_days', 'sefirah'] as const
export type PeriodName = (typeof PERIOD_NAMES)[number]

export type ActiveWhen =
  | { always: true }
  | { period: PeriodName }
  /** Inclusive civil dates. */
  | { range: { from: DateString; to: DateString } }

// ---------------------------------------------------------------------------
// People and constraints

export type ConstraintKind = 'medical' | 'religious' | 'preference'
export type Severity = 'strict' | 'flexible'
export type ConstraintSource = 'self' | 'host' | 'ai'

/** Per-person combination and equipment rules (opt-in; practice varies). */
export const PERSON_RULES = [
  'no_fish_dairy',
  'no_fish_meat',
  'no_parve_from_dairy_at_meat',
  'no_parve_from_meat_at_dairy',
  'pesach_equipment_only',
] as const
export type PersonRule = (typeof PERSON_RULES)[number]

export const SOURCING_STANDARDS = ['chalav_yisrael', 'pat_yisrael', 'yashan', 'glatt'] as const
export type SourcingStandard = (typeof SOURCING_STANDARDS)[number]

export type ConstraintTag =
  /** peanut, sesame, ... matched against an ingredient's `allergens`. */
  | { type: 'allergen'; value: string }
  /** cilantro, ... matched against an ingredient's name (whole words) or aliases. */
  | { type: 'ingredient'; value: string }
  | { type: 'diet'; value: 'vegetarian' | 'vegan' | 'pescatarian' }
  /** Dish-level kashrut: a flag the dish must not carry (`kitniyot`, `gebrokts`, `chametz`). */
  | { type: 'kashrut'; value: string }
  | { type: 'rule'; value: PersonRule }
  /** Sourcing standards never exclude a dish; they only add sourcing notes. */
  | { type: 'sourcing'; value: SourcingStandard }

export interface Constraint {
  tag: ConstraintTag
  kind: ConstraintKind
  severity: Severity
  activeWhen: ActiveWhen
  note?: string
  source: ConstraintSource
}

export interface Person {
  id: string
  name: string
  /** Everything that applies to this person, including the host's private-layer additions (see `mergePrivateLayer`). */
  constraints: Constraint[]
}

// ---------------------------------------------------------------------------
// Dishes (a version summary)

export type MeatDairy = 'meat' | 'dairy' | 'parve'
export type IngredientCategory = 'meat' | 'dairy' | 'parve' | 'fish'
export type DataSource = 'seed' | 'ai' | 'user'
export type SkipImpact = 'none' | 'minor' | 'ruins'
export type EquipmentDesignation = 'meat' | 'dairy' | 'parve' | 'pesach'
export type ServingStyle = 'hot' | 'room_temperature' | 'cold'
export type Difficulty = 'easy' | 'average' | 'a_pain'
export type OccasionFit = 'fine' | 'good' | 'especially_suited'

export interface DishIngredient {
  name: string
  aliases?: string[]
  category: IngredientCategory
  /** Allergens this ingredient contains. Absence means "none known". */
  allergens: string[]
  /** chametz, kitniyot, gebrokts, animal_derived, meat_derived, egg, honey, grain, pat, ... */
  flags: string[]
  /** Where the allergen and kashrut data for this ingredient came from. `ai` data is called out in the brief. */
  dataSource: DataSource
  skipImpact: SkipImpact
}

export interface EquipmentUse {
  name: string
  designation: EquipmentDesignation
}

export interface DishVersion {
  id: string
  /** Recipe id, to avoid suggesting two versions of the same recipe. */
  recipeId?: string
  title: string
  kashrut: MeatDairy
  /** main, side, salad, soup, dessert, ... */
  course?: string
  /** salad, soup, kugel, ... used to keep a menu varied. */
  form?: string
  ingredients: DishIngredient[]
  equipment?: EquipmentUse[]
  /** Dish-level flags set by hand, beside the ones derived from ingredients. */
  flags?: string[]
  difficulty?: Difficulty
  occasionFit?: Record<string, OccasionFit>
  /** A guest is bringing it: counts for meal-level kashrut but its ingredients are not checked. */
  brought?: { by: string }
}

// ---------------------------------------------------------------------------
// Meal kinds

/** The meal's own meat / dairy / parve status. */
export type MealKind = MeatDairy
