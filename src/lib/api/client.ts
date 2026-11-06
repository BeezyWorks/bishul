/**
 * The single place the UI gets data from. Screens call `api.*` (through the hooks in `hooks.ts`)
 * and never import an implementation directly. `real.ts` talks to the REST API; `mock.ts` is the
 * in-memory demo, chosen with `EXPO_PUBLIC_USE_MOCK=1`.
 */
import { USE_MOCK } from '@/lib/config'

import { realApi } from './real'
import type {
  ApiKey,
  CalendarDay,
  Collection,
  ConstraintInput,
  Course,
  CreatedApiKey,
  DisplayPrefs,
  Household,
  HouseholdInfo,
  HouseholdLocation,
  Id,
  ImportPreview,
  ImportResult,
  ISODate,
  Kind,
  Meal,
  MealDetail,
  MenuItemInput,
  Occasion,
  PantryList,
  Person,
  PrepDay,
  Recipe,
  RecipeFilters,
  RecipeSummary,
  RecipeVersion,
  ShoppingLine,
  SuggestionResult,
  VersionEdit,
} from './types'

export interface AcceptResult {
  accepted: Id[]
  blocked: { id: Id; name: string; problems: string[] }[]
}

export interface BishulApi {
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

  // Recipes
  searchRecipes(query: string, filters: RecipeFilters): Promise<RecipeSummary[]>
  getRecipe(recipeId: Id): Promise<Recipe>
  /** A single version with its recipe, for cooking mode. */
  getVersion(versionId: Id): Promise<{ recipe: Recipe; version: RecipeVersion }>
  getCollections(): Promise<Collection[]>
  saveCollection(name: string, filters: RecipeFilters): Promise<Collection>
  /** Parses pasted text without saving. */
  previewImport(text: string, title?: string): Promise<ImportPreview>
  importRecipe(input: { text: string; title?: string; servings?: number }): Promise<ImportResult>
  saveVersion(versionId: Id, edit: VersionEdit): Promise<void>
  /** Forks a version into a named variation and returns the new version's id. */
  createVariation(versionId: Id, label: string, edit?: VersionEdit): Promise<Id>

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
  setShoppingChecked(lineId: Id, checked: boolean): Promise<void>
  /** The full order of the lines as shown. */
  setShoppingOrder(lineIds: Id[]): Promise<void>
  addShoppingLine(name: string): Promise<void>
  removeShoppingLine(lineId: Id): Promise<void>
  getPrepSchedule(): Promise<PrepDay[]>
  getPantry(): Promise<PantryList>
  /** The use-soon list: `expires` is required unless the item is chametz. */
  addPantryItem(item: { name: string; quantity: string; expires?: ISODate }): Promise<void>
  updatePantryItem(itemId: Id, patch: { quantity?: string; expires?: ISODate }): Promise<void>
  removePantryItem(itemId: Id): Promise<void>
}

// The mock (and its fixtures) is only bundled when the demo build asks for it.
export const api: BishulApi = USE_MOCK
  ? (require('./mock') as typeof import('./mock')).mockApi
  : realApi
