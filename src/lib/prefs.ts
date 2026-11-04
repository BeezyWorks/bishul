import { useSyncExternalStore } from 'react'

import type { UnitSystem } from '@/lib/units'

/** Tiny shared store for the unit toggle, so recipe and cooking mode agree. */
let units: UnitSystem = 'metric'
const listeners = new Set<() => void>()

export function setUnits(u: UnitSystem) {
  units = u
  listeners.forEach((l) => l())
}

export function useUnits(): [UnitSystem, (u: UnitSystem) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => units,
    () => units,
  )
  return [value, setUnits]
}
