/** TavshilApi over the REST API (`/api/*`, bearer token). Server shapes are adapted in adapt.ts. */
import { addDays, clock12 } from '@/lib/dates'

import {
  adaptCollection,
  adaptContact,
  adaptDay,
  adaptHousehold,
  adaptMealDetail,
  adaptOccasion,
  adaptPantry,
  adaptPerson,
  adaptPrep,
  adaptRecipe,
  adaptResults,
  adaptShopping,
  adaptSuggestions,
  adaptVersion,
  costOut,
  difficultyOut,
  filtersOut,
  type ServerMealDetail,
  type ServerOccasion,
  type ServerPeople,
  type ServerPersonView,
} from './adapt'
import type { AcceptResult, TavshilApi } from './client'
import { ApiError, http } from './http'
import type {
  Course,
  HostedMeal,
  HostedPage,
  HouseholdInfo,
  Id,
  Kind,
  MealDetail,
  MealRecipeSearch,
  PlanView,
  PrepDay,
  Reaction,
  VersionEdit,
  TagCount,
} from './types'

interface ServerSharedVersion {
  title: string
  description: string | null
  servings: number | null
  totalMinutes: number | null
  ingredients: {
    section?: string | null
    original: string
    catalog: { allergens: string[] } | null
  }[]
  steps: { text: string; section?: string }[]
  equipment: { item: string }[]
}

// The UI asks for the household and its contacts at the same moment; one request serves both.
let peopleInflight: Promise<ServerPeople> | null = null
function people(): Promise<ServerPeople> {
  if (!peopleInflight) {
    peopleInflight = http.get<ServerPeople>('/people').finally(() => {
      peopleInflight = null
    })
  }
  return peopleInflight
}

const info = (h: HouseholdInfo & { ownerUserId?: string }): HouseholdInfo => ({
  id: h.id,
  name: h.name,
  location: h.location,
  locationSet: h.locationSet,
  today: h.today,
  isOwner: h.isOwner,
})

const meal = async (id: Id): Promise<MealDetail> =>
  adaptMealDetail(await http.get<ServerMealDetail>(`/meals/${id}`))

/** The editor's fields as the server wants them. */
function versionBody(e: VersionEdit) {
  return {
    ...(e.recipeTitle !== undefined && { recipeTitle: e.recipeTitle }),
    ...(e.label !== undefined && { title: e.label }),
    ...(e.course !== undefined && { course: e.course }),
    ...(e.kind !== undefined && { category: e.kind }),
    ...(e.servings !== undefined && { servings: e.servings }),
    ...(e.activeMin !== undefined && { activeMinutes: e.activeMin }),
    ...(e.totalMin !== undefined && { totalMinutes: e.totalMin }),
    ...(e.difficulty !== undefined && { difficulty: difficultyOut(e.difficulty) }),
    ...(e.cost !== undefined && { cost: costOut(e.cost) }),
    ...(e.serving !== undefined && { servingStyle: e.serving.replace(' ', '_') }),
    ...(e.holdsOnBlech !== undefined && { holdsOnBlech: e.holdsOnBlech }),
    ...(e.nutrition !== undefined && { nutrition: e.nutrition }),
    ...(e.flags !== undefined && { flags: e.flags }),
    ...(e.equipment !== undefined && {
      equipment: e.equipment.map((q) => ({ item: q.name, designation: q.designation })),
    }),
    ...(e.tags !== undefined && { tags: e.tags }),
    ...(e.sources !== undefined && { sourceLinks: e.sources }),
    ...(e.description !== undefined && { description: e.description }),
    ...(e.ingredients && {
      ingredients: e.ingredients
        .filter((l) => l.text.trim())
        .map((l) => ({ text: l.text.trim(), section: l.section ?? null })),
    }),
    ...(e.steps && {
      steps: e.steps
        .filter((s) => s.text.trim())
        .map((s) => ({
          text: s.text.trim(),
          section: s.section ?? null,
          ...(s.timerMin && { timerMinutes: s.timerMin }),
          ...(s.timerMin && s.timerLabel && { timerLabel: s.timerLabel }),
          ...(s.uses && {
            uses: s.uses.map((u) => ({ ingredient: u.line, portion: u.portion })),
          }),
        })),
    }),
  }
}

