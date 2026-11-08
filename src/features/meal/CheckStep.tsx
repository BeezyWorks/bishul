import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Card, Button, Disclaimer, RecipePicker, Text } from '@/components'
import { useAddMealDish, useRemoveMealDish } from '@/lib/api/hooks'
import type { HostedMeal, MealProblem } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

/** Step 3: the problems check. Fixes are code-filtered recipe searches; finishing lands on the hosted page. */
export function CheckStep({
  meal,
  onBack,
  onFinish,
}: {
  meal: HostedMeal
  onBack: () => void
  onFinish: () => void
}) {
  const mealId = meal.id!
  const add = useAddMealDish()
  const remove = useRemoveMealDish()
  const [picking, setPicking] = useState<number | null>(null)
  const { problems, aiNotes, unchecked } = meal.problemDetails
  const hasAllergy = problems.some((p) => p.kind === 'allergy') || aiNotes.length > 0

  const fix = (p: MealProblem, i: number) => (
    <View key={`${p.text}${i}`} style={styles.problem}>
      <View style={styles.line}>
        <Text style={styles.grow} color={p.severity === 'error' ? colors.danger : colors.warn}>
          {p.text}
        </Text>
        {p.kind === 'gap' ? (
          <Button label="Find a main" small variant="soft" onPress={() => setPicking(i)} />
        ) : p.itemIds.length ? (
          <Button
            label="Replace dish"
            small
            variant="soft"
            disabled={remove.isPending}
            onPress={async () => {
              await Promise.all(p.itemIds.map((itemId) => remove.mutateAsync({ mealId, itemId })))
              setPicking(i)
            }}
          />
        ) : null}
      </View>
      {picking === i ? (
        <RecipePicker
          mealId={mealId}
          course={p.course ?? 'main'}
          onClose={() => setPicking(null)}
          onPick={async (hit) => {
            await add.mutateAsync({
              mealId,
              dish: { course: p.course ?? 'main', versionId: hit.versionId },
            })
            setPicking(null)
          }}
          onAddWithoutRecipe={async (text) => {
            await add.mutateAsync({
              mealId,
              dish: { course: p.course ?? 'main', description: text },
            })
            setPicking(null)
          }}
        />
      ) : null}
    </View>
  )

  return (
    <View style={styles.wrap}>
      {problems.length ? (
        <Card tone="danger">
          <Text variant="h3" color={colors.danger}>
            {problems.length === 1 ? '1 thing to fix' : `${problems.length} things to fix`}
          </Text>
          {problems.map(fix)}
        </Card>
      ) : (
        <Card tone="accent">
          <Text variant="h3" color={colors.accent}>
            Every dish works for everyone coming.
          </Text>
        </Card>
      )}
      {aiNotes.length ? (
        <Card tone="warn">
          <Text variant="h3" color={colors.warn}>
            Check the label
          </Text>
          {aiNotes.map((n) => (
            <Text key={n.dishId} color={colors.warn}>
              {n.text}
            </Text>
          ))}
        </Card>
      ) : null}
      {unchecked.length ? (
        <Card>
          <Text variant="h3">Not checked</Text>
          {unchecked.map((u) => (
            <Text key={u.dishId}>{`${u.title}, brought by ${u.by}`}</Text>
          ))}
        </Card>
      ) : null}
      {hasAllergy ? <Disclaimer /> : null}
      <View style={styles.footer}>
        <Button label="Back" variant="secondary" onPress={onBack} />
        <Button label="Done: open the hosted page" onPress={onFinish} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  problem: { gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 200 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
})
