import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { Button, Card, Disclaimer, Loading, Pill, Screen, SectionHeader, Text } from '@/components'
import { SignInScreen } from '@/features/account/SignInScreen'
import { useAccount } from '@/features/account/store'
import { api } from '@/lib/api/client'
import { ApiError } from '@/lib/api/http'
import { groupBySection } from '@/lib/sections'
import { colors, space } from '@/theme/tokens'

/**
 * A recipe link (`/s/<token>`). Open to everyone: it shows the recipe as its author has it now. Saving a copy needs an
 * account, so a signed-out visitor is asked to sign in or create one first, and comes back here.
 */
export function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const router = useRouter()
  const { status } = useAccount()
  const [index, setIndex] = useState(0)
  const [signingIn, setSigningIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['shared', token],
    queryFn: () => api.getShared(token),
    // The author may be editing right now.
    staleTime: 0,
    retry: false,
  })

  if (signingIn && status === 'signedOut')
    return (
      <SignInScreen
        returnTo={`/s/${token}`}
        reason={data ? `Sign in to save “${data.title}” to your cookbook.` : undefined}
      />
    )
  if (isLoading) return <Loading />
  if (!data) {
    const gone = loadError instanceof ApiError && loadError.status === 410
    return (
      <Screen title={gone ? 'This link has been turned off' : 'We can’t find that recipe'}>
        <Text color={colors.muted}>
          {gone
            ? 'The person who shared it has stopped sharing it.'
            : 'Check the link, or ask the person who sent it to share it again.'}
        </Text>
        <Button label="Go to Bishul" href="/" />
      </Screen>
    )
  }

  const v = data.versions[Math.min(index, data.versions.length - 1)]
  const save = async () => {
    if (status !== 'signedIn') return setSigningIn(true)
    setSaving(true)
    setError(null)
    try {
      const { recipeId } = await api.saveShared(token)
      router.replace(`/recipes/${recipeId}` as never)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the recipe.')
      setSaving(false)
    }
  }

  return (
    <Screen
      eyebrow="Shared recipe"
      title={data.title}
      subtitle={v.description ?? undefined}
      actions={
        <Button
          label={status === 'signedIn' ? 'Save to my cookbook' : 'Sign in to save'}
          loading={saving}
          onPress={save}
        />
      }
    >
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {status !== 'signedIn' ? (
        <Card tone="info">
          <Text color={colors.info}>
            Anyone with this link sees the recipe as the author has it now. To keep your own copy,
            sign in or create a free account. A saved copy stays as it was when you saved it.
          </Text>
        </Card>
      ) : null}
      {data.versions.length > 1 ? (
        <View style={styles.row} accessibilityRole="tablist">
          {data.versions.map((x, i) => (
            <Pill key={i} label={x.title} selected={i === index} onPress={() => setIndex(i)} />
          ))}
        </View>
      ) : null}
      <Text color={colors.muted}>
        {[
          v.servings ? `Serves ${v.servings}` : null,
          v.totalMinutes ? `${v.totalMinutes} min` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Card>
        <SectionHeader title="Ingredients" />
        {groupBySection(v.ingredients.map((i) => ({ ...i, section: i.section ?? '' }))).map(
          (g, gi) => (
            <View key={gi} style={{ gap: space.xs }}>
              {g.section ? <Text variant="label">{g.section}</Text> : null}
              {g.items.map((i, ii) => (
                <View key={ii}>
                  <Text>{i.text}</Text>
                  {i.allergens.length ? (
                    <Text variant="small" color={colors.danger}>
                      Contains {i.allergens.join(', ')}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ),
        )}
      </Card>
      {v.equipment.length ? (
        <Card>
          <SectionHeader title="Equipment" />
          <Text>{v.equipment.join(', ')}</Text>
        </Card>
      ) : null}
      <Card>
        <SectionHeader title="Steps" />
        {v.steps.map((s, i) => (
          <Text key={i}>
            {i + 1}. {s.text}
          </Text>
        ))}
      </Card>
      <Disclaimer />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
})