/** Every shopping edit answers with the whole updated list, so the screen needs no second fetch. */
const patchShopping = async (body: object) =>
  adaptShopping(
    (await http.patch<{ lines: Parameters<typeof adaptShopping>[0] }>('/shopping', body)).lines,
  )

const TAG_TYPE_OUT = {
  allergen: 'allergen',
  ingredient: 'ingredient',
  diet: 'diet',
  'kashrut-dish': 'kashrut_dish',
  'kashrut-sourcing': 'kashrut_sourcing',
} as const

export const realApi: TavshilApi = {
  // ---- Household and settings ----
  getHouseholdInfo: async () => info(await http.get('/household')),
  updateHousehold: async (patch) => info(await http.patch('/household', patch)),
  getPrefs: async () => {
    const p = await http.get<{ system: 'us' | 'metric' }>('/prefs')
    return { system: p.system }
  },
  setPrefs: async (prefs) => {
    const p = await http.put<{ system: 'us' | 'metric' }>('/prefs', prefs)
    return { system: p.system }
  },
  listApiKeys: async () => {
    const keys = await http.get<
      {
        id: string
        prefix: string
        scope: 'read' | 'write'
        createdAt: number
        lastUsedAt: number | null
        revokedAt: number | null
      }[]
    >('/keys')
    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        id: k.id,
        prefix: k.prefix,
        scope: k.scope,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        revoked: false,
      }))
  },
  shareRecipe: async (recipeId) => {
    const r = await http.post<{ id: string; url: string }>('/shares', {
      kind: 'dish',
      targetId: recipeId,
    })
    return { id: r.id, url: r.url }
  },
  stopSharing: async (shareId) => {
  getRecipeShares: async () => {
    const r =
      await http.get<{ id: string; kind: string; targetId: string; url: string }[]>('/shares')
    return r
      .filter((x) => x.kind === 'dish')
      .map((x) => ({ id: x.id, url: x.url, recipeId: x.targetId }))
  },
    await http.delete(`/shares/${shareId}`)
  },
  getShared: async (token) => {
    const r = await http.get<{
      kind: string
      recipe?: { title: string }
      version?: ServerSharedVersion
      versions?: ServerSharedVersion[]
    }>(`/shared/${encodeURIComponent(token)}`)
    if (r.kind === 'profile') throw new ApiError(404, 'not_a_recipe', 'This link isn’t a recipe.')
    const all = r.kind === 'version' ? [r.version!] : (r.versions ?? [])
    return {
      title: r.recipe?.title ?? all[0]?.title ?? 'Recipe',
      versions: all.map((v) => ({
        title: v.title,
        description: v.description,
        servings: v.servings,
        totalMinutes: v.totalMinutes,
        ingredients: v.ingredients.map((i) => ({
          section: i.section,
          text: i.original,
          allergens: i.catalog?.allergens ?? [],
        })),
        steps: v.steps.map((s) => ({ text: s.text, section: s.section })),
        equipment: v.equipment.map((e) => e.item),
      })),
    }
  },
  saveShared: async (token) => {
    const r = await http.post<{ recipeId: string }>(`/shared/${encodeURIComponent(token)}/save`)
    return { recipeId: r.recipeId }
  },
  createApiKey: async (scope) => {
    const k = await http.post<{
      id: string
      key: string
      prefix: string
      scope: 'read' | 'write'
      createdAt: number
    }>('/keys', { scope })
    return { ...k, revoked: false }
  },
  revokeApiKey: async (id) => {
    await http.delete(`/keys/${id}`)
  },

  // ---- Planning ----
  getUpcoming: async () => {
    const r = await http.get<{ occasions: ServerOccasion[] }>('/upcoming', { days: 70 })
    return r.occasions.map(adaptOccasion)
  },

  getCalendar: async ({ from, to }) => {
    const cal = await http.get<{
      days: (Parameters<typeof adaptDay>[0] & {
        cooking?: {
          tasks: {
            mealId: string
            mealName: string
            label: string
            dish: string
            startText: string | null
          }[]
        }
      })[]
    }>('/calendar', { from, to, includeDrafts: true })
    return cal.days.map((d) =>
      adaptDay(
        d,
        (d.cooking?.tasks ?? []).map((t) => ({
          mealId: t.mealId,
          mealName: t.mealName,
          text: `${clock12(t.startText)}: ${t.dish ? `${t.label} (${t.dish})` : t.label}`,
        })),
      ),
    )
  },

  getMeal: meal,

  createMeal: async (date, name, time) => {
    const d = await http.post<ServerMealDetail>('/meals', {
      date,
      name,
      ...(time?.trim() && { time: time.trim() }),
    })
    return adaptMealDetail(d).meal
  },

  deleteMeal: async (id) => {
    await http.delete(`/meals/${id}`)
  },

  setMealKind: async (id, kind: Kind) =>
    adaptMealDetail(await http.patch<ServerMealDetail>(`/meals/${id}`, { kind })),

  updateMealDetails: async (id, { name, time }) =>
    adaptMealDetail(
      await http.patch<ServerMealDetail>(`/meals/${id}`, {
        ...(name !== undefined && { name: name.trim() }),
        ...(time !== undefined && { time: time.trim() || null }),
      }),
    ),

  setAttendees: async (id, { guestIds, notComing }) => {
    const current = await meal(id)
    const hostIds = current.people.filter((p) => !p.isGuest).map((p) => p.person.id)
    const personIds = [...hostIds.filter((h) => !notComing.includes(h)), ...guestIds]
    return adaptMealDetail(await http.patch<ServerMealDetail>(`/meals/${id}`, { personIds }))
  },

  addMenuItem: async (id, course: Course, item) => {
    const entry =
      'versionId' in item
        ? { versionId: item.versionId, course, ...(item.scale && { scale: item.scale }) }
        : {
            course,
            brought: {
              description: item.brought.name,
              by: item.brought.by,
              kashrut: item.brought.kind,
              course,
            },
          }
    return adaptMealDetail(
      await http.patch<ServerMealDetail>(`/meals/${id}`, { addItems: [entry] }),
    )
  },

  removeMenuItem: async (id, itemId) =>
    adaptMealDetail(
      await http.patch<ServerMealDetail>(`/meals/${id}`, { removeItemIds: [itemId] }),
    ),

  setItemDone: async (id, itemId, done) =>
    adaptMealDetail(
      await http.patch<ServerMealDetail>(`/meals/${id}`, { updateItems: [{ id: itemId, done }] }),
    ),

  getSuggestions: async (id, course) =>
    adaptSuggestions(course, await http.get(`/meals/${id}/suggestions`, { course, limit: 30 })),

  suggestMenu: async (id) => {
    await http.post(`/meals/${id}/suggest-menu`, { apply: true })
    return meal(id)
  },

  acceptMeals: async (mealIds): Promise<AcceptResult> => {
    const r = await http.post<{
      accepted: { id: string }[]
      blocked: { id: string; name: string; problems: string[] }[]
    }>('/meals/accept', { mealIds })
    return { accepted: r.accepted.map((a) => a.id), blocked: r.blocked }
  },

  reopenMeals: async (mealIds) => {
    await http.post('/meals/reopen', { mealIds })
  },

  // ---- Recipes ----
  searchRecipes: async (query, filters) => {
    const r = await http.get<{ results: Parameters<typeof adaptResults>[0] }>('/recipes', {
      q: query.trim() || undefined,
      ...filtersOut(filters),
      limit: 200,
    })
    return adaptResults(r.results)
  },

  getTags: async () => (await http.get<{ tags: TagCount[] }>('/tags')).tags,

  getRecipe: async (id) => {
    const r = await http.get<{ id: string; title: string; versions: { id: string }[] }>(
      `/recipes/${id}`,
    )
    const [histories, everyone] = await Promise.all([
      Promise.all(
        r.versions.map((v) =>
          http
            .get<{ at: number; via: string; summary: string }[]>(`/versions/${v.id}/history`)
            .catch(() => []),
        ),
      ),
      people().catch(() => null),
    ])
    const all = everyone
      ? [...everyone.household.people, ...everyone.contacts.flatMap((c) => c.people)]
      : []
    const reactionsOf = (versionId: string): Reaction[] =>
      all.flatMap((p) =>
        [
          ...p.likes.map((l) => ({ ...l, kind: 'like' as const })),
          ...p.dislikes.map((l) => ({ ...l, kind: 'dislike' as const })),
        ]
          .filter((l) => l.versionId === versionId)
          .map((l) => ({
            personId: p.id,
            personName: p.name,
            kind: l.kind,
            note: l.note ?? undefined,
            recordedBy: 'your household',
            date: new Date(l.at).toISOString().slice(0, 10),
          })),
      )
    return adaptRecipe(r as never, (versionId) => ({
      history: histories[r.versions.findIndex((v) => v.id === versionId)] ?? [],
      reactions: reactionsOf(versionId),
    }))
  },

  getVersion: async (versionId) => {
    const r = await http.get<{
      recipe: { id: string; title: string }
      version: Parameters<typeof adaptVersion>[0]
    }>(`/versions/${versionId}`)
    const recipe = adaptRecipe({ id: r.recipe.id, title: r.recipe.title, versions: [r.version] })
    return { recipe, version: recipe.versions[0] }
  },

  getCollections: async () =>
    (await http.get<Parameters<typeof adaptCollection>[0][]>('/collections')).map(adaptCollection),

  saveCollection: async (name, filters) => {
    const spec = Object.fromEntries(
      Object.entries(filtersOut(filters)).filter(([k, v]) => v !== undefined && k !== 'sort'),
    )
    return adaptCollection(
      await http.post<Parameters<typeof adaptCollection>[0]>('/collections', {
        name,
        filters: spec,
      }),
    )
  },

  updateCollection: async (id, name, filters) => {
    const spec = Object.fromEntries(
      Object.entries(filtersOut(filters)).filter(([k, v]) => v !== undefined && k !== 'sort'),
    )
    return adaptCollection(
      await http.put<Parameters<typeof adaptCollection>[0]>(`/collections/${id}`, {
        name,
        filters: spec,
      }),
    )
  },

  deleteCollection: async (id) => {
    await http.delete(`/collections/${id}`)
  },

  previewImport: async (text, title) => {
    const r = await http.post<{
      parsed: {
        title?: string
        servings?: number
        ingredients: {
          line: string
          name: string
          skipImpact: 'none' | 'minor' | 'ruins'
          section?: string | null
        }[]
        steps: { text: string; section?: string | null }[]
      }
    }>('/recipes/import', { text, ...(title?.trim() && { title: title.trim() }), dryRun: true })
    return {
      ...r.parsed,
      ingredients: r.parsed.ingredients.map((i) => ({ ...i, section: i.section || undefined })),
      steps: r.parsed.steps.map((s) => ({ text: s.text, section: s.section || undefined })),
    }
  },

  importRecipe: async ({ text, title, servings }) => {
    const r = await http.post<{
      version: { id: string; recipeId: string }
      needsReview: string[]
      unquantified: string[]
    }>('/recipes/import', {
      text,
      ...(title?.trim() && { title: title.trim() }),
      ...(servings && { servings }),
    })
    return {
      recipeId: r.version.recipeId,
      versionId: r.version.id,
      needsReview: r.needsReview,
      unquantified: r.unquantified,
    }
  },

  saveVersion: async (versionId, edit) => {
    await http.put(`/versions/${versionId}`, versionBody(edit))
  },

  createVariation: async (versionId, label, edit = {}) => {
    const { recipeTitle: _ignored, label: _label, ...rest } = edit
    const r = await http.post<{ version: { id: string } }>(`/versions/${versionId}/variations`, {
      ...versionBody(rest),
      title: label,
    })
    return r.version.id
  },

  deleteVersion: async (versionId) => {
    await http.delete(`/versions/${versionId}`)
  },

  // ---- People ----
  // ---- Plan tab ----
  getWeek: (date) => http.get<PlanView>('/week', { date }),
  getPlan: ({ from, to }) => http.get<PlanView>('/plan', { from, to }),
  getHosted: (key) => http.get<HostedPage>(`/hosted/${key}`),
  getHostedMeal: (id) => http.get<HostedMeal>(`/meals/${id}/hosted`),
  ensureRunMeal: (input) =>
    http.post<{ mealId: Id; created: boolean; hostedKey: string }>('/hosted/ensure-meal', input),
  createPlanMeal: async (input) => {
    const { time, ...rest } = input
    const created = await http.post<{ meal: { id: Id } }>('/meals', {
      ...rest,
      ...(time?.trim() && { time: time.trim() }),
    })
    return http.get<HostedMeal>(`/meals/${created.meal.id}/hosted`)
  },
  updatePlanMeal: async (id, { time, ...rest }) => {
    await http.patch(`/meals/${id}`, {
      ...rest,
      ...(time !== undefined && { time: time.trim() || null }),
    })
    return http.get<HostedMeal>(`/meals/${id}/hosted`)
  },
  addMealHousehold: (id, householdId) =>
    http.post<HostedMeal>(`/meals/${id}/households`, { householdId }),
  removeMealHousehold: (id, householdId) =>
    http.delete<HostedMeal>(`/meals/${id}/households/${householdId}`),
  setMealPerson: (id, personId, present) =>
    http.put<HostedMeal>(`/meals/${id}/people/${personId}`, { present }),
  addMealDish: (id, dish) => http.post<HostedMeal>(`/meals/${id}/dishes`, dish),
  removeMealDish: (id, itemId) => http.delete<HostedMeal>(`/meals/${id}/dishes/${itemId}`),
  moveMealDish: (id, itemId, to) => http.post<HostedMeal>(`/meals/${id}/dishes/${itemId}/move`, to),
  searchRecipesForMeal: (id, query) => http.get<MealRecipeSearch>(`/meals/${id}/recipes`, query),
  createContactHousehold: async (name) =>
    adaptContact(await http.post<ServerPeople['contacts'][number]>('/contacts', { name })),

  getHousehold: async () => adaptHousehold((await people()).household),
  getContacts: async () => (await people()).contacts.map(adaptContact),

  getPerson: async (id) => {
    const r = await http.get<{
      person: ServerPersonView
      household: { id: string; name: string; isContact: boolean }
    }>(`/people/${id}`)
    const person = adaptPerson(r.person)
    return {
      person,
      household: {
        id: r.household.id,
        name: r.household.name,
        isOwn: !r.household.isContact,
        people: [person],
      },
    }
  },

  addPersonNote: async (id, text) => {
    await http.post(`/people/${id}/notes`, { text })
  },

  addPerson: async (input) => adaptPerson(await http.post<ServerPersonView>('/people', input)),

  setPersonBirth: async (personId, input) => {
    await http.patch(`/people/${personId}`, input)
  },

  setPersonSpicy: async (personId, spicy) => {
    await http.patch(`/people/${personId}`, { spicy })
  },

  addConstraint: async (personId, c) => {
    await http.put(`/people/${personId}/constraints`, {
      add: [
        {
          tagType: TAG_TYPE_OUT[c.tagType],
          tag: c.tag,
          kind: c.kind,
          severity: c.severity,
          activeWhen: c.activeWhen,
          ...(c.note?.trim() && { note: c.note.trim() }),
        },
      ],
    })
  },

  removeConstraint: async (personId, constraintId) => {
    await http.put(`/people/${personId}/constraints`, { removeIds: [constraintId] })
  },

  setPersonRules: async (personId, rules) => {
    await http.put(`/people/${personId}/constraints`, { rules })
  },

  recordReaction: async (personId, versionId, reaction, note) => {
    await http.put(`/versions/${versionId}/reactions`, {
      personId,
      reaction,
      ...(note?.trim() && { note: note.trim() }),
    })
  },

  // ---- Shopping, prep, pantry ----
  getShoppingList: async () =>
    adaptShopping(
      (await http.get<{ lines: Parameters<typeof adaptShopping>[0] }>('/shopping')).lines,
    ),

  setShoppingChecked: (key, checked) => patchShopping({ check: [{ key, checked }] }),
  setShoppingOrder: (order) => patchShopping({ order }),
  addShoppingLine: (name) => patchShopping({ addManual: [name] }),
  removeShoppingLine: (key) => patchShopping({ removeKeys: [key] }),

  getPrepSchedule: async (): Promise<PrepDay[]> => {
    const { today } = await http.get<HouseholdInfo>('/household')
    const r = await http.get<{ days: Parameters<typeof adaptPrep>[0] }>('/prep', {
      from: today,
      to: addDays(today, 60),
    })
    return adaptPrep(r.days)
  },

  getPantry: async () => adaptPantry(await http.get('/pantry')),

  addPantryItem: async ({ name, quantity, expires }) => {
    await http.post('/pantry', {
      name,
      ...(quantity.trim() && { quantity: quantity.trim() }),
      ...(expires && { expiresOn: expires }),
    })
  },

  updatePantryItem: async (id, { quantity, expires }) => {
    await http.patch(`/pantry/${id}`, {
      ...(quantity !== undefined && quantity.trim() && { quantity: quantity.trim() }),
      ...(expires && { expiresOn: expires }),
    })
  },

  removePantryItem: async (id) => {
    await http.delete(`/pantry/${id}`)
  },
}
