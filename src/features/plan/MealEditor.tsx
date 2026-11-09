import { useRouter, type Href } from 'expo-router'
import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button, RecipePicker, Text } from '@/components'
import { Icon } from '@/components/Icon'
import {
  useAddMealDish,
  useCreatePlanMeal,
  useDeletePlanMeal,
  useHostedMeal,
  useRemoveMealDish,
} from '@/lib/api/hooks'
import type { DaySlot, Id, ISODate, MealCard } from '@/lib/api/types'
import { longDate } from '@/lib/dates'
import { SLOT_LABEL } from '@/lib/plan'
import { colors, radius, size, space } from '@/theme/tokens'

import { Sheet } from './Sheet'

/**
 * Fill a day's meal in place: add dishes from your recipes or by name. The meal is created on the first dish, so opening the
 * editor and closing it again leaves nothing behind.
 */
export function MealEditor({
  date,
  slot,
  meal,
  createdId,
  onClose,
}: {
  date: ISODate
  slot: DaySlot
  meal?: MealCard
  /** A meal made a moment ago by "Add another meal": removed again on close if it got no dish. */
  createdId?: Id
  onClose: () => void
}) {
  const router = useRouter()
  const [mine, setMine] = useState<Id | null>(createdId ?? null)
  const added = useRef(0)
  const mealId = meal?.id ?? mine ?? undefined
  const hm = useHostedMeal(mealId)
  const create = useCreatePlanMeal()
  const add = useAddMealDish()
  const remove = useRemoveMealDish()
  const del = useDeletePlanMeal()
  const [error, setError] = useState('')

  const ensure = async (): Promise<Id> => {
    if (mealId) return mealId
    const m = await create.mutateAsync({ date, slot })
    const id = m.id as Id
    setMine(id)
    return id
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const addDish = (dish: { versionId?: Id; description?: string }) =>
    run(async () => {
      const id = await ensure()
      await add.mutateAsync({ mealId: id, dish: { course: 'main', ...dish } })
      added.current += 1
    })
  const close = async () => {
    // Remove a meal we made here that stayed empty.
    if (mine && !meal?.id && added.current === 0) {
      const empty = !hm.data || hm.data.menu.every((c) => c.items.length === 0)
      if (empty) await del.mutateAsync(mine).catch(() => undefined)
    }
    onClose()
  }
  const dishes = hm.data?.menu.flatMap((c) => c.items) ?? []

  return (
    <Sheet title={`${meal?.name ?? SLOT_LABEL[slot]} · ${longDate(date)}`} onClose={close}>
      {dishes.length ? (
        <View style={styles.list}>
          {dishes.map((d) => (
            <View key={d.itemId} style={styles.dish}>
              {d.recipeId ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open recipe: ${d.title}`}
                  onPress={() => {
                    onClose()
                    router.push(`/recipes/${d.recipeId}` as Href)
                  }}
                  style={{ flex: 1, paddingVertical: space.sm }}
                >
                  <Text color={colors.accent} style={{ textDecorationLine: 'underline' }}>
                    {`${d.title} →`}
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ flex: 1 }}>{d.title}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${d.title}`}
                onPress={() =>
                  mealId && run(() => remove.mutateAsync({ mealId, itemId: d.itemId }))
                }
                style={styles.x}
              >
                <Icon name="trash" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <RecipePicker
        mealId={mealId}
        course="main"
        showListWhenEmpty={false}
        placeholder="Add dish: search recipes or type a name"
        onPick={(hit) => addDish({ versionId: hit.versionId })}
        onAddWithoutRecipe={(t) => addDish({ description: t })}
        autoFocus
      />
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        {meal?.id && !meal.hosted ? (
          <Button
            label="Remove meal"
            variant="danger"
            onPress={() =>
              run(async () => {
                await del.mutateAsync(meal.id as Id)
                onClose()
              })
            }
          />
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  dish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.subtle,
    borderRadius: radius.tile,
    paddingLeft: space.md,
  },
  x: { width: size.touch, height: size.touch - 8, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
})
