// The REST operations, defined once. `/api/*` (session) and `/v1/*` (API key) are both generated from this list, and
// so is the OpenAPI document: a route handler is just "validate, call the service". No logic lives here.
import { z } from 'zod'

import type { Actor, Db } from '../services/ctx'
import * as catalog from '../services/catalog'
import * as households from '../services/households'
import * as kitchen from '../services/kitchen'
import * as people from '../services/people'
import * as planning from '../services/planning'
import * as prefs from '../services/prefs'
import * as recipes from '../services/recipes'
import * as sharing from '../services/sharing'
import * as shopping from '../services/shopping'
import * as S from './schemas'

export interface OpContext {
  db: Db
  actor: Actor
  user: { id: string; name?: string | null }
  publicUrl: string
}

export interface Operation {
  id: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /** Relative to `/api` or `/v1`; `:name` marks a path parameter. */
  path: string
  summary: string
  description?: string
  tag: string
  /** `read` operations work with any key; `write` ones need a read-write key. */
  scope: 'read' | 'write'
  /** Only on the session API (`/api`): account management that an API key must not do. */
  webOnly?: boolean
  /** No sign-in needed. */
  public?: boolean
  input: z.ZodType
  /** Some operations only change data in certain cases (scaling with `saveAs`, `suggest-menu` with `apply`). */
  needsWrite?: (input: never) => boolean
  status?: number
  run(c: OpContext, input: never): Promise<unknown>
}

function op<I extends z.ZodType>(
  def: Omit<Operation, 'input' | 'run' | 'needsWrite'> & { needsWrite?: (input: z.output<I>) => boolean; input: I; run: (c: OpContext, input: z.output<I>) => Promise<unknown> },
): Operation {
  return def as unknown as Operation
}

const none = z.object({})
const idParam = z.object({ id: S.id })

