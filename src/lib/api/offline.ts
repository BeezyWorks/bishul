/**
 * Offline reads. The query cache is saved to the device and restored on launch, so every screen the
 * user has opened (and everything warmed up below) renders from disk with no loading state, with or
 * without a connection. A refetch in the background replaces it when the network is there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, type Query } from '@tanstack/react-query'
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client'
import { useEffect } from 'react'

import { api } from './client'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** Bump when the shape of cached data changes, so old caches are dropped instead of misread. */
const CACHE_VERSION = '1'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Must be at least the persister's maxAge, or restored data is collected straight away.
        gcTime: WEEK,
        retry: 1,
        // Run the fetch even when the device says it is offline; a failure keeps the cached data.
        networkMode: 'offlineFirst',
      },
    },
  })
}

/** Not worth keeping on disk: throwaway searches and the API key list. */
const SKIP = new Set(['mealRecipes', 'suggestions', 'keys'])

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'tavshil-query-cache',
    throttleTime: 1000,
  }),
  maxAge: WEEK,
  buster: CACHE_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) =>
      q.state.status === 'success' && !SKIP.has(String(q.queryKey[0])),
  },
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(fn))
  }
}

/**
 * Fetches what the user will want with no signal (menu, shopping, prep, people, and every recipe for
 * cooking mode) once signed in, so offline does not depend on having opened each screen first.
 */
export async function warmOfflineCache(qc: QueryClient) {
  const get = (queryKey: unknown[], queryFn: () => Promise<unknown>) =>
    qc.prefetchQuery({ queryKey, queryFn })
  await Promise.allSettled([
    get(['info'], () => api.getHouseholdInfo()),
    get(['prefs'], () => api.getPrefs()),
    get(['household'], () => api.getHousehold()),
    get(['contacts'], () => api.getContacts()),
    get(['collections'], () => api.getCollections()),
    get(['upcoming'], () => api.getUpcoming()),
    get(['shopping'], () => api.getShoppingList()),
    get(['prep'], () => api.getPrepSchedule()),
    get(['pantry'], () => api.getPantry()),
    get(['plan', 'week', 'today'], () => api.getWeek(undefined)),
    get(['recipes', '', {}], () => api.searchRecipes('', {})),
  ])
  const list = qc.getQueryData<{ id: string; defaultVersionId: string }[]>(['recipes', '', {}])
  if (!list) return
  await inBatches(list, 4, (r) =>
    Promise.allSettled([
      get(['recipe', r.id], () => api.getRecipe(r.id)),
      get(['version', r.defaultVersionId], () => api.getVersion(r.defaultVersionId)),
    ]),
  )
}

/** Warms the cache once per signed-in session. */
export function useOfflineWarmup(qc: QueryClient, signedIn: boolean) {
  useEffect(() => {
    if (signedIn) void warmOfflineCache(qc)
  }, [qc, signedIn])
}
