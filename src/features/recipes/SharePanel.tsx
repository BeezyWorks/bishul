import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, SectionHeader, Text } from '@/components'
import { api } from '@/lib/api/client'
import type { RecipeShare } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The public link to a recipe: anyone with it sees the recipe as it is now, and can save their own copy. */
export function SharePanel({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const [share, setShare] = useState<RecipeShare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api
      .shareRecipe(recipeId)
      .then((s) => live && setShare(s))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [recipeId])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const stop = async () => {
    if (!share) return
    setBusy(true)
    try {
      await api.stopSharing(share.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t turn the link off.')
      setBusy(false)
    }
  }

  return (
    <Card>
      <SectionHeader title="Share this recipe" />
      <Text color={colors.muted}>
        Anyone with the link can read the recipe without an account, and sees your changes as you
        make them. If they save it to their own cookbook, they get a copy that stays as it was.
      </Text>
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {share ? (
        <>
          <Text selectable variant="bodyStrong">
            {share.url}
          </Text>
          <View style={styles.row}>
            <Button
              label={copied ? 'Copied' : 'Copy link'}
              onPress={async () => setCopied(await copy(share.url))}
            />
            {canShare ? (
              <Button
                label="Send…"
                variant="secondary"
                onPress={() => void navigator.share({ url: share.url }).catch(() => {})}
              />
            ) : null}
            <Button label="Stop sharing" variant="danger" loading={busy} onPress={stop} />
            <Button label="Done" variant="ghost" onPress={onClose} />
          </View>
        </>
      ) : error ? null : (
        <Text color={colors.muted}>Making the link…</Text>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
})
