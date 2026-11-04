import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'

import { api } from './client'
import type { Id, ISODate, RecipeFilters } from './types'

export const useUpcoming = () =>
  useQuery({ queryKey: ['upcoming'], queryFn: () => api.getUpcoming() })

export const useCalendar = (from: ISODate, to: ISODate, enabled = true) =>
  useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.getCalendar({ from, to }),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useMeal = (id: Id) =>
  useQuery({ queryKey: ['meal', id], queryFn: () => api.getMeal(id) })

export const useSuggestions = (
  mealId: Id,
  course: Parameters<typeof api.getSuggestions>[1] | null,
) =>
  useQuery({
    queryKey: ['suggestions', mealId, course],
    queryFn: () => api.getSuggestions(mealId, course!),
    enabled: !!course,
    gcTime: 0,
  })

export const useRecipes = (query: string, filters: RecipeFilters) =>
  useQuery({
    queryKey: ['recipes', query, filters],
    queryFn: () => api.searchRecipes(query, filters),
    placeholderData: keepPreviousData,
  })

export const useRecipe = (id: Id) =>
  useQuery({ queryKey: ['recipe', id], queryFn: () => api.getRecipe(id) })
export const useVersion = (id: Id) =>
  useQuery({ queryKey: ['version', id], queryFn: () => api.getVersion(id) })
export const useCollections = () =>
  useQuery({ queryKey: ['collections'], queryFn: () => api.getCollections() })
export const useHousehold = () =>
  useQuery({ queryKey: ['household'], queryFn: () => api.getHousehold() })
export const useContacts = () =>
  useQuery({ queryKey: ['contacts'], queryFn: () => api.getContacts() })
export const usePerson = (id: Id) =>
  useQuery({ queryKey: ['person', id], queryFn: () => api.getPerson(id) })
export const useShopping = () =>
  useQuery({ queryKey: ['shopping'], queryFn: () => api.getShoppingList() })
export const usePrep = () => useQuery({ queryKey: ['prep'], queryFn: () => api.getPrepSchedule() })
export const usePantry = () => useQuery({ queryKey: ['pantry'], queryFn: () => api.getPantry() })

export const useHouseholdInfo = () =>
  useQuery({ queryKey: ['info'], queryFn: () => api.getHouseholdInfo(), staleTime: 60_000 })
export const usePrefs = () => useQuery({ queryKey: ['prefs'], queryFn: () => api.getPrefs() })
export const useApiKeys = () => useQuery({ queryKey: ['keys'], queryFn: () => api.listApiKeys() })

/** Today in the household's time zone (never the viewer's clock). Undefined until it loads. */
export const useToday = (): ISODate | undefined => useHouseholdInfo().data?.today

/**
 * What a change makes stale. Each mutation names the groups it touches, so one edit does not
 * refetch the whole app.
 */
export const stale = {
  /** A meal's name, kind, guests or status; the plan screens show it. */
  meal: [['meal'], ['calendar'], ['upcoming']],
  /** Who is coming or what kind of meal: the brief and the picker change, the lists do not. */
  who: [['meal'], ['calendar'], ['upcoming'], ['suggestions']],
  /** A menu change: the meal, its suggestions, and everything that depends on accepted menus. */
  menu: [['meal'], ['calendar'], ['upcoming'], ['suggestions'], ['shopping'], ['prep'], ['pantry']],
  /** Accepting or reopening holds pantry items and schedules the cooking. */
  accept: [['meal'], ['calendar'], ['upcoming'], ['shopping'], ['prep'], ['pantry']],
  /** Who is who: a person's constraints change briefs, suggestions and "safe for". */
  people: [['household'], ['contacts'], ['person'], ['meal'], ['suggestions'], ['recipes']],
  /** Notes and reactions: the person, plus what ranks suggestions and the recipe page. */
  reactions: [['person'], ['household'], ['contacts'], ['suggestions'], ['recipe']],
  recipes: [['recipes'], ['recipe'], ['version'], ['collections'], ['meal'], ['suggestions']],
  collections: [['collections']],
  shopping: [['shopping']],
  pantry: [['pantry'], ['shopping'], ['suggestions']],
  settings: [['info'], ['prefs'], ['calendar'], ['upcoming'], ['prep']],
  keys: [['keys']],
} satisfies Record<string, QueryKey[]>

const invalidate = (qc: QueryClient, keys: QueryKey[]) =>
  Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))

/** A mutation that refreshes only the queries it names (see `stale`). */
export function useApiMutation<A, R>(fn: (arg: A) => Promise<R>, keys: QueryKey[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await invalidate(qc, keys)
    },
  })
}
