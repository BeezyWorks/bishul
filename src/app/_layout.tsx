import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'

import { refreshAccount, useAccount } from '@/features/account/store'
import { configureNotifications, useTimerTapRouting } from '@/features/cook/notifications'
import { AlarmBanner } from '@/features/cook/AlarmBanner'
import { timerActions, useTimerAlarm } from '@/features/cook/timers'
import { createQueryClient, persistOptions, useOfflineWarmup } from '@/lib/api/offline'
import { colors } from '@/theme/tokens'

configureNotifications()

/**
 * Timer plumbing that must live above every screen: routes a tapped notification to its step, plays
 * the alarm and shows its banner. Mounted after the Stack so navigation is ready.
 */
function TimerTapRouting() {
  // Tapping the notification is as good as silencing: you are looking at the timer now.
  useTimerTapRouting(timerActions.silence)
  const ringing = useTimerAlarm()
  return <AlarmBanner entry={ringing} />
}

export default function RootLayout() {
  // Hold the first paint until the faces are ready (or have failed: the fallback stack is a sans).
  const [fontsReady, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })
  const [client] = useState(createQueryClient)
  const { user, status } = useAccount()
  useOfflineWarmup(client, status === 'signedIn')

  useEffect(() => {
    void refreshAccount()
  }, [])
  // Another person's data must never show up for the next sign-in.
  const userId = user?.id ?? null
  const lastUser = useRef(userId)
  useEffect(() => {
    const before = lastUser.current
    lastUser.current = userId
    // Leaving or switching accounts drops the cache; the first sign-in has nothing to drop.
    if (before !== null && before !== userId) client.clear()
  }, [client, userId])

  if (!fontsReady && !fontError) return null
  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}
      />
      <TimerTapRouting />
    </PersistQueryClientProvider>
  )
}
