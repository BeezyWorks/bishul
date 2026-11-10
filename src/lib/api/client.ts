/**
 * The single place the UI gets data from. Screens call `api.*` (through the hooks in `hooks.ts`)
 * and never import an implementation directly. `real.ts` talks to the REST API; `mock.ts` is the
 * in-memory demo, chosen with `EXPO_PUBLIC_USE_MOCK=1`.
 */
import { USE_MOCK } from '@/lib/config'

import { realApi } from './real'
import type {
  AddDishInput,
  ApiKey,
  CalendarDay,
  Collection,
  TagCount,
  ConstraintInput,
  Course,
  CreatedApiKey,
  DisplayPrefs,
  Household,
  HouseholdInfo,
  HostedMeal,
  HostedPage,
  HouseholdLocation,
  Id,
  ImportPreview,
  ImportResult,
  ISODate,
  Kind,
  Meal,
  MealDetail,
  MealPatch,
  MealRecipeSearch,
  MenuItemInput,
  NewMealInput,
  Occasion,
  PantryList,
  Person,
  PlanView,
  PrepDay,
  Recipe,
  RecipeFilters,
  RecipeShare,
  RecipeSummary,
  RecipeVersion,
  SharedRecipe,
  ShoppingLine,
  SuggestionResult,
  VersionEdit,
} from './types'

export interface AcceptResult {
  accepted: Id[]
  blocked: { id: Id; name: string; problems: string[] }[]
}

export interface TavshilApi {
  // Household and settings
  getHouseholdInfo(): Promise<HouseholdInfo>
  updateHousehold(patch: { name?: string; location?: HouseholdLocation }): Promise<HouseholdInfo>
  getPrefs(): Promise<DisplayPrefs>
  setPrefs(prefs: Partial<DisplayPrefs>): Promise<DisplayPrefs>
  listApiKeys(): Promise<ApiKey[]>
  createApiKey(scope: 'read' | 'write'): Promise<CreatedApiKey>
  revokeApiKey(id: Id): Promise<void>

  // Planning
  getUpcoming(): Promise<Occasion[]>
  getCalendar(range: { from: ISODate; to: ISODate }): Promise<CalendarDay[]>
  getMeal(mealId: Id): Promise<MealDetail>
  /** `time` is 24-hour "18:30". */
  createMeal(date: ISODate, name: string, time?: string): Promise<Meal>
  deleteMeal(mealId: Id): Promise<void>
  setMealKind(mealId: Id, kind: Kind): Promise<MealDetail>
  /** Rename a meal and/or change its time (24-hour "18:30"; empty clears it). */
  updateMealDetails(mealId: Id, change: { name?: string; time?: string }): Promise<MealDetail>
  /** `guestIds`: contacts invited; `notComing`: people dropped from this meal. */
  setAttendees(mealId: Id, attendees: { guestIds: Id[]; notComing: Id[] }): Promise<MealDetail>
  addMenuItem(mealId: Id, course: Course, item: MenuItemInput): Promise<MealDetail>
  removeMenuItem(mealId: Id, itemId: Id): Promise<MealDetail>
  /** Check a dish off (or back on) the accepted menu. Does not reopen the meal. */
  setItemDone(mealId: Id, itemId: Id, done: boolean): Promise<MealDetail>
  getSuggestions(mealId: Id, course: Course): Promise<SuggestionResult>
  /** Fills the menu with a balanced set from the top suggestions. */
  suggestMenu(mealId: Id): Promise<MealDetail>
  acceptMeals(mealIds: Id[]): Promise<AcceptResult>
  reopenMeals(mealIds: Id[]): Promise<void>

  // Plan tab: weeks, runs and hosted meals
  /** The Sunday-to-Saturday week containing `date` (default: today in the household's time zone). */
  getWeek(date?: ISODate): Promise<PlanView>
  /** The same shape for any range up to 62 days (the month view). */
  getPlan(range: { from: ISODate; to: ISODate }): Promise<PlanView>
  /** A run (`run-2027-04-22`) or a single hosted meal (`meal-<id>`; a run's meal gives its run). */
  getHosted(key: string): Promise<HostedPage>
  getHostedMeal(mealId: Id): Promise<HostedMeal>
  /** Creates the default meal of a holy day (Seder I...) if it does not exist yet; idempotent. */
  ensureRunMeal(input: {
    runKey: string
    holyDate: ISODate
    part: 'night' | 'day'
  }): Promise<{ mealId: Id; created: boolean; hostedKey: string }>
  /** New meal in a slot; the household is in by default. Returns the meal as a hosted row. */
  createPlanMeal(input: NewMealInput): Promise<HostedMeal>
  /** Rename, retime, move to another slot or day, or mark hosted. A typed name is kept from then on. */
  updatePlanMeal(mealId: Id, patch: MealPatch): Promise<HostedMeal>
  /** Invite a household: all its members come. A guest makes the meal hosted. */
  addMealHousehold(mealId: Id, householdId: Id): Promise<HostedMeal>
  removeMealHousehold(mealId: Id, householdId: Id): Promise<HostedMeal>
  /** Tick (coming) or untick (away) one person. */
  setMealPerson(mealId: Id, personId: Id, present: boolean): Promise<HostedMeal>
  addMealDish(mealId: Id, dish: AddDishInput): Promise<HostedMeal>
  removeMealDish(mealId: Id, itemId: Id): Promise<HostedMeal>
  /** To a course, before another dish of it (`beforeItemId`) or at the end. */
  moveMealDish(
    mealId: Id,
    itemId: Id,
    to: { course: string; beforeItemId?: Id },
  ): Promise<HostedMeal>
  /** Recipes that pass every attendee's constraints at this meal, and the ones that don't with why. */
  searchRecipesForMeal(
    mealId: Id,
    query: { q?: string; course?: string; limit?: number },
  ): Promise<MealRecipeSearch>
  /** A new, empty contact household ("The Roths"); add its members with `addPerson`. */
  createContactHousehold(name: string): Promise<Household>

