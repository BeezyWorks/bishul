/** BishulApi over the REST API (`/api/*`, bearer token). Server shapes are adapted in adapt.ts. */
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
  filtersOut,
  type ServerMealDetail,
  type ServerOccasion,
  type ServerPeople,
  type ServerPersonView,
} from './adapt'
import type { AcceptResult, BishulApi } from './client'
import { http } from './http'
import type {
  Course,
  HouseholdInfo,
  Id,
  Kind,
  MealDetail,
  PrepDay,
  Reaction,
  VersionEdit,
} from './types'

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
    ...(e.description !== undefined && { description: e.description }),
    ...(e.ingredients && {
      ingredients: e.ingredients.filter((l) => l.trim()).map((text) => ({ text: text.trim() })),
    }),
    ...(e.steps && { steps: e.steps.filter((s) => s.trim()).map((s) => s.trim()) }),
  }
}

const TAG_TYPE_OUT = {
  allergen: 'allergen',
  ingredient: 'ingredient',
  diet: 'diet',
  'kashrut-dish': 'kashrut_dish',
  'kashrut-sourcing': 'kashrut_sourcing',
} as const

export const realApi: BishulApi = {
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
    const [cal, prep] = await Promise.all([
      http.get<{ days: Parameters<typeof adaptDay>[0][] }>('/calendar', { from, to }),
      http.get<{
        days: {
          date: string
          meals: { mealId: string; label: string }[]
          tasks: { mealId: string; label: string; dish: string; startText: string | null }[]
        }[]
      }>('/prep', { from, to, includeDrafts: true }),
    ])
    const cooking = new Map<string, { mealId: string; mealName: string; text: string }[]>()
    for (const d of prep.days)
      cooking.set(
        d.date,
        d.tasks.map((t) => ({
          mealId: t.mealId,
          mealName: d.meals.find((m) => m.mealId === t.mealId)?.label ?? '',
          text: `${clock12(t.startText)}: ${t.dish ? `${t.label} (${t.dish})` : t.label}`,
        })),
      )
    return cal.days.map((d) => adaptDay(d, cooking.get(d.date)))
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
    return adaptMealDetail(await http.patch<ServerMealDetail>(`/meals/${id}`, { addItems: [entry] }))
  },

  removeMenuItem: async (id, itemId) =>
    adaptMealDetail(await http.patch<ServerMealDetail>(`/meals/${id}`, { removeItemIds: [itemId] })),

  getSuggestions: async (id, course) =>
    adaptSuggestions(
      course,
      await http.get(`/meals/${id}/suggestions`, { course, limit: 30 }),
    ),

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
    const all = everyone ? [...everyone.household.people, ...everyone.contacts.flatMap((c) => c.people)] : []
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
      await http.post<Parameters<typeof adaptCollection>[0]>('/collections', { name, filters: spec }),
    )
  },

  previewImport: async (text, title) => {
    const r = await http.post<{
      parsed: {
        title?: string
        servings?: number
        ingredients: { line: string; name: string; skipImpact: 'none' | 'minor' | 'ruins' }[]
        steps: string[]
      }
    }>('/recipes/import', { text, ...(title?.trim() && { title: title.trim() }), dryRun: true })
    return r.parsed
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

  // ---- People ----
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
    await http.post(`/people/${personId}/reactions`, {
      versionId,
      reaction,
      ...(note?.trim() && { note: note.trim() }),
    })
  },

  // ---- Shopping, prep, pantry ----
  getShoppingList: async () =>
    adaptShopping((await http.get<{ lines: Parameters<typeof adaptShopping>[0] }>('/shopping')).lines),

  setShoppingChecked: async (key, checked) => {
    await http.patch('/shopping', { check: [{ key, checked }] })
  },

  setShoppingOrder: async (order) => {
    await http.patch('/shopping', { order })
  },

  addShoppingLine: async (name) => {
    await http.patch('/shopping', { addManual: [name] })
  },

  removeShoppingLine: async (key) => {
    await http.patch('/shopping', { removeKeys: [key] })
  },

  getPrepSchedule: async (): Promise<PrepDay[]> => {
    const { today } = await http.get<HouseholdInfo>('/household')
    const r = await http.get<{ days: Parameters<typeof adaptPrep>[0] }>('/prep', {
      from: today,
      to: addDays(today, 60),
    })
    return adaptPrep(r.days)
  },

  getPantry: async () => adaptPantry(await http.get('/pantry')),

  addPantryItem: async ({ name, quantity, location, expires }) => {
    await http.post('/pantry', {
      name,
      ...(quantity.trim() && { quantity: quantity.trim() }),
      ...(location?.trim() && { location: location.trim() }),
      ...(expires && { expiresOn: expires }),
    })
  },

  updatePantryItem: async (id, { quantity, location, expires }) => {
    await http.patch(`/pantry/${id}`, {
      ...(quantity !== undefined && quantity.trim() && { quantity: quantity.trim() }),
      ...(location !== undefined && { location }),
      ...(expires !== undefined && { expiresOn: expires }),
    })
  },

  removePantryItem: async (id) => {
    await http.delete(`/pantry/${id}`)
  },
}
