import { useSyncExternalStore } from 'react'

import { storage } from '@/lib/storage'
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

// ---- Per-device cooking preferences (kept on this device, not in the household) ----

export type AlarmSoundId = 'bell' | 'chimes' | 'marimba' | 'beeps'
export const ALARM_SOUND_IDS: AlarmSoundId[] = ['bell', 'chimes', 'marimba', 'beeps']

const SOUND_KEY = 'tavshil.alarmSound'
const AWAKE_KEY = 'tavshil.keepAwake'

const storedSound = storage.get(SOUND_KEY)
let alarmSound: AlarmSoundId = ALARM_SOUND_IDS.includes(storedSound as AlarmSoundId)
  ? (storedSound as AlarmSoundId)
  : 'bell'
// On unless it was switched off.
let keepAwake = storage.get(AWAKE_KEY) !== 'off'

/** The sound chosen now, for code that is not a component. */
export const getAlarmSound = () => alarmSound

export function setAlarmSound(id: AlarmSoundId) {
  alarmSound = id
  storage.set(SOUND_KEY, id)
  listeners.forEach((l) => l())
}

export function setKeepAwake(on: boolean) {
  keepAwake = on
  storage.set(AWAKE_KEY, on ? 'on' : 'off')
  listeners.forEach((l) => l())
}

export function useAlarmSound(): [AlarmSoundId, (id: AlarmSoundId) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => alarmSound,
    () => alarmSound,
  )
  return [value, setAlarmSound]
}

/** Keep the screen on in cooking mode. Defaults to on. */
export function useKeepAwakePref(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => keepAwake,
    () => keepAwake,
  )
  return [value, setKeepAwake]
}