  // Recipes
  searchRecipes(query: string, filters: RecipeFilters): Promise<RecipeSummary[]>
  getRecipe(recipeId: Id): Promise<Recipe>
  /** A single version with its recipe, for cooking mode. */
  getVersion(versionId: Id): Promise<{ recipe: Recipe; version: RecipeVersion }>
  getCollections(): Promise<Collection[]>
  /** Tags in use, most used first. */
  getTags(): Promise<TagCount[]>
  saveCollection(name: string, filters: RecipeFilters): Promise<Collection>
  updateCollection(id: Id, name: string, filters: RecipeFilters): Promise<Collection>
  deleteCollection(id: Id): Promise<void>
  /** Parses pasted text without saving. */
  previewImport(text: string, title?: string): Promise<ImportPreview>
  importRecipe(input: { text: string; title?: string; servings?: number }): Promise<ImportResult>
  saveVersion(versionId: Id, edit: VersionEdit): Promise<void>
  /** Forks a version into a named variation and returns the new version's id. */
  createVariation(versionId: Id, label: string, edit?: VersionEdit): Promise<Id>

  // Sharing: a recipe link is live; a saved copy is independent
  /** The recipe's public link (the same one if it is already shared). */
  shareRecipe(recipeId: Id): Promise<RecipeShare>
  stopSharing(shareId: Id): Promise<void>
  /** Public: no sign-in needed. The recipe as the author has it now. */
  getShared(token: string): Promise<SharedRecipe>
  /** Copies the recipe, as it is now, into the signed-in user's cookbook. */
  saveShared(token: string): Promise<{ recipeId: Id }>

  // People
  getHousehold(): Promise<Household>
  getContacts(): Promise<Household[]>
  getPerson(personId: Id): Promise<{ person: Person; household: Household }>
  addPersonNote(personId: Id, note: string): Promise<void>
  /** In your household, in a contact household, or (with `newContactHousehold`) in a new one. */
  addPerson(input: {
    name: string
    isChild?: boolean
    birthDate?: string
    age?: number
    contactHouseholdId?: Id
    newContactHousehold?: string
  }): Promise<Person>
  /** Set a birthday (exact) or an age (estimated); null clears it. */
  setPersonBirth(personId: Id, input: { birthDate: string | null } | { age: number }): Promise<void>
  /** Whether they can eat spicy food; null goes back to not known. */
  setPersonSpicy(personId: Id, spicy: 'yes' | 'no' | null): Promise<void>
  addConstraint(personId: Id, constraint: ConstraintInput): Promise<void>
  removeConstraint(personId: Id, constraintId: Id): Promise<void>
  setPersonRules(personId: Id, rules: string[]): Promise<void>
  recordReaction(
    personId: Id,
    versionId: Id,
    /** `none` clears the person's reaction to that version. */
    reaction: 'like' | 'dislike' | 'none',
    note?: string,
  ): Promise<void>

  // Shopping, prep, pantry
  getShoppingList(): Promise<ShoppingLine[]>
  setShoppingChecked(lineId: Id, checked: boolean): Promise<ShoppingLine[]>
  /** The full order of the lines as shown. */
  setShoppingOrder(lineIds: Id[]): Promise<ShoppingLine[]>
  addShoppingLine(name: string): Promise<ShoppingLine[]>
  removeShoppingLine(lineId: Id): Promise<ShoppingLine[]>
  getPrepSchedule(): Promise<PrepDay[]>
  getPantry(): Promise<PantryList>
  /** The use-soon list: `expires` is required unless the item is chametz. */
  addPantryItem(item: { name: string; quantity: string; expires?: ISODate }): Promise<void>
  updatePantryItem(itemId: Id, patch: { quantity?: string; expires?: ISODate }): Promise<void>
  removePantryItem(itemId: Id): Promise<void>
}

// The mock (and its fixtures) is only bundled when the demo build asks for it.
export const api: TavshilApi = USE_MOCK
  ? (require('./mock') as typeof import('./mock')).mockApi
  : realApi
