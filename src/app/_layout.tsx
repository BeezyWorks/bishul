import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'

import { refreshAccount, useAccount } from '@/features/account/store'
import { colors } from '@/theme/tokens'

export default function RootLayout() {
  // Hold the first paint until the faces are ready (or have failed: the fallback stack is a sans).
  const [fontsReady, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }),
  )
  const { user } = useAccount()

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
    <QueryClientProvider client={client}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}
      />
    </QueryClientProvider>
  )
}
