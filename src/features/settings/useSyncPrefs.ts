import { useEffect } from 'react'

import { usePrefs } from '@/lib/api/hooks'
import { setUnits } from '@/lib/prefs'

/** The saved US/metric choice becomes the app's unit toggle once it loads. */
export function useSyncPrefs() {
  const { data } = usePrefs()
  const system = data?.system
  useEffect(() => {
    if (system) setUnits(system)
  }, [system])
}
