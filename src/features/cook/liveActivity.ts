import { Platform } from 'react-native'

import type { LiveActivity } from 'expo-widgets'

import { cookHref } from './notifications'
import type { TimerActivityProps } from './TimerActivity'
import type { CookTimerEntry } from './timers'

const isIOS = Platform.OS === 'ios'

// One activity per timer, so several timers can sit on the lock screen at once.
const running = new Map<string, LiveActivity<TimerActivityProps>>()

/** Imported lazily so Android and tests never load the native module. */
const activity = () => (require('./TimerActivity') as typeof import('./TimerActivity')).default

const propsFor = (t: CookTimerEntry): TimerActivityProps => ({
  label: t.label,
  recipeTitle: t.recipeTitle,
  endsAtMs: t.endsAt,
  leftSec: t.leftSec,
})

/** Show or refresh the lock-screen countdown for a started or paused timer. Never throws. */
export function syncLiveActivity(timer: CookTimerEntry) {
  if (!isIOS) return
  try {
    const props = propsFor(timer)
    const existing = running.get(timer.id)
    if (existing) {
      void existing.update(props)
      return
    }
    const url = `tavshil://${cookHref({ versionId: timer.versionId, step: timer.stepIndex, scale: timer.scale }).toString().replace(/^\//, '')}`
    running.set(timer.id, activity().start(props, url))
  } catch {
    // Live Activities are off in Settings or unsupported: the notification still rings.
    running.delete(timer.id)
  }
}

export function endLiveActivity(id: string) {
  if (!isIOS) return
  const existing = running.get(id)
  running.delete(id)
  try {
    void existing?.end('immediate')
  } catch {
    // Already gone.
  }
}
