import type { CookTimerEntry } from './timers'

/** Live Activities are iOS only. */
export function syncLiveActivity(_timer: CookTimerEntry) {}
export function endLiveActivity(_id: string) {}
