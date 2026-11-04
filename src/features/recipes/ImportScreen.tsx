import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Card, Screen, SectionHeader, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation } from '@/lib/api/hooks'
import type { ImportPreview } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

/** Paste a recipe, check how it was read, then save it. */
export function ImportScreen() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [notes, setNotes] = useState<{ review: string[]; unquantified: string[] } | null>(null)

  const parse = useApiMutation(async () => {
    const p = await api.previewImport(text, title)
    setPreview(p)
    if (!title.trim() && p.title) setTitle(p.title)
    return p
  }, [])
  const save = useApiMutation(async () => {
    const r = await api.importRecipe({ text, title, servings: preview?.servings })
    setNotes({ review: r.needsReview, unquantified: r.unquantified })
    return r
  }, stale.recipes)

  return (
    <Screen
      back={{ label: 'Recipes', href: '/recipes' }}
      title="Import a recipe"
      subtitle="Paste the recipe as you have it: a title, the ingredients, then the method."
    >
      <Card>
        <TextField
          label="Recipe"
          value={text}
          onChangeText={(t) => {
            setText(t)
            setPreview(null)
          }}
          lines={12}
          placeholder={'Potato kugel\n\nIngredients\n5 potatoes\n2 eggs\n...\n\nMethod\n1. Grate the potatoes...'}
        />
        <TextField label="Title (optional)" value={title} onChangeText={setTitle} />
        {parse.error ? <Text color={colors.danger}>{(parse.error as Error).message}</Text> : null}
        <Button
          label="Preview"
          disabled={!text.trim()}
          loading={parse.isPending}
          onPress={() => parse.mutate(undefined)}
        />
      </Card>

      {preview ? (
        <Card>
          <SectionHeader
            title={preview.title || 'No title found'}
            hint={preview.servings ? `Serves ${preview.servings}` : undefined}
          />
          {!preview.title && !title.trim() ? (
            <Text color={colors.warn}>Add a title above so the recipe can be saved.</Text>
          ) : null}
          <Text variant="label">Ingredients ({preview.ingredients.length})</Text>
          {preview.ingredients.map((i, n) => (
            <View key={n} style={styles.row}>
              <Text style={{ flex: 1 }}>{i.line}</Text>
              <Badge label={i.name} tone="muted" />
            </View>
          ))}
          <Text variant="label">Steps ({preview.steps.length})</Text>
          {preview.steps.map((s, n) => (
            <Text key={n}>
              {n + 1}. {s}
            </Text>
          ))}
          {save.error ? <Text color={colors.danger}>{(save.error as Error).message}</Text> : null}
          {notes ? (
            <Text color={colors.accent}>
              Saved.
              {notes.review.length ? ` Check allergens and kashrut flags for: ${notes.review.join(', ')}.` : ''}
              {notes.unquantified.length ? ` No amount read for: ${notes.unquantified.join(', ')}.` : ''}
            </Text>
          ) : null}
          <Button
            label="Save recipe"
            disabled={!(preview.title || title.trim()) || !preview.ingredients.length}
            loading={save.isPending}
            onPress={async () => {
              const r = await save.mutateAsync(undefined)
              router.push(`/recipes/${r.recipeId}` as Href)
            }}
          />
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
})
