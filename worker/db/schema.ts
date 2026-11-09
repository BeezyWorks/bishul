// Tavshil's D1 schema (Drizzle). Migrations are generated into `/migrations` with `pnpm db:generate`; the FTS5 table
// and its triggers are hand-written SQL in a later migration. See README.md in this folder.
//
// Conventions: text ULID primary keys (client-generatable), `created_at`/`updated_at` as ms-epoch integers,
// `deleted_at` soft delete on user data. Users are external (BeezyWorks Accounts), so `*_user_id` columns are plain
// text with no foreign key.
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

import { ulid } from './ids'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => ulid())
const createdAt = () =>
  integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now())
const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now())
const deletedAt = () => integer('deleted_at')

/** id + created_at + updated_at + deleted_at. Spread into every table that holds user data. */
const base = () => ({
  id: id(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

const flagSource = ['seed', 'ai', 'user'] as const
export type FlagSource = (typeof flagSource)[number]
const dishCategory = ['meat', 'dairy', 'parve'] as const
/** Mirrors `DAY_SLOTS` in `@tavshil/core` (the schema stays free of runtime imports from it). */
const daySlots = [
  'breakfast',
  'kiddush',
  'brunch',
  'lunch',
  'seudah_shlishit',
  'dinner',
  'oneg',
] as const

// ---------------------------------------------------------------------------------------------------------------
// Households and people (BRIEF §3)
// ---------------------------------------------------------------------------------------------------------------

export type HouseholdLocation = {
  lat: number
  lng: number
  timeZone: string
  /** Israel vs diaspora, for holiday dates. */
  israel: boolean
  name?: string
}

export const households = sqliteTable(
  'households',
  {
    ...base(),
    ownerUserId: text('owner_user_id').notNull(),
    name: text('name').notNull(),
    location: text('location', { mode: 'json' }).$type<HouseholdLocation>(),
    /** A contact: a household a user created for someone in their circle. Visible only to the ghost's owner. */
    isGhost: integer('is_ghost', { mode: 'boolean' }).notNull().default(false),
    /** For a ghost: the real household it is a contact of (whose private layer it lives in). */
    ghostOfHouseholdId: text('ghost_of_household_id').references(
      (): AnySQLiteColumn => households.id,
    ),
  },
  (t) => [
    index('households_owner_idx').on(t.ownerUserId),
    index('households_ghost_of_idx').on(t.ghostOfHouseholdId),
  ],
)

export const householdMembers = sqliteTable(
  'household_members',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
  },
  (t) => [
    uniqueIndex('household_members_household_user_uq').on(t.householdId, t.userId),
    index('household_members_user_idx').on(t.userId),
  ],
)

export const persons = sqliteTable(
  'persons',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    /** Set when this person is a real user's own profile. */
    userId: text('user_id'),
    name: text('name').notNull(),
    isChild: integer('is_child', { mode: 'boolean' }).notNull().default(false),
    /** `YYYY-MM-DD`. Age is always derived from this and the household's today, never stored. */
    birthDate: text('birth_date'),
    /** True when `birth_date` was estimated from a stated age ("he's 5"), not a real birthday. */
    birthDateApprox: integer('birth_date_approx', { mode: 'boolean' }).notNull().default(false),
    /** Can they eat spicy food? Null = not known; never assumed from age. */
    spicy: text('spicy', { enum: ['yes', 'no'] }),
  },
  (t) => [index('persons_household_idx').on(t.householdId), index('persons_user_idx').on(t.userId)],
)

/** A ghost person (in my household's contacts) linked to a real person. */
export const personLinks = sqliteTable(
  'person_links',
  {
    ...base(),
    ghostPersonId: text('ghost_person_id')
      .notNull()
      .references(() => persons.id),
    realPersonId: text('real_person_id')
      .notNull()
      .references(() => persons.id),
    mode: text('mode', { enum: ['merge', 'overwrite'] }).notNull(),
    linkedAt: integer('linked_at').notNull(),
  },
  (t) => [
    uniqueIndex('person_links_ghost_uq').on(t.ghostPersonId),
    index('person_links_real_idx').on(t.realPersonId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// Constraints, rules, notes, reactions, serving history (BRIEF §4, §5)
// ---------------------------------------------------------------------------------------------------------------

export type ActiveWhen =
  { always: true } | { period: string } | { range: { from: string; to: string } }

export const constraints = sqliteTable(
  'constraints',
  {
    ...base(),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id),
    tagType: text('tag_type', {
      enum: ['allergen', 'ingredient', 'diet', 'kashrut_dish', 'kashrut_sourcing'],
    }).notNull(),
    tag: text('tag').notNull(),
    kind: text('kind', { enum: ['medical', 'religious', 'preference'] }).notNull(),
    severity: text('severity', { enum: ['strict', 'flexible'] }).notNull(),
    activeWhen: text('active_when', { mode: 'json' })
      .$type<ActiveWhen>()
      .notNull()
      .$defaultFn(() => ({ always: true })),
    note: text('note'),
    source: text('source', { enum: ['self', 'host', 'ai'] }).notNull(),
    /** Whose private layer this belongs to. Null = the person's own (visible through a live link). */
    layerHouseholdId: text('layer_household_id').references(() => households.id),
  },
  (t) => [
    index('constraints_person_idx').on(t.personId),
    index('constraints_layer_idx').on(t.layerHouseholdId),
  ],
)

export const personRuleNames = [
  'no_fish_dairy',
  'no_fish_meat',
  'no_parve_from_dairy_at_meat',
  'no_parve_from_meat_at_dairy',
] as const

/** Opt-in combination and equipment rules per person. */
export const personRules = sqliteTable(
  'person_rules',
  {
    ...base(),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id),
    /** One of `personRuleNames`; free text so new minhagim need no migration. */
    rule: text('rule').notNull(),
    layerHouseholdId: text('layer_household_id').references(() => households.id),
  },
  (t) => [index('person_rules_person_idx').on(t.personId)],
)

/** Private notes about a person, written by a household. Never visible to the person. */
export const notes = sqliteTable(
  'notes',
  {
    ...base(),
    authorHouseholdId: text('author_household_id')
      .notNull()
      .references(() => households.id),
    aboutPersonId: text('about_person_id')
      .notNull()
      .references(() => persons.id),
    text: text('text').notNull(),
  },
  (t) => [index('notes_person_idx').on(t.aboutPersonId, t.authorHouseholdId)],
)

// ---------------------------------------------------------------------------------------------------------------
// Recipes and versions (BRIEF §6)
// ---------------------------------------------------------------------------------------------------------------

export const recipes = sqliteTable(
  'recipes',
  {
    ...base(),
    ownerUserId: text('owner_user_id').notNull(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    title: text('title').notNull(),
  },
  (t) => [
    index('recipes_household_idx').on(t.householdId),
    index('recipes_owner_idx').on(t.ownerUserId),
  ],
)

export type FlagValue = { value: boolean; source: FlagSource }
export type VersionFlags = Partial<Record<string, FlagValue>> // gebrokts, kitniyot, chametz, ...
export type Nutrition = {
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
export type SourceLink = { url: string; label?: string }
export type PrePrepStep = { step: string; lead_minutes: number }
/** `section` is the part of the recipe this belongs to ("Cake"); nesting is written "Mousse > Meringue". */
export type RecipeStep = {
  text: string
  /** Minutes; half minutes are fine (0.5). */
  timer_minutes?: number
  /** What the timer is for ("Rest the dough"); cooking mode falls back to "Step N". */
  timer_label?: string
  section?: string
  /** The ingredient lines this step uses. */
  uses?: StepUse[]
}
/**
 * `line` is the 0-based position in the version's ingredient list. `portion` is the share of that line this step
 * uses (0-1) when the amount is divided between steps; absent means all of it.
 */
export type StepUse = { line: number; portion?: number }

export const recipeVersions = sqliteTable(
  'versions',
  {
    ...base(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    parentVersionId: text('parent_version_id').references((): AnySQLiteColumn => recipeVersions.id),
    /** Shared by forks and share-copies so duplicates can be found when merging recipe sets. */
    lineageId: text('lineage_id').notNull(),
    contentHash: text('content_hash').notNull(),
    /** Variation name ("fudgy", "pesach", "2x"); the recipe title is on `recipes`. */
    title: text('title').notNull(),
    description: text('description'),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>(),
    servings: integer('servings'),
    course: text('course'), // main, side, dessert, ...
    form: text('form'), // salad, soup, kugel, ...
    category: text('category', { enum: dishCategory }),
    difficulty: text('difficulty', { enum: ['easy', 'average', 'a_pain'] }),
    activeMinutes: integer('active_minutes'),
    totalMinutes: integer('total_minutes'),
    servingStyle: text('serving_style', { enum: ['hot', 'room_temperature', 'cold'] }),
    holdsOnBlech: integer('holds_on_blech', { mode: 'boolean' }),
    easyToDeliver: integer('easy_to_deliver', { mode: 'boolean' }),
    /** 1-3 for $, $$, $$$. */
    cost: integer('cost'),
    nutrition: text('nutrition', { mode: 'json' }).$type<Nutrition>(),
    prePrep: text('pre_prep', { mode: 'json' }).$type<PrePrepStep[]>(),
    steps: text('steps', { mode: 'json' }).$type<RecipeStep[]>(),
    /** gebrokts, kitniyot, ... each with its source (derived from ingredients, or set by hand -> 'user'). */
    flags: text('flags', { mode: 'json' }).$type<VersionFlags>(),
  },
  (t) => [
    index('versions_recipe_idx').on(t.recipeId),
    index('versions_lineage_idx').on(t.lineageId),
    index('versions_hash_idx').on(t.contentHash),
    index('versions_parent_idx').on(t.parentVersionId),
  ],
)

export const versionEquipment = sqliteTable(
  'version_equipment',
  {
    ...base(),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    item: text('item').notNull(),
    designation: text('designation', { enum: ['meat', 'dairy', 'parve', 'pesach'] }),
  },
  (t) => [index('version_equipment_version_idx').on(t.versionId)],
)

/**
 * Free-form keywords on a version ("spicy", "italian", "from Savta"). No vocabulary and no owner: `tag` is as typed
 * (trimmed, spaces collapsed), `key` is the folded form used to match and count ("One-Pot" = "one pot"). Descriptive
 * only; they never feed allergy or kashrut checks.
 */
export const versionTags = sqliteTable(
  'version_tags',
  {
    ...base(),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    tag: text('tag').notNull(),
    key: text('key').notNull(),
  },
  (t) => [
    index('version_tags_version_idx').on(t.versionId),
    index('version_tags_key_idx').on(t.key),
  ],
)

/** Occasion-fit dimensions: built-in (household null) or custom per household. */
export const dimensions = sqliteTable(
  'dimensions',
  {
    ...base(),
    householdId: text('household_id').references(() => households.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['jewish', 'civil', 'custom'] }).notNull(),
  },
  (t) => [index('dimensions_household_idx').on(t.householdId)],
)

export const versionDimensions = sqliteTable(
  'version_dimensions',
  {
    ...base(),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    dimensionId: text('dimension_id')
      .notNull()
      .references(() => dimensions.id),
    fit: text('fit', { enum: ['fine', 'good', 'especially'] }).notNull(),
  },
  (t) => [
    uniqueIndex('version_dimensions_uq').on(t.versionId, t.dimensionId),
    index('version_dimensions_dim_idx').on(t.dimensionId),
  ],
)

/** Append-only edit history (no soft delete). */
export const versionEdits = sqliteTable(
  'version_edits',
  {
    id: id(),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    userId: text('user_id').notNull(),
    via: text('via', { enum: ['web', 'api', 'mcp'] }).notNull(),
    summary: text('summary'),
    diff: text('diff', { mode: 'json' }).$type<unknown>(),
    at: integer('at')
      .notNull()
      .$defaultFn(() => Date.now()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('version_edits_version_idx').on(t.versionId, t.at)],
)

// ---------------------------------------------------------------------------------------------------------------
// Ingredient catalog and ingredient lines (BRIEF §7)
// ---------------------------------------------------------------------------------------------------------------

/** chametz, kitniyot, gebrokts, animal_derived, egg, honey, grain, pat, meat_derived, ... */
export type IngredientFlags = Partial<Record<string, FlagValue>>
export type IngredientAllergens = { tag: string; source: FlagSource }[]

export const ingredients = sqliteTable(
  'ingredients',
  {
    ...base(),
    /** Null = global catalog entry. */
    householdId: text('household_id').references(() => households.id),
    name: text('name').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>(),
    category: text('category', { enum: ['meat', 'dairy', 'parve', 'fish'] }).notNull(),
    allergens: text('allergens', { mode: 'json' }).$type<IngredientAllergens>(),
    flags: text('flags', { mode: 'json' }).$type<IngredientFlags>(),
    densityGPerMl: real('density_g_per_ml'),
    gramsPerPiece: real('grams_per_piece'),
    /** Where the density / piece weight came from. */
    sources: text('sources', { mode: 'json' }).$type<Record<string, FlagSource>>(),
  },
  (t) => [
    index('ingredients_household_idx').on(t.householdId),
    index('ingredients_name_idx').on(t.name),
  ],
)

export type Substitution = { ingredient_id?: string; text: string; note?: string }

export const ingredientLines = sqliteTable(
  'ingredient_lines',
  {
    ...base(),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    position: integer('position').notNull(),
    /** The part of the recipe this line belongs to ("Cake", "Mousse > Meringue"); null for a one-part recipe. */
    section: text('section'),
    /** Canonical metric amount; the original as written is `originalText`. */
    quantityMetric: real('quantity_metric'),
    unitMetric: text('unit_metric'),
    originalText: text('original_text').notNull(),
    ingredientId: text('ingredient_id').references(() => ingredients.id),
    prepNote: text('prep_note'),
    skipImpact: text('skip_impact', { enum: ['none', 'minor', 'ruins'] })
      .notNull()
      .default('ruins'),
    substitutions: text('substitutions', { mode: 'json' }).$type<Substitution[]>(),
  },
  (t) => [
    index('ingredient_lines_version_idx').on(t.versionId, t.position),
    index('ingredient_lines_ingredient_idx').on(t.ingredientId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// Meals (BRIEF §9)
// ---------------------------------------------------------------------------------------------------------------

export const meals = sqliteTable(
  'meals',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    /** YYYY-MM-DD in the household's time zone. */
    date: text('date').notNull(),
    name: text('name').notNull(),
    /** Minutes after midnight, household time. */
    time: integer('time'),
    /** Meat / dairy / parve (the meal's own kashrut kind), not where it sits in the day: see `slot`. */
    kind: text('kind', { enum: dishCategory }),
    /** Where the meal sits in the day (breakfast ... dinner, oneg). Orders meals within a day. */
    slot: text('slot', { enum: daySlots }).notNull().default('dinner'),
    /**
     * A meal with guests, courses, or both: it has a full page. Set when a non-household guest is invited or the
     * meal is created as hosted. Shabbat and Yom Tov meals are always hosted whether or not this is set.
     */
    hosted: integer('hosted', { mode: 'boolean' }).notNull().default(false),
    /** The name was typed by the user: moving the meal to another day does not rename it. */
    nameEdited: integer('name_edited', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['draft', 'accepted'] })
      .notNull()
      .default('draft'),
    acceptedAt: integer('accepted_at'),
    /** When the passed meal was settled: serving history written and pantry stock used. Null until then. */
    settledAt: integer('settled_at'),
  },
  (t) => [index('meals_household_date_idx').on(t.householdId, t.date)],
)

/**
 * Which households are on a meal's guest list. Who is actually coming stays in `meal_attendees` (a person with a row
 * is coming); a household here with none of its members attending is invited but everyone is away. The meal's own
 * household is always on the list and needs no row. Meals that predate this table list the households of their
 * attendees.
 */
export const mealHouseholds = sqliteTable(
  'meal_households',
  {
    ...base(),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
  },
  (t) => [uniqueIndex('meal_households_uq').on(t.mealId, t.householdId)],
)

export const mealAttendees = sqliteTable(
  'meal_attendees',
  {
    ...base(),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id),
  },
  (t) => [
    uniqueIndex('meal_attendees_uq').on(t.mealId, t.personId),
    index('meal_attendees_person_idx').on(t.personId),
  ],
)

/** Either a recipe version (versionId + scale + servings) or a brought dish (broughtBy + description + kashrut). */
export const mealItems = sqliteTable(
  'meal_items',
  {
    ...base(),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id),
    position: integer('position').notNull(),
    course: text('course'),
    versionId: text('version_id').references(() => recipeVersions.id),
    scale: real('scale'),
    servings: integer('servings'),
    broughtBy: text('brought_by'),
    description: text('description'),
    kashrut: text('kashrut', { enum: dishCategory }),
    /** Checked off on the accepted menu. */
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('meal_items_meal_idx').on(t.mealId, t.position),
    index('meal_items_version_idx').on(t.versionId),
  ],
)

export const reactions = sqliteTable(
  'reactions',
  {
    ...base(),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    reaction: text('reaction', { enum: ['like', 'dislike'] }).notNull(),
    note: text('note'),
    recordedByUserId: text('recorded_by_user_id').notNull(),
    layerHouseholdId: text('layer_household_id')
      .notNull()
      .references(() => households.id),
  },
  (t) => [
    index('reactions_person_idx').on(t.personId),
    index('reactions_version_idx').on(t.versionId),
  ],
)

export const servedLog = sqliteTable(
  'served_log',
  {
    ...base(),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id),
    versionId: text('version_id')
      .notNull()
      .references(() => recipeVersions.id),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id),
    /** YYYY-MM-DD. */
    servedOn: text('served_on').notNull(),
    /** The host household whose history this is (survives unlinking). */
    layerHouseholdId: text('layer_household_id')
      .notNull()
      .references(() => households.id),
  },
  (t) => [
    index('served_log_person_idx').on(t.personId, t.servedOn),
    index('served_log_version_idx').on(t.versionId),
    uniqueIndex('served_log_uq').on(t.mealId, t.versionId, t.personId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// Kitchen, pantry, shopping (BRIEF §8, §9). Pantry holds and shopping totals are computed, not stored.
// ---------------------------------------------------------------------------------------------------------------

export const pantryItems = sqliteTable(
  'pantry_items',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantityMetric: real('quantity_metric'),
    unit: text('unit'),
    location: text('location'),
    /** YYYY-MM-DD. */
    expiresOn: text('expires_on'),
  },
  (t) => [
    index('pantry_household_idx').on(t.householdId),
    index('pantry_ingredient_idx').on(t.ingredientId),
  ],
)

export const equipment = sqliteTable(
  'equipment',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    item: text('item').notNull(),
    count: integer('count').notNull().default(1),
    designation: text('designation', { enum: ['meat', 'dairy', 'parve', 'pesach'] }),
  },
  (t) => [index('equipment_household_idx').on(t.householdId)],
)

/** Order, checked state and manual lines only; totals come from accepted meals minus pantry. */
export const shoppingList = sqliteTable(
  'shopping_list',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    /** Null for a manual line (then `manual` holds the text). */
    ingredientId: text('ingredient_id').references(() => ingredients.id),
    position: integer('position').notNull(),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    note: text('note'),
    manual: text('manual'),
  },
  (t) => [
    index('shopping_household_idx').on(t.householdId, t.position),
    index('shopping_ingredient_idx').on(t.ingredientId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// Sharing and API keys (BRIEF §10, §11)
// ---------------------------------------------------------------------------------------------------------------

export const shareLinks = sqliteTable(
  'share_links',
  {
    ...base(),
    token: text('token').notNull(),
    kind: text('kind', { enum: ['version', 'dish', 'profile'] }).notNull(),
    targetId: text('target_id').notNull(),
    /** Profile links: the content as shared. Recipe links are read live; this is the fallback if the recipe is deleted. */
    snapshot: text('snapshot', { mode: 'json' }).$type<unknown>().notNull(),
    createdBy: text('created_by').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    uniqueIndex('share_links_token_uq').on(t.token),
    index('share_links_creator_idx').on(t.createdBy),
    index('share_links_target_idx').on(t.kind, t.targetId),
  ],
)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    ...base(),
    userId: text('user_id').notNull(),
    /** SHA-256 of the key; the plain key is shown once. */
    hashedKey: text('hashed_key').notNull(),
    prefix: text('prefix').notNull(),
    scope: text('scope', { enum: ['read', 'write'] }).notNull(),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [uniqueIndex('api_keys_hash_uq').on(t.hashedKey), index('api_keys_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------------------------------------------
// Invites, saved filters and display preferences (added with the service layer)
// ---------------------------------------------------------------------------------------------------------------

/** An invite link: whoever opens it while signed in joins the household. Unguessable token, expires, revocable. */
export const householdInvites = sqliteTable(
  'household_invites',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    token: text('token').notNull(),
    createdBy: text('created_by').notNull(),
    expiresAt: integer('expires_at').notNull(),
    acceptedBy: text('accepted_by'),
    acceptedAt: integer('accepted_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    uniqueIndex('household_invites_token_uq').on(t.token),
    index('household_invites_household_idx').on(t.householdId),
  ],
)

export type RecipeFilterSpec = {
  q?: string
  course?: string
  kashrut?: 'meat' | 'dairy' | 'parve'
  safeFor?: string[]
  pesach?: boolean
  maxMinutes?: number
  notServedWeeks?: number
  difficulty?: 'easy' | 'average' | 'a_pain'
  maxCost?: number
  dimension?: string
}

/** Collections: saved recipe filters, usually on a dimension ("Shabbat staples", "Thanksgiving"). */
export const collections = sqliteTable(
  'collections',
  {
    ...base(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    filters: text('filters', { mode: 'json' }).$type<RecipeFilterSpec>().notNull(),
  },
  (t) => [index('collections_household_idx').on(t.householdId)],
)

export type UnitOverride = { system?: 'us' | 'metric'; dimension?: 'weight' | 'volume' }

/** Per-user display preferences: US or metric, plus per-category overrides (flour and sugar in grams, ...). */
export const userPrefs = sqliteTable(
  'user_prefs',
  {
    ...base(),
    userId: text('user_id').notNull(),
    system: text('system', { enum: ['us', 'metric'] })
      .notNull()
      .default('us'),
    overrides: text('overrides', { mode: 'json' }).$type<Record<string, UnitOverride>>(),
  },
  (t) => [uniqueIndex('user_prefs_user_uq').on(t.userId)],
)
