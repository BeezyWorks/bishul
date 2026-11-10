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

import { startAlarm, stopAlarm } from './alarm'
import { endLiveActivity, syncLiveActivity } from './liveActivity'
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
// Timers whose alarm the cook has already silenced (or acted on), so it does not ring again.
const silenced = new Set<string>()
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
  // Running and paused timers get a lock-screen countdown; a reset one has nothing to show.
  if (timerStatus(entry, now) === 'idle') endLiveActivity(entry.id)
  else syncLiveActivity(entry)
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
    silenced.delete(timerId(init.versionId, init.stepIndex))
    const base = find(timerId(init.versionId, init.stepIndex)) ?? withMeta(newTimer(init), init)
    const next = { ...startTimer(base, now), recipeTitle: init.recipeTitle, scale: init.scale }
    put(next)
    sync(next, now)
  },
  pause(id: string, now = Date.now()) {
    silenced.delete(id)
    const t = find(id)
    if (!t) return
    const next = { ...t, ...pauseTimer(t, now) }
    put(next)
    sync(next, now)
  },
  reset(id: string) {
    silenced.delete(id)
    const t = find(id)
    if (!t) return
    const next = { ...t, ...resetTimer(t) }
    put(next)
    sync(next, Date.now())
  },
  addMinute(id: string, now = Date.now()) {
    timerActions.addSeconds(id, 60, now)
  },
  /** Add time to a timer, running, paused or already up (which restarts it). */
  addSeconds(id: string, sec: number, now = Date.now()) {
    silenced.delete(id)
    const t = find(id)
    if (!t) return
    const next = { ...t, ...addTime(t, now, sec) }
    put(next)
    sync(next, now)
  },
  /** Rename a running timer (its step's saved label is changed separately). */
  setLabel(id: string, label: string) {
    const t = find(id)
    if (!t) return
    const next = { ...t, label }
    put(next)
    syncLiveActivity(next)
  },
  /** Stop the ring for every timer that is up; the timers stay so you can restart or clear them. */
  silence() {
    const now = Date.now()
    entries.filter((e) => timerStatus(e, now) === 'done').forEach((e) => silenced.add(e.id))
    commit([...entries]) // a new array, so subscribers re-render
  },
  /** Drop a timer (one that rang, or that you no longer want). */
  clear(id: string) {
    silenced.delete(id)
    void cancelRing(id)
    endLiveActivity(id)
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

const ringingEntries = (all: CookTimerEntry[], now: number) =>
  all.filter((e) => timerStatus(e, now) === 'done' && !silenced.has(e.id))

/**
 * Plays the in-app alarm when a timer ends, on any screen. Mount once at the root. (With the app
 * in the background the scheduled notification rings instead.)
 */
export function useTimerAlarm(): CookTimerEntry | undefined {
  const all = useTimerEntries()
  // The clock lives in state: the compiler would otherwise cache a render-time Date.now() and
  // never notice a timer ending.
  const [now, setNow] = useState(() => Date.now())
  // Wake up when the next running timer ends; nothing needs to tick until then.
  useEffect(() => {
    setNow(Date.now())
    const ends = all.filter((e) => e.endsAt !== null).map((e) => e.endsAt as number)
    if (ends.length === 0) return
    const wait = Math.max(0, Math.min(...ends) - Date.now()) + 50
    const h = setTimeout(() => setNow(Date.now()), wait)
    return () => clearTimeout(h)
  }, [all])
  const first = ringingEntries(all, now)[0]
  const ringing = first !== undefined
  useEffect(() => {
    if (ringing) startAlarm()
    else stopAlarm()
  }, [ringing])
  return first
}

/** The timers to show in the tray, and whether any is counting down (so the clock must tick). */
export function useTray() {
  const all = useTimerEntries()
  const running = all.some((e) => e.endsAt !== null)
  const now = useNow(running)
  const tray = trayTimers(all, now) as CookTimerEntry[]
  const ringingIds = new Set(ringingEntries(all, now).map((e) => e.id))
  return { all, tray, now, running, ringingIds, status: (t: CookTimer) => timerStatus(t, now) }
}
