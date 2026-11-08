import * as Notifications from 'expo-notifications'
import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

import type { CookTimer } from '@bishul/core/src/cook'

import { formatClock } from '@/lib/units'

/** Where a notification tap should land: the recipe being cooked, on the step the timer belongs to. */
export interface TimerTarget {
  versionId: string
  step: number
  scale?: number
}

/** Local notifications need a native build; on the web the in-app timers are all there is. */
export const canNotify = Platform.OS !== 'web'

export const cookHref = (t: TimerTarget): Href =>
  `/cook/${t.versionId}?step=${t.step}${t.scale && t.scale !== 1 ? `&scale=${t.scale}` : ''}` as Href

let configured = false
/** Show the ring even while the app is open, with sound. Safe to call more than once. */
export function configureNotifications() {
  if (!canNotify || configured) return
  configured = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export async function ensurePermission(): Promise<boolean> {
  if (!canNotify) return false
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    return (await Notifications.requestPermissionsAsync()).granted
  } catch {
    return false
  }
}

/** Schedule the ring for when the timer ends. Replaces any earlier ring for the same timer. */
export async function scheduleRing(
  timer: CookTimer,
  secondsLeft: number,
  recipeTitle: string,
  scale: number,
) {
  if (!canNotify || secondsLeft < 1) return
  await cancelRing(timer.id)
  if (!(await ensurePermission())) return
  const target: TimerTarget = { versionId: timer.versionId, step: timer.stepIndex, scale }
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: timer.id,
      content: {
        title: `Timer is up: ${formatClock(timer.totalSec)}`,
        body: `${recipeTitle} · step ${timer.stepIndex + 1}. Tap to go back to it.`,
        sound: true,
        data: { ...target },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsLeft,
        repeats: false,
      },
    })
  } catch {
    // A refused schedule must never stop the on-screen timer.
  }
}

export async function cancelRing(id: string) {
  if (!canNotify) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch {
    // Nothing scheduled under that id.
  }
}

/**
 * Tapping a ring takes you to the step it belongs to, whether the app was closed, in the background
 * or open on another screen. Mount once, near the root.
 */
function useNativeTimerTapRouting() {
  const router = useRouter()
  const handled = useRef<string | null>(null)
  const response = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!response) return
    const id = response.notification.request.identifier
    if (handled.current === id) return
    handled.current = id
    const data = response.notification.request.content.data as Partial<TimerTarget> | undefined
    if (!data?.versionId || typeof data.step !== 'number') return
    router.navigate(cookHref({ versionId: data.versionId, step: data.step, scale: data.scale }))
  }, [response, router])
}

/** `canNotify` never changes at runtime, so choosing the hook here keeps hook order stable. */
export const useTimerTapRouting = canNotify ? useNativeTimerTapRouting : () => undefined
