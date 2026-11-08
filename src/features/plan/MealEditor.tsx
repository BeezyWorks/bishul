import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button, RecipePicker, Text, TextField } from '@/components'
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
 * Fill a day's meal in place: type a dish or pick a recipe. The meal is created on the first dish, so opening the
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
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
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
      setText('')
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
  const busy = add.isPending || create.isPending

  return (
    <Sheet title={`${meal?.name ?? SLOT_LABEL[slot]} · ${longDate(date)}`} onClose={close}>
      {dishes.length ? (
        <View style={styles.list}>
          {dishes.map((d) => (
            <View key={d.itemId} style={styles.dish}>
              <Text style={{ flex: 1 }}>{d.title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${d.title}`}
                onPress={() =>
                  mealId && run(() => remove.mutateAsync({ mealId, itemId: d.itemId }))
                }
                style={styles.x}
              >
                <Text color={colors.muted}>{'×'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <TextField
        label="Type a dish"
        value={text}
        onChangeText={setText}
        placeholder="e.g. Pasta bake"
        returnKeyType="done"
        autoFocus
        onSubmitEditing={() => text.trim() && addDish({ description: text.trim() })}
      />
      <View style={styles.row}>
        <Button
          label="Add dish"
          disabled={!text.trim()}
          loading={busy && !picking}
          onPress={() => addDish({ description: text.trim() })}
        />
        {picking ? null : (
          <Button
            label="Pick a recipe"
            variant="soft"
            onPress={() =>
              run(async () => {
                await ensure()
                setPicking(true)
              })
            }
          />
        )}
      </View>
      {picking && mealId ? (
        <RecipePicker
          mealId={mealId}
          course="main"
          onPick={(hit) => addDish({ versionId: hit.versionId })}
          onAddWithoutRecipe={(t) => addDish({ description: t })}
          onClose={() => setPicking(false)}
          autoFocus
        />
      ) : null}
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button label="Done" variant="secondary" onPress={close} />
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
