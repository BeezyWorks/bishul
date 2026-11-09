import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import { Button, Loading, Text } from '@/components'
import { colors, space } from '@/theme/tokens'

import { completeHandoff, takeReturnTo } from './store'

/** The handoff puts `ott` in the URL fragment (`error` comes in the query); read both. */
function useHandoffParams() {
  const query = useLocalSearchParams<{ ott?: string; error?: string }>()
  // Only a browser has a location; a native deep link carries the token in the query.
  const hash = new URLSearchParams(
    typeof window === 'undefined' || !window.location ? '' : window.location.hash.slice(1),
  )
  return { ott: hash.get('ott') ?? query.ott, error: hash.get('error') ?? query.error }
}

/** Where Google/Apple sign-in lands (`#ott=` or `?error=`), via auth.baderech.app/handoff. */
export function CallbackScreen() {
  const { ott, error } = useHandoffParams()
  const [failure, setFailure] = useState<string | null>(
    error ? 'Sign-in didn’t finish. Please try again.' : null,
  )

  useEffect(() => {
    if (!ott) return
    completeHandoff(ott)
      .then(() => router.replace(takeReturnTo() as never))
      .catch((e: Error) => setFailure(e.message))
  }, [ott])

  if (!failure) return <Loading label="Signing you in..." />
  return (
    <View style={{ padding: space.xl, gap: space.md, alignItems: 'center' }}>
      <Text variant="h2">Couldn’t sign in</Text>
      <Text color={colors.muted}>{failure}</Text>
      <Button label="Back to sign in" onPress={() => router.replace('/' as never)} />
    </View>
  )
}
