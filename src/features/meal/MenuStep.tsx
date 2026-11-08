import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, RecipePicker, Text } from '@/components'
import { useAddMealDish, useRemoveMealDish } from '@/lib/api/hooks'
import type { HostedMeal } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

/** Step 2: this meal's menu by course. Recipes are filtered by the guests' constraints (code, no AI). */
export function MenuStep({
  meal,
  onBack,
  onNext,
}: {
  meal: HostedMeal
  onBack: () => void
  onNext: () => void
}) {
  const mealId = meal.id!
  const add = useAddMealDish()
  const remove = useRemoveMealDish()
  const [open, setOpen] = useState<string | null>(null)
  const error = add.error ?? remove.error

  return (
    <View style={styles.wrap}>
      {meal.menu.map((c) => (
        <Card key={c.course}>
          <Text variant="h3">{c.label}</Text>
          {c.items.length === 0 && open !== c.course ? (
            <Text color={colors.muted}>Nothing yet</Text>
          ) : null}
          {c.items.map((it) => (
            <View key={it.itemId} style={styles.dish}>
              <Text style={styles.grow} color={it.problems.length ? colors.danger : undefined}>
                {it.title}
                {it.broughtBy ? ` (brought by ${it.broughtBy})` : ''}
              </Text>
              <Button
                label="Remove"
                variant="ghost"
                small
                accessibilityLabel={`Remove ${it.title}`}
                disabled={remove.isPending}
                onPress={() => remove.mutate({ mealId, itemId: it.itemId })}
              />
            </View>
          ))}
          {open === c.course ? (
            <RecipePicker
              mealId={mealId}
              course={c.course}
              onClose={() => setOpen(null)}
              onPick={async (hit) => {
                await add.mutateAsync({
                  mealId,
                  dish: { course: c.course, versionId: hit.versionId },
                })
                setOpen(null)
              }}
              onAddWithoutRecipe={async (text) => {
                await add.mutateAsync({ mealId, dish: { course: c.course, description: text } })
                setOpen(null)
              }}
            />
          ) : (
            <View style={styles.row}>
              <Button label="+ Add" variant="soft" small onPress={() => setOpen(c.course)} />
            </View>
          )}
        </Card>
      ))}
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(error as Error).message}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Button label="Back" variant="secondary" onPress={onBack} />
        <Button label="Next: check" onPress={onNext} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  dish: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  row: { flexDirection: 'row' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
})
