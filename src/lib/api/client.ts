/**
 * The single place the UI gets data from. Screens call `api.*` (through the hooks in `hooks.ts`)
 * and never import the mock directly. A later change swaps `mockApi` for the real REST client.
 */
import { mockApi } from './mock'
import type {
  CalendarDay,
  Collection,
  Course,
  Household,
  Id,
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
} from './types'

export interface BishulApi {
  // Planning
  getUpcoming(): Promise<Occasion[]>
  getCalendar(range: { from: ISODate; to: ISODate }): Promise<CalendarDay[]>
  getMeal(mealId: Id): Promise<MealDetail>
  createMeal(date: ISODate, name: string): Promise<Meal>
  setMealKind(mealId: Id, kind: Kind): Promise<MealDetail>
  /** `guestIds`: contacts invited; `notComing`: people dropped from this meal. */
  setAttendees(mealId: Id, attendees: { guestIds: Id[]; notComing: Id[] }): Promise<MealDetail>
  addMenuItem(mealId: Id, course: Course, item: MenuItemInput): Promise<MealDetail>
  removeMenuItem(mealId: Id, itemId: Id): Promise<MealDetail>
  getSuggestions(mealId: Id, course: Course): Promise<SuggestionResult>
  /** Fills empty courses with the top-ranked dishes. */
  suggestMenu(mealId: Id): Promise<MealDetail>
  acceptMeals(mealIds: Id[]): Promise<void>

  // Recipes
  searchRecipes(query: string, filters: RecipeFilters): Promise<RecipeSummary[]>
  getRecipe(recipeId: Id): Promise<Recipe>
  /** A single version with its recipe, for cooking mode. */
  getVersion(versionId: Id): Promise<{ recipe: Recipe; version: RecipeVersion }>
  getCollections(): Promise<Collection[]>
  saveCollection(name: string, filters: RecipeFilters): Promise<Collection>

  // People
  getHousehold(): Promise<Household>
  getContacts(): Promise<Household[]>
  getPerson(personId: Id): Promise<{ person: Person; household: Household }>
  addPersonNote(personId: Id, note: string): Promise<void>

  // Shopping, prep, pantry
  getShoppingList(): Promise<ShoppingLine[]>
  setShoppingChecked(lineId: Id, checked: boolean): Promise<void>
  moveShoppingLine(lineId: Id, direction: 'up' | 'down'): Promise<void>
  addShoppingLine(name: string): Promise<void>
  getPrepSchedule(): Promise<PrepDay[]>
  getPantry(): Promise<PantryList>
  addPantryItem(item: { name: string; quantity: string; expires?: ISODate }): Promise<void>
}

export const api: BishulApi = mockApi
