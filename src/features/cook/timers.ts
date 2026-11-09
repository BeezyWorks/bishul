import { useEffect, useState, useSyncExternalStore } from 'react'

import {
  addTime,
  newTimer,
  pauseTimer,
  remainingSec,
  resetTimer,
  startTimer,
  timerId,
  timerStatus,
  trayTimers,
  type CookTimer,
} from '@tavshil/core/src/cook'

import { cancelRing, scheduleRing } from './notifications'

/** A cook-mode timer plus what the ring needs to say. */
export interface CookTimerEntry extends CookTimer {
  recipeTitle: string
  scale: number
}

type StepTimer = Pick<CookTimerEntry, 'versionId' | 'stepIndex' | 'label' | 'totalSec'> & {
  recipeTitle: string
  scale: number
}

// Timers outlive the screen: leaving cook mode, or moving between steps, never stops one.
let entries: CookTimerEntry[] = []
const listeners = new Set<() => void>()
function commit(next: CookTimerEntry[]) {
  entries = next
  listeners.forEach((l) => l())
}
const find = (id: string) => entries.find((e) => e.id === id)
function put(entry: CookTimerEntry) {
  commit(
    entries.some((e) => e.id === entry.id)
      ? entries.map((e) => (e.id === entry.id ? entry : e))
      : [...entries, entry],
  )
}
function sync(entry: CookTimerEntry, now: number) {
  if (entry.endsAt === null) void cancelRing(entry.id)
  else void scheduleRing(entry, remainingSec(entry, now), entry.recipeTitle, entry.scale)
}
const withMeta = (
  base: CookTimer,
  from: { recipeTitle: string; scale: number },
): CookTimerEntry => ({
  ...base,
  recipeTitle: from.recipeTitle,
  scale: from.scale,
})

export const timerActions = {
  /** Start, resume, or restart the timer for a step. */
  start(init: StepTimer, now = Date.now()) {
    const base = find(timerId(init.versionId, init.stepIndex)) ?? withMeta(newTimer(init), init)
    const next = { ...startTimer(base, now), recipeTitle: init.recipeTitle, scale: init.scale }
    put(next)
    sync(next, now)
  },
  pause(id: string, now = Date.now()) {
    const t = find(id)
    if (!t) return
    const next = { ...t, ...pauseTimer(t, now) }
    put(next)
    sync(next, now)
  },
  reset(id: string) {
    const t = find(id)
    if (!t) return
    const next = { ...t, ...resetTimer(t) }
    put(next)
    sync(next, Date.now())
  },
  addMinute(id: string, now = Date.now()) {
    const t = find(id)
    if (!t) return
    const next = { ...t, ...addTime(t, now, 60) }
    put(next)
    sync(next, now)
  },
  /** Drop a timer (one that rang, or that you no longer want). */
  clear(id: string) {
    void cancelRing(id)
    commit(entries.filter((e) => e.id !== id))
  },
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const useTimerEntries = () =>
  useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  )

/** The current time, ticking every second while `active`, so countdowns redraw. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const h = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(h)
  }, [active])
  return now
}

/** The timers to show in the tray, and whether any is counting down (so the clock must tick). */
export function useTray() {
  const all = useTimerEntries()
  const running = all.some((e) => e.endsAt !== null)
  const now = useNow(running)
  const tray = trayTimers(all, now) as CookTimerEntry[]
  return { all, tray, now, running, status: (t: CookTimer) => timerStatus(t, now) }
}
