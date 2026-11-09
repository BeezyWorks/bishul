import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { useMealRecipes, useRecipes } from '@/lib/api/hooks'
import type { Id, MealRecipeHit } from '@/lib/api/types'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Disclaimer } from './Parts'
import { Text } from './Text'

export interface RecipePickerProps {
  /** The meal the dish is for: its attendees' constraints decide what fits. */
  mealId?: Id
  /** Only recipes of this course (`main`, `dessert`, `starter`…). */
  course?: string
  /** Text to start with, e.g. "vegetarian" from "Find a vegetarian main". */
  initialQuery?: string
  /** A recipe that fits was tapped. The caller adds it (`useAddMealDish`) and closes the picker. */
  onPick: (hit: MealRecipeHit) => void
  /** `Add “veg…” as a dish without a recipe` was tapped, with the typed text. */
  onAddWithoutRecipe: (text: string) => void
  /** Escape / the close button. Leave out for no close button. */
  onClose?: () => void
  autoFocus?: boolean
  placeholder?: string
}

/**
 * An inline search over your own recipes for one meal. Recipes that pass every attendee's constraints come first and
 * can be picked; the ones that do not stay in the list, greyed, with why ("meat · not vegetarian"). The last row adds
 * what was typed as a dish with no recipe. A code filter, no AI.
 */
export function RecipePicker({
  mealId,
  course,
  initialQuery = '',
  onPick,
  onAddWithoutRecipe,
  onClose,
  autoFocus = true,
  placeholder = 'Search your recipes',
}: RecipePickerProps) {
  const [text, setText] = useState(initialQuery)
  const q = useDebounced(text.trim(), 250)
  const { data, isFetching } = useMealRecipes(
    mealId,
    { q: q || undefined, course, limit: 20 },
    !!q || !!course,
  )
  // Until the meal-aware search answers (or while there is no meal yet), show the cached recipe list so the picker
  // is never empty. Once the meal's own result lands it replaces this and carries the constraint checks.
  const plain = useRecipes(q, { course: course as never })
  const fallback: MealRecipeHit[] =
    data || !plain.data
      ? []
      : plain.data.slice(0, 20).map((r) => ({
          recipeId: r.id,
          versionId: r.defaultVersionId,
          title: r.title,
          versionTitle: r.title,
          course: r.course,
          kashrut: r.kinds[0],
          note: r.kinds[0] ?? '',
          why: [],
          failsFor: [],
          eatAround: [],
          aiWarnings: [],
        }))
  const fits = data ? data.fits : fallback
  const typed = text.trim()
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <Text color={colors.muted}>{'⌕'}</Text>
        <TextInput
          accessibilityLabel={placeholder}
          value={text}
          onChangeText={setText}
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={onClose}>
            <Text color={colors.muted}>{'✕'}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.list}>
        {fits.map((h) => (
          <Pressable
            key={h.versionId}
            accessibilityRole="button"
            accessibilityLabel={`Add ${h.title}`}
            onPress={() => onPick(h)}
            style={({ pressed }: { pressed: boolean }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <Text variant="bodyStrong">{h.title}</Text>
            <Text variant="small">{h.note}</Text>
            {h.eatAround.map((e) => (
              <Text key={e} variant="small" color={colors.warn}>
                {e}
              </Text>
            ))}
          </Pressable>
        ))}
        {data?.excluded.map((h) => (
          <View
            key={h.versionId}
            style={[styles.row, styles.out]}
            accessibilityLabel={`${h.title}, does not fit: ${h.why.join('; ')}`}
          >
            <Text variant="bodyStrong" color={colors.muted}>
              {h.title}
            </Text>
            <Text variant="small" color={colors.danger}>
              {h.note.split(' · ')[0]}
              {h.why.length ? ` · ${h.why[0]}` : ''}
            </Text>
          </View>
        ))}
        {!fits.length && !data?.excluded.length ? (
          <View style={styles.row}>
            <Text variant="small">
              {isFetching || plain.isFetching ? 'Searching…' : 'No recipes match.'}
            </Text>
          </View>
        ) : null}
        {typed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onAddWithoutRecipe(typed)}
            style={[styles.row, styles.free]}
          >
            <Text color={colors.accent} style={{ fontFamily: fonts.bodySemiBold }}>
              {`Add “${typed}” as a dish without a recipe`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {data?.excluded.length ? <Disclaimer /> : null}
    </View>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.touch,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
  },
  input: {
    flex: 1,
    minHeight: size.touch,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    gap: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: size.touch,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  out: { backgroundColor: colors.subtle },
  free: { borderBottomWidth: 0 },
})
