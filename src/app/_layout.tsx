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
import React, { useState } from 'react'

import { colors } from '@/theme/tokens'

export default function RootLayout() {
  // Web falls back to the system font until the faces load.
  useFonts({
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}
      />
    </QueryClientProvider>
  )
}