export const operations: Operation[] = [
  // ---- Household ----
  op({
    id: 'getHousehold', method: 'get', path: '/household', tag: 'Household', scope: 'read',
    summary: 'Your household: members, persons, location and pending invites',
    input: none,
    run: (c) => households.getHousehold(c.db, c.actor),
  }),
  op({
    id: 'updateHousehold', method: 'patch', path: '/household', tag: 'Household', scope: 'write',
    summary: 'Rename the household or set its location (used for the calendar, zmanim and seasons)',
    input: z.object({ name: z.string().min(1).max(100).optional(), location: S.location.optional() }),
    run: (c, i) => households.updateHousehold(c.db, c.actor, i),
  }),
  op({
    id: 'createInvite', method: 'post', path: '/household/invites', tag: 'Household', scope: 'write', status: 201,
    summary: 'Create an invite link for a new household member',
    input: none,
    run: (c) => households.createInvite(c.db, c.actor, c.publicUrl),
  }),
  op({
    id: 'revokeInvite', method: 'delete', path: '/household/invites/:id', tag: 'Household', scope: 'write',
    summary: 'Revoke an invite link',
    input: idParam,
    run: (c, i) => households.revokeInvite(c.db, c.actor, i.id),
  }),
  op({
    id: 'leaveHousehold', method: 'post', path: '/household/leave', tag: 'Household', scope: 'write', webOnly: true,
    summary: 'Leave the household and start a new household of one, taking your own recipes',
    input: none,
    run: (c) => households.leaveHousehold(c.db, c.user, c.actor),
  }),
  op({
    id: 'transferOwnership', method: 'post', path: '/household/transfer', tag: 'Household', scope: 'write', webOnly: true,
    summary: 'Hand the household’s ownership to another member',
    input: z.object({ userId: S.id }),
    run: (c, i) => households.transferOwnership(c.db, c.actor, i.userId),
  }),
  op({
    id: 'previewInvite', method: 'get', path: '/invites/:token', tag: 'Household', scope: 'read', webOnly: true,
    summary: 'What an invite link opens (the household name)',
    input: z.object({ token: z.string() }),
    run: (c, i) => households.previewInvite(c.db, i.token),
  }),
  op({
    id: 'acceptInvite', method: 'post', path: '/invites/:token/accept', tag: 'Household', scope: 'write', webOnly: true,
    summary: 'Join the household an invite link belongs to',
    input: z.object({ token: z.string() }),
    run: (c, i) => households.acceptInvite(c.db, c.user, i.token),
  }),
  op({
    id: 'getPrefs', method: 'get', path: '/prefs', tag: 'Household', scope: 'read',
    summary: 'Your display preferences (US or metric, per-category overrides)',
    input: none,
    run: (c) => prefs.getPrefs(c.db, c.actor).then(({ system, overrides }) => ({ system, overrides })),
  }),
  op({
    id: 'setPrefs', method: 'put', path: '/prefs', tag: 'Household', scope: 'write',
    summary: 'Set your display preferences',
    input: z.object({
      system: z.enum(['us', 'metric']).optional(),
      overrides: z
        .record(z.string(), z.object({ system: z.enum(['us', 'metric']).optional(), dimension: z.enum(['weight', 'volume']).optional() }))
        .optional()
        .describe('Per ingredient category (flour, sugar, liquid, spice): e.g. { "flour": { "system": "metric", "dimension": "weight" } }'),
    }),
    run: (c, i) => prefs.setPrefs(c.db, c.actor, i),
  }),

  // ---- People ----
  op({
    id: 'getPeople', method: 'get', path: '/people', tag: 'People', scope: 'read',
    summary: 'Your household’s people and your contacts (ghost households), with constraints and your private notes',
    input: none,
    run: (c) => people.getPeople(c.db, c.actor),
  }),
  op({
    id: 'savePerson', method: 'post', path: '/people', tag: 'People', scope: 'write', status: 201,
    summary: 'Add a person to your household or to a contact household (or create a new contact household)',
    input: z.object({
      name: z.string().min(1).max(100),
      isChild: z.boolean().optional(),
      contactHouseholdId: S.id.optional(),
      newContactHousehold: z.string().min(1).max(100).optional(),
    }),
    run: (c, i) => people.savePerson(c.db, c.actor, i),
  }),
  op({
    id: 'getPerson', method: 'get', path: '/people/:id', tag: 'People', scope: 'read',
    summary: 'One person with constraints, rules, your notes, likes, dislikes and serving history',
    input: idParam,
    run: (c, i) => people.getPerson(c.db, c.actor, i.id),
  }),
  op({
    id: 'updatePerson', method: 'patch', path: '/people/:id', tag: 'People', scope: 'write',
    summary: 'Rename a person, or rename their contact household',
    input: idParam.extend({ name: z.string().min(1).max(100).optional(), isChild: z.boolean().optional(), renameHousehold: z.string().min(1).max(100).optional() }),
    run: (c, i) => people.savePerson(c.db, c.actor, i),
  }),
  op({
    id: 'deletePerson', method: 'delete', path: '/people/:id', tag: 'People', scope: 'write',
    summary: 'Remove a person (not a signed-in member)',
    input: idParam,
    run: (c, i) => people.deletePerson(c.db, c.actor, i.id),
  }),
  op({
    id: 'deleteContact', method: 'delete', path: '/contacts/:id', tag: 'People', scope: 'write',
    summary: 'Remove a contact household and its people',
    input: idParam,
    run: (c, i) => people.deleteContactHousehold(c.db, c.actor, i.id),
  }),
  op({
    id: 'setConstraints', method: 'put', path: '/people/:id/constraints', tag: 'People', scope: 'write',
    summary: 'Replace, add or remove a person’s constraints and opt-in rules',
    description:
      'For a contact this writes your private layer (never visible to the real person). `set` replaces everything you have entered; `add` and `removeIds` change individual constraints; `rules` replaces the opt-in rules (no_fish_dairy, no_fish_meat, no_parve_from_dairy_at_meat, no_parve_from_meat_at_dairy, pesach_equipment_only).',
    input: idParam.extend({
      set: z.array(S.constraintInput).optional(),
      add: z.array(S.constraintInput).optional(),
      removeIds: z.array(S.id).optional(),
      rules: z.array(z.string()).optional(),
    }),
    run: (c, i) => people.setConstraints(c.db, c.actor, { ...i, personId: i.id }),
  }),
  op({
    id: 'addNote', method: 'post', path: '/people/:id/notes', tag: 'People', scope: 'write', status: 201,
    summary: 'Add a private note about a person (visible to your household only)',
    input: idParam.extend({ text: z.string().min(1).max(2000) }),
    run: (c, i) => people.addNote(c.db, c.actor, i.id, i.text),
  }),
  op({
    id: 'deleteNote', method: 'delete', path: '/notes/:id', tag: 'People', scope: 'write',
    summary: 'Delete a note',
    input: idParam,
    run: (c, i) => people.deleteNote(c.db, c.actor, i.id),
  }),
  op({
    id: 'recordReaction', method: 'post', path: '/people/:id/reactions', tag: 'People', scope: 'write', status: 201,
    summary: 'Record that a person liked or disliked a recipe version',
    input: idParam.extend({ versionId: S.id, reaction: z.enum(['like', 'dislike']), note: z.string().max(500).optional() }),
    run: (c, i) => people.recordReaction(c.db, c.actor, { personId: i.id, versionId: i.versionId, reaction: i.reaction, note: i.note }),
  }),
  op({
    id: 'linkContact', method: 'post', path: '/people/:id/link', tag: 'People', scope: 'write',
    summary: 'Link a contact to a real user’s profile (from their profile share link)',
    input: idParam.extend({ profileToken: z.string().min(8), mode: z.enum(['merge', 'overwrite']) }),
    run: (c, i) => people.linkContact(c.db, c.actor, { ghostPersonId: i.id, profileToken: i.profileToken, mode: i.mode }),
  }),
  op({
    id: 'unlinkContact', method: 'delete', path: '/people/:id/link', tag: 'People', scope: 'write',
    summary: 'Unlink a contact; your private layer stays',
    input: idParam,
    run: (c, i) => people.unlinkContact(c.db, c.actor, i.id),
  }),

  // ---- Recipes ----
  op({
    id: 'searchRecipes', method: 'get', path: '/recipes', tag: 'Recipes', scope: 'read',
    summary: 'Search your recipes: full text plus filters',
    input: S.searchInput,
    run: (c, i) => recipes.searchRecipes(c.db, c.actor, i),
  }),
  op({
    id: 'saveRecipe', method: 'post', path: '/recipes', tag: 'Recipes', scope: 'write', status: 201,
    summary: 'Create a recipe with its first version, or a new version of a recipe (recipeId)',
    input: S.saveRecipeInput.omit({ versionId: true }),
    run: (c, i) => recipes.saveRecipe(c.db, c.actor, i),
  }),
  op({
    id: 'importRecipe', method: 'post', path: '/recipes/import', tag: 'Recipes', scope: 'write', status: 201,
    summary: 'Import a recipe from forgiving input: a title, ingredient lines as written, steps (or one pasted blob)',
    input: z.object({
      title: z.string().optional(),
      text: z.string().max(50000).optional().describe('Everything pasted, if not split yet'),
      ingredients: z.union([z.string(), z.array(z.union([z.string(), S.ingredientInput]))]).optional(),
      steps: z.union([z.string(), z.array(z.union([z.string(), z.object({ text: z.string(), timerMinutes: z.number().optional() })]))]).optional(),
      servings: z.number().int().positive().optional(),
      description: z.string().optional(),
      sourceLinks: z.array(z.object({ url: z.string().url(), label: z.string().optional() })).optional(),
      course: z.string().optional(),
      form: z.string().optional(),
      category: S.kashrut.optional(),
      difficulty: S.difficulty.optional(),
      activeMinutes: z.number().int().optional(),
      totalMinutes: z.number().int().optional(),
      ingredientData: z.record(z.string(), S.ingredientMeta).optional().describe('Catalog data per new ingredient name'),
      dryRun: z.boolean().optional(),
    }),
    run: (c, i) => recipes.importRecipe(c.db, c.actor, i),
  }),
  op({
    id: 'getRecipe', method: 'get', path: '/recipes/:id', tag: 'Recipes', scope: 'read',
    summary: 'A recipe with all its versions',
    input: idParam,
    run: (c, i) => recipes.getRecipe(c.db, c.actor, i.id),
  }),
  op({
    id: 'getVersion', method: 'get', path: '/versions/:id', tag: 'Recipes', scope: 'read',
    summary: 'One version in full (for cooking mode too)',
    input: idParam,
    run: (c, i) => recipes.getVersion(c.db, c.actor, i.id),
  }),
  op({
    id: 'updateVersion', method: 'put', path: '/versions/:id', tag: 'Recipes', scope: 'write',
    summary: 'Edit a version in place (every edit is kept in its history)',
    input: idParam.extend({ ...S.versionFields, recipeTitle: z.string().max(200).optional() }),
    run: (c, i) => recipes.saveRecipe(c.db, c.actor, { ...i, versionId: i.id }),
  }),
  op({
    id: 'deleteVersion', method: 'delete', path: '/versions/:id', tag: 'Recipes', scope: 'write',
    summary: 'Delete a version (and the recipe, if it was the last one)',
    input: idParam,
    run: (c, i) => recipes.deleteVersion(c.db, c.actor, i.id),
  }),
  op({
    id: 'saveVariation', method: 'post', path: '/versions/:id/variations', tag: 'Recipes', scope: 'write', status: 201,
    summary: 'Fork a version into a named variation, with changes',
    input: idParam.extend({ ...S.versionFields, title: z.string().min(1).max(200) }),
    run: (c, i) => recipes.saveVariation(c.db, c.actor, { ...i, fromVersionId: i.id, title: i.title }),
  }),
  op({
    id: 'scaleRecipe', method: 'post', path: '/versions/:id/scale', tag: 'Recipes', scope: 'read',
    needsWrite: (i: { saveAs?: string }) => !!i.saveAs,
    summary: 'Scale a version (deterministic, with warnings); saveAs stores it as a new version',
    description: 'Read-only unless `saveAs` is given.',
    input: idParam.extend({
      factor: z.number().positive().optional(),
      toServings: z.number().int().positive().optional(),
      pan: z.union([z.string(), z.boolean()]).optional(),
      cookTimeMinutes: z.number().optional(),
      saveAs: z.string().optional(),
    }),
    run: (c, i) => recipes.scaleRecipe(c.db, c.actor, { ...i, versionId: i.id }),
  }),
  op({
    id: 'getRecipeHistory', method: 'get', path: '/versions/:id/history', tag: 'Recipes', scope: 'read',
    summary: 'The edit history of a version',
    input: idParam,
    run: (c, i) => recipes.getRecipeHistory(c.db, c.actor, i.id),
  }),
  op({
    id: 'setVersionFit', method: 'put', path: '/versions/:id/dimensions', tag: 'Recipes', scope: 'write',
    summary: 'Set how well a version suits a dimension (fit null clears it)',
    input: idParam.extend({ dimension: z.string(), fit: S.fit.nullable() }),
    run: (c, i) => recipes.setRecipeFit(c.db, c.actor, i.id, i.dimension, i.fit),
  }),
  op({
    id: 'listCollections', method: 'get', path: '/collections', tag: 'Recipes', scope: 'read',
    summary: 'Saved recipe filters',
    input: none,
    run: (c) => recipes.listCollections(c.db, c.actor),
  }),
  op({
    id: 'saveCollection', method: 'post', path: '/collections', tag: 'Recipes', scope: 'write', status: 201,
    summary: 'Save a recipe filter as a collection',
    input: z.object({ name: z.string().min(1).max(100), filters: S.searchInput.omit({ limit: true, offset: true, collectionId: true }) }),
    run: (c, i) => recipes.saveCollection(c.db, c.actor, { name: i.name, filters: i.filters as never }),
  }),
  op({
    id: 'updateCollection', method: 'put', path: '/collections/:id', tag: 'Recipes', scope: 'write',
    summary: 'Rename or change a collection',
    input: idParam.extend({ name: z.string().min(1).max(100), filters: S.searchInput.omit({ limit: true, offset: true, collectionId: true }) }),
    run: (c, i) => recipes.saveCollection(c.db, c.actor, { id: i.id, name: i.name, filters: i.filters as never }),
  }),
  op({
    id: 'deleteCollection', method: 'delete', path: '/collections/:id', tag: 'Recipes', scope: 'write',
    summary: 'Delete a collection',
    input: idParam,
    run: (c, i) => recipes.deleteCollection(c.db, c.actor, i.id),
  }),

  // ---- Catalog ----
  op({
    id: 'listIngredients', method: 'get', path: '/ingredients', tag: 'Catalog', scope: 'read',
    summary: 'The ingredient catalog (search by name)',
    input: z.object({ q: z.string().optional() }),
    run: (c, i) => catalog.listIngredients(c.db, c.actor, i.q),
  }),
  op({
    id: 'updateIngredient', method: 'patch', path: '/ingredients/:id', tag: 'Catalog', scope: 'write',
    summary: 'Correct an ingredient’s category, allergens, flags, aliases or density',
    input: idParam.extend({ ...S.ingredientMeta.shape, rename: z.string().optional(), source: S.source.optional() }),
    run: (c, i) =>
      catalog.updateIngredient(c.db, c.actor, {
        id: i.id,
        rename: i.rename,
        source: i.source,
        meta: { category: i.category, aliases: i.aliases, allergens: i.allergens, flags: i.flags, densityGPerMl: i.densityGPerMl, gramsPerPiece: i.gramsPerPiece },
      }),
  }),
  op({
    id: 'listDimensions', method: 'get', path: '/dimensions', tag: 'Catalog', scope: 'read',
    summary: 'Occasion dimensions: the built-ins and your own',
    input: none,
    run: (c) => catalog.listDimensions(c.db, c.actor),
  }),
  op({
    id: 'createDimension', method: 'post', path: '/dimensions', tag: 'Catalog', scope: 'write', status: 201,
    summary: 'Add a dimension of your own ("make-ahead for sheva brachot")',
    input: z.object({ name: z.string().min(1).max(60) }),
    run: (c, i) => catalog.createDimension(c.db, c.actor, i.name),
  }),
  op({
    id: 'renameDimension', method: 'patch', path: '/dimensions/:id', tag: 'Catalog', scope: 'write',
    summary: 'Rename one of your dimensions',
    input: idParam.extend({ name: z.string().min(1).max(60) }),
    run: (c, i) => catalog.renameDimension(c.db, c.actor, i.id, i.name),
  }),
  op({
    id: 'deleteDimension', method: 'delete', path: '/dimensions/:id', tag: 'Catalog', scope: 'write',
    summary: 'Delete one of your dimensions',
    input: idParam,
    run: (c, i) => catalog.deleteDimension(c.db, c.actor, i.id),
  }),

  // ---- Planning ----
  op({
    id: 'getUpcoming', method: 'get', path: '/upcoming', tag: 'Planning', scope: 'read',
    summary: 'The coming Shabbatot and Yom Tovim as occasions, with the meals planned for them',
    input: z.object({ days: S.int.optional() }),
    run: (c, i) => planning.getUpcoming(c.db, c.actor, i),
  }),
  op({
    id: 'getCalendar', method: 'get', path: '/calendar', tag: 'Planning', scope: 'read',
    summary: 'Days with Hebrew dates, parsha, holidays, candle lighting and the household’s meals',
    input: z.object({ from: S.date.optional(), to: S.date.optional(), days: S.int.optional() }),
    run: (c, i) => planning.getCalendar(c.db, c.actor, i),
  }),
  op({
    id: 'createMeal', method: 'post', path: '/meals', tag: 'Planning', scope: 'write', status: 201,
    summary: 'Create a meal on any date (the household is in by default)',
    input: S.createMealInput,
    run: (c, i) => planning.createMeal(c.db, c.actor, i as never),
  }),
  op({
    id: 'acceptMeals', method: 'post', path: '/meals/accept', tag: 'Planning', scope: 'write',
    summary: 'Accept meals (ids, a date, or a range): holds pantry items and schedules the cooking',
    input: z.object({ mealIds: z.array(S.id).optional(), date: S.date.optional(), from: S.date.optional(), to: S.date.optional(), force: z.boolean().optional() }),
    run: (c, i) => planning.acceptMeals(c.db, c.actor, i),
  }),
  op({
    id: 'reopenMeals', method: 'post', path: '/meals/reopen', tag: 'Planning', scope: 'write',
    summary: 'Turn accepted meals back into drafts',
    input: z.object({ mealIds: z.array(S.id).min(1) }),
    run: (c, i) => planning.reopenMeals(c.db, c.actor, i.mealIds),
  }),
  op({
    id: 'getMeal', method: 'get', path: '/meals/:id', tag: 'Planning', scope: 'read',
    summary: 'A meal with its people, items, dining brief and review',
    input: idParam,
    run: (c, i) => planning.getMeal(c.db, c.actor, i.id),
  }),
  op({
    id: 'updateMeal', method: 'patch', path: '/meals/:id', tag: 'Planning', scope: 'write',
    summary: 'Change a meal: name, date, time, kind, who is coming, and its items (add, remove, reorder, brought dishes)',
    input: idParam.merge(S.updateMealInput),
    run: (c, { id, ...rest }) => planning.updateMeal(c.db, c.actor, id, rest as never),
  }),
  op({
    id: 'deleteMeal', method: 'delete', path: '/meals/:id', tag: 'Planning', scope: 'write',
    summary: 'Delete a meal',
    input: idParam,
    run: (c, i) => planning.deleteMeal(c.db, c.actor, i.id),
  }),
  op({
    id: 'getMealBrief', method: 'get', path: '/meals/:id/brief', tag: 'Planning', scope: 'read',
    summary: 'The dining brief for a meal: constraints, hard exclusions, eat-around notes, meal-level issues, sourcing',
    input: idParam,
    run: (c, i) => planning.getDiningBrief(c.db, c.actor, { mealId: i.id }),
  }),
  op({
    id: 'getDiningBrief', method: 'get', path: '/dining-brief', tag: 'Planning', scope: 'read',
    summary: 'A dining brief for a date and a set of people, before any meal exists',
    input: z.object({
      date: S.date,
      personIds: S.ids,
      time: S.time.optional(),
      mealKind: S.kashrut.optional(),
      versionIds: S.ids.optional(),
      candidateVersionIds: S.ids.optional(),
    }),
    run: (c, i) => planning.getDiningBrief(c.db, c.actor, i as never),
  }),
  op({
    id: 'getSuggestions', method: 'get', path: '/meals/:id/suggestions', tag: 'Planning', scope: 'read',
    summary: 'Ranked dishes for a meal and course, with reasons; dishes that do not fit are listed as hidden, with why',
    input: idParam.extend({ course: z.string().optional(), limit: S.int.optional() }),
    run: (c, i) => planning.getSuggestions(c.db, c.actor, { mealId: i.id, course: i.course, limit: i.limit }),
  }),
  op({
    id: 'suggestMenu', method: 'post', path: '/meals/:id/suggest-menu', tag: 'Planning', scope: 'read',
    needsWrite: (i: { apply?: boolean }) => !!i.apply,
    summary: 'Propose a balanced menu from the top suggestions; apply: true fills the meal with it',
    input: idParam.extend({ plan: S.coursePlan, apply: z.boolean().optional(), maxHard: z.number().int().optional() }),
    run: (c, i) => planning.suggestMenuForMeal(c.db, c.actor, { mealId: i.id, plan: i.plan, apply: i.apply, maxHard: i.maxHard }),
  }),
  op({
    id: 'getMenu', method: 'get', path: '/menu', tag: 'Planning', scope: 'read',
    summary: '"What’s for dinner?": accepted menus over a date or range',
    input: z.object({ date: S.date.optional(), from: S.date.optional(), to: S.date.optional(), includeDrafts: S.bool.optional() }),
    run: (c, i) => planning.getMenu(c.db, c.actor, i),
  }),
  op({
    id: 'getPrepSchedule', method: 'get', path: '/prep', tag: 'Planning', scope: 'read',
    summary: 'The prep schedule for accepted meals: a per-day task list worked back from each meal’s time',
    input: z.object({ from: S.date.optional(), to: S.date.optional(), includeDrafts: S.bool.optional() }),
    run: (c, i) => shopping.getPrepSchedule(c.db, c.actor, i),
  }),

  // ---- Shopping ----
  op({
    id: 'getShoppingList', method: 'get', path: '/shopping', tag: 'Shopping', scope: 'read',
    summary: 'The shopping list: totals for accepted meals minus unexpired pantry stock, with order and checked state',
    input: z.object({ from: S.date.optional(), to: S.date.optional() }),
    run: (c, i) => shopping.getShoppingList(c.db, c.actor, i),
  }),
  op({
    id: 'updateShoppingList', method: 'patch', path: '/shopping', tag: 'Shopping', scope: 'write',
    summary: 'Check lines off, reorder them, add manual lines or notes',
    input: z.object({
      check: z.array(z.object({ key: z.string(), checked: z.boolean() })).optional(),
      order: z.array(z.string()).optional(),
      addManual: z.array(z.union([z.string(), z.object({ text: z.string(), note: z.string().optional() })])).optional(),
      removeKeys: z.array(z.string()).optional(),
      notes: z.array(z.object({ key: z.string(), note: z.string().nullable() })).optional(),
      uncheckAll: z.boolean().optional(),
    }),
    run: (c, i) => shopping.updateShoppingList(c.db, c.actor, i),
  }),

  // ---- Kitchen ----
  op({
    id: 'getPantry', method: 'get', path: '/pantry', tag: 'Kitchen', scope: 'read',
    summary: 'Pantry with expiry, holds for accepted menus, and the chametz cutoff',
    input: none,
    run: (c) => kitchen.listPantry(c.db, c.actor),
  }),
  op({
    id: 'addPantryItem', method: 'post', path: '/pantry', tag: 'Kitchen', scope: 'write', status: 201,
    summary: 'Add a pantry item',
    input: z.object({
      name: z.string().min(1),
      quantity: z.union([z.string(), z.number()]).optional().describe('"2 cups", "500 g" or a number in `unit`'),
      unit: z.string().optional(),
      location: z.string().nullable().optional(),
      expiresOn: S.date.nullable().optional(),
      ingredient: S.ingredientMeta.optional(),
    }),
    run: (c, i) => kitchen.addPantryItem(c.db, c.actor, i),
  }),
  op({
    id: 'updatePantryItem', method: 'patch', path: '/pantry/:id', tag: 'Kitchen', scope: 'write',
    summary: 'Change a pantry item’s quantity, location or expiry',
    input: idParam.extend({
      quantity: z.union([z.string(), z.number()]).optional(),
      unit: z.string().optional(),
      location: z.string().nullable().optional(),
      expiresOn: S.date.nullable().optional(),
    }),
    run: (c, { id, ...rest }) => kitchen.updatePantryItem(c.db, c.actor, id, rest),
  }),
  op({
    id: 'removePantryItem', method: 'delete', path: '/pantry/:id', tag: 'Kitchen', scope: 'write',
    summary: 'Remove a pantry item',
    input: idParam,
    run: (c, i) => kitchen.removePantryItem(c.db, c.actor, i.id),
  }),
  op({
    id: 'applyPantryChanges', method: 'post', path: '/pantry/changes', tag: 'Kitchen', scope: 'write',
    summary: 'Several pantry edits at once: add, set, use or remove',
    input: z.object({
      changes: z.array(
        z.object({
          op: z.enum(['add', 'set', 'use', 'remove']),
          name: z.string().optional(),
          itemId: z.string().optional(),
          quantity: z.union([z.string(), z.number()]).optional(),
          unit: z.string().optional(),
          location: z.string().nullable().optional(),
          expiresOn: S.date.nullable().optional(),
          ingredient: S.ingredientMeta.optional(),
        }),
      ),
    }),
    run: (c, i) => kitchen.applyPantryChanges(c.db, c.actor, i.changes),
  }),
  op({
    id: 'getKitchen', method: 'get', path: '/equipment', tag: 'Kitchen', scope: 'read',
    summary: 'Equipment with counts and designations',
    input: none,
    run: (c) => kitchen.getKitchen(c.db, c.actor),
  }),
  op({
    id: 'saveEquipment', method: 'post', path: '/equipment', tag: 'Kitchen', scope: 'write', status: 201,
    summary: 'Add equipment',
    input: z.object({ item: z.string().min(1), count: z.number().int().min(0).optional(), designation: S.designation.nullable().optional() }),
    run: (c, i) => kitchen.saveEquipment(c.db, c.actor, i),
  }),
  op({
    id: 'updateEquipment', method: 'patch', path: '/equipment/:id', tag: 'Kitchen', scope: 'write',
    summary: 'Change equipment',
    input: idParam.extend({ item: z.string().optional(), count: z.number().int().min(0).optional(), designation: S.designation.nullable().optional() }),
    run: (c, i) => kitchen.saveEquipment(c.db, c.actor, i),
  }),
  op({
    id: 'deleteEquipment', method: 'delete', path: '/equipment/:id', tag: 'Kitchen', scope: 'write',
    summary: 'Remove equipment',
    input: idParam,
    run: (c, i) => kitchen.saveEquipment(c.db, c.actor, { id: i.id, remove: true }),
  }),

  // ---- Sharing ----
  op({
    id: 'createShare', method: 'post', path: '/shares', tag: 'Sharing', scope: 'write', status: 201,
    summary: 'Create a share link: a snapshot of a version, a dish (recipe with all versions) or a profile',
    input: z.object({ kind: z.enum(['version', 'dish', 'profile']), targetId: S.id }),
    run: (c, i) => sharing.createShare(c.db, c.actor, c.publicUrl, i),
  }),
  op({
    id: 'listShares', method: 'get', path: '/shares', tag: 'Sharing', scope: 'read',
    summary: 'Your active share links',
    input: none,
    run: (c) => sharing.listShares(c.db, c.actor, c.publicUrl),
  }),
  op({
    id: 'revokeShare', method: 'delete', path: '/shares/:id', tag: 'Sharing', scope: 'write',
    summary: 'Turn a share link off',
    input: idParam,
    run: (c, i) => sharing.revokeShare(c.db, c.actor, i.id),
  }),
  op({
    id: 'getShared', method: 'get', path: '/shared/:token', tag: 'Sharing', scope: 'read', public: true,
    summary: 'Read a shared snapshot (no sign-in needed)',
    input: z.object({ token: z.string() }),
    run: (c, i) => sharing.getShared(c.db, i.token),
  }),
  op({
    id: 'saveShared', method: 'post', path: '/shared/:token/save', tag: 'Sharing', scope: 'write', status: 201,
    summary: 'Save a shared recipe to your household as an independent copy (keeps its lineage)',
    input: z.object({ token: z.string() }),
    run: (c, i) => sharing.saveShared(c.db, c.actor, i.token),
  }),

  // ---- API keys (session only) ----
  op({
    id: 'listApiKeys', method: 'get', path: '/keys', tag: 'Account', scope: 'read', webOnly: true,
    summary: 'Your API keys (prefix, scope, last used)',
    input: none,
    run: (c) => sharing.listApiKeys(c.db, c.user.id),
  }),
  op({
    id: 'createApiKey', method: 'post', path: '/keys', tag: 'Account', scope: 'write', webOnly: true, status: 201,
    summary: 'Create an API key. The key is shown once.',
    input: z.object({ scope: z.enum(['read', 'write']) }),
    run: (c, i) => sharing.createApiKey(c.db, c.user.id, i.scope),
  }),
  op({
    id: 'revokeApiKey', method: 'delete', path: '/keys/:id', tag: 'Account', scope: 'write', webOnly: true,
    summary: 'Revoke an API key',
    input: idParam,
    run: (c, i) => sharing.revokeApiKey(c.db, c.user.id, i.id),
  }),
]
