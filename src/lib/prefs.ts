import { useSyncExternalStore } from 'react'

import type { Measure, UnitSystem } from '@/lib/units'

/** Tiny shared store for the unit toggle, so recipe and cooking mode agree. */
let units: UnitSystem = 'metric'
let measure: Measure = 'auto'
const listeners = new Set<() => void>()

export function setUnits(u: UnitSystem) {
  units = u
  listeners.forEach((l) => l())
}

export function setMeasure(m: Measure) {
  measure = m
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Weight vs volume, independent of metric vs US. */
export function useMeasure(): [Measure, (m: Measure) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => measure,
    () => measure,
  )
  return [value, setMeasure]
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
