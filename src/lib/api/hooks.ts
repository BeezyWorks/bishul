import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { Id, ISODate, RecipeFilters } from './types'

export const useUpcoming = () =>
  useQuery({ queryKey: ['upcoming'], queryFn: () => api.getUpcoming() })

export const useCalendar = (from: ISODate, to: ISODate) =>
  useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.getCalendar({ from, to }),
    placeholderData: keepPreviousData,
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

/** A mutation that refreshes every query afterwards. The mock is cheap and the real API is small. */
export function useApiMutation<A, R>(fn: (arg: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries()
    },
  })
}
