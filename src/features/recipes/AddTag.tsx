import React, { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Text } from '@/components'
import { useSaveVersion } from '@/lib/api/hooks'
import type { RecipeVersion } from '@/lib/api/types'
import { colors, fontSize, fonts, radius, space } from '@/theme/tokens'

const MAX_TAGS = 12

/**
 * A "+ Tag" button on the recipe page that opens a small field to add one tag without opening the full editor.
 * Saves in place, so it is kept in the version's edit history like any other edit.
 */
export function AddTag({ v }: { v: RecipeVersion }) {
  const save = useSaveVersion(v.recipeId)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  if (v.tags.length >= MAX_TAGS) return null

  const close = () => {
    setOpen(false)
    setText('')
  }
  const submit = () => {
    const tag = text.replace(/\s+/g, ' ').trim()
    const have = v.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    if (tag && !have) save.mutate({ versionId: v.id, edit: { tags: [...v.tags, tag] } })
    close()
  }

  if (!open)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a tag"
        onPress={() => setOpen(true)}
        style={styles.add}
      >
        <Text style={styles.addText}>+ Tag</Text>
      </Pressable>
    )
  return (
    <View style={styles.editor}>
      <TextInput
        autoFocus
        accessibilityLabel="New tag"
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        onBlur={() => (text.trim() ? submit() : close())}
        placeholder="e.g. italian"
        placeholderTextColor={colors.muted}
        maxLength={30}
        returnKeyType="done"
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  add: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.xs, color: colors.accent },
  editor: {
    minWidth: 120,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  input: { fontFamily: fonts.body, fontSize: fontSize.xs, color: colors.ink, padding: 0 },
})
