/**
 * Cook-mode timers. Pure functions over a timestamp, never a tick counter, so a timer stays right
 * while the app is backgrounded and the same numbers can schedule the notification.
 */
export interface CookTimer {
  id: string
  /** The recipe version being cooked and the step (0-based) the timer belongs to. */
  versionId: string
  stepIndex: number
  label: string
  totalSec: number
  /** Epoch ms when it rings; null unless running. */
  endsAt: number | null
  /** Whole seconds left while idle, paused or done. */
  leftSec: number
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export function newTimer(init: {
  versionId: string
  stepIndex: number
  label: string
  totalSec: number
}): CookTimer {
  return {
    ...init,
    id: timerId(init.versionId, init.stepIndex),
    endsAt: null,
    leftSec: init.totalSec,
  }
}

/** One timer per step: starting a step's timer again resumes or restarts the same one. */
export const timerId = (versionId: string, stepIndex: number) => `${versionId}:${stepIndex}`

export function remainingSec(t: CookTimer, now: number): number {
  if (t.endsAt === null) return t.leftSec
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000))
}

export function timerStatus(t: CookTimer, now: number): TimerStatus {
  const left = remainingSec(t, now)
  if (t.endsAt !== null) return left === 0 ? 'done' : 'running'
  if (left === 0) return 'done'
  return left === t.totalSec ? 'idle' : 'paused'
}

/** Start, resume, or (once it has rung) restart from the full time. */
export function startTimer(t: CookTimer, now: number): CookTimer {
  const status = timerStatus(t, now)
  if (status === 'running') return t
  const left = status === 'done' ? t.totalSec : t.leftSec
  return { ...t, endsAt: now + left * 1000, leftSec: left }
}

export function pauseTimer(t: CookTimer, now: number): CookTimer {
  if (t.endsAt === null) return t
  return { ...t, endsAt: null, leftSec: remainingSec(t, now) }
}

export function resetTimer(t: CookTimer): CookTimer {
  return { ...t, endsAt: null, leftSec: t.totalSec }
}

/** Add (or take away) time on a timer, floored at one second unless it already rang. */
export function addTime(t: CookTimer, now: number, deltaSec: number): CookTimer {
  const status = timerStatus(t, now)
  if (status === 'done') return startTimer({ ...t, leftSec: Math.max(1, deltaSec) }, now)
  const left = Math.max(1, remainingSec(t, now) + deltaSec)
  return t.endsAt === null
    ? { ...t, leftSec: left, totalSec: Math.max(t.totalSec, left) }
    : { ...t, endsAt: now + left * 1000, totalSec: Math.max(t.totalSec, left) }
}

/**
 * The timers worth showing in the tray: anything started, with what has rung first (it needs you),
 * then the soonest to ring, then paused ones. Untouched timers are left out.
 */
export function trayTimers(timers: CookTimer[], now: number): CookTimer[] {
  const rank = (t: CookTimer) => {
    const s = timerStatus(t, now)
    return s === 'done' ? 0 : s === 'running' ? 1 : 2
  }
  return timers
    .filter((t) => timerStatus(t, now) !== 'idle')
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        remainingSec(a, now) - remainingSec(b, now) ||
        a.stepIndex - b.stepIndex,
    )
}
