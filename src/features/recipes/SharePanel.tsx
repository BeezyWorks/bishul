import { useQueryClient } from '@tanstack/react-query'
import React, { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { Button, Text } from '@/components'
import { api } from '@/lib/api/client'
import { useRecipeShares } from '@/lib/api/hooks'
import type { RecipeShare } from '@/lib/api/types'
import { colors, radius, space } from '@/theme/tokens'

const LOGO = require('../../../assets/brand/icon.png')

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The system share sheet (apps, copy to clipboard); on a browser without one, copies the link. */
async function sendLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share(Platform.OS === 'ios' ? { url, message: title } : { message: url })
    } catch {
      return 'failed'
    }
    return 'shared'
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title })
    } catch {
      // closed without choosing
    }
    return 'shared'
  }
  return (await copy(url)) ? 'copied' : 'failed'
}

/** The recipe's active link, if it is shared. */
export function useRecipeShare(recipeId: string): RecipeShare | undefined {
  const { data } = useRecipeShares()
  return data?.find((s) => s.recipeId === recipeId)
}

/** A switch on the recipe showing that sharing is on; turning it off ends the link. */
export function SharingSwitch({ recipeId }: { recipeId: string }) {
  const qc = useQueryClient()
  const share = useRecipeShare(recipeId)
  const [busy, setBusy] = useState(false)
  if (!share) return null
  const turnOff = async () => {
    setBusy(true)
    try {
      await api.stopSharing(share.id)
      await qc.invalidateQueries({ queryKey: ['shares'] })
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={styles.switchRow}>
      <Switch
        value
        disabled={busy}
        onValueChange={() => void turnOff()}
        trackColor={{ true: colors.accent, false: colors.line }}
        accessibilityLabel="Sharing enabled"
      />
      <Text style={{ flex: 1 }}>Sharing is on. Anyone with the link can read this recipe.</Text>
    </View>
  )
}

/** The public link to a recipe as a QR code with the logo in the middle, and a button to send it. */
export function SharePanel({
  recipeId,
  title,
  onClose,
}: {
  recipeId: string
  title: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [share, setShare] = useState<RecipeShare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .shareRecipe(recipeId)
      .then((s) => {
        if (!live) return
        setShare(s)
        void qc.invalidateQueries({ queryKey: ['shares'] })
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [recipeId, qc])

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
          <Text variant="h2" align="center">
            Share this recipe
          </Text>
          <Text color={colors.muted} align="center">
            Scan to open it, or send the link. Anyone with it can read the recipe without an
            account.
          </Text>
          {error ? (
            <Text color={colors.danger} accessibilityRole="alert" align="center">
              {error}
            </Text>
          ) : share ? (
            <View style={styles.qr} accessibilityLabel="QR code for the recipe link">
              <QRCode
                value={share.url}
                size={220}
                ecl="H"
                color={colors.ink}
                backgroundColor={colors.surface}
                logo={LOGO}
                logoSize={52}
                logoMargin={4}
                logoBorderRadius={12}
                logoBackgroundColor={colors.surface}
              />
            </View>
          ) : (
            <Text color={colors.muted} align="center">
              Making the link…
            </Text>
          )}
          {note ? (
            <Text color={colors.muted} align="center">
              {note}
            </Text>
          ) : null}
          <Button
            label="Share link"
            icon="share"
            full
            disabled={!share}
            onPress={async () => {
              if (!share) return
              const r = await sendLink(share.url, title)
              setNote(
                r === 'copied'
                  ? 'Link copied.'
                  : r === 'failed'
                    ? 'Couldn’t share the link.'
                    : null,
              )
            }}
          />
          <Button label="Done" variant="ghost" full onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    alignItems: 'stretch',
  },
  qr: { alignSelf: 'center', padding: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
