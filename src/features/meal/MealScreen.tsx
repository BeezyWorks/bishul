import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Card, Loading, Pill, Screen, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useMeal } from '@/lib/api/hooks'
import type { Meal } from '@/lib/api/types'
import { longDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

import { DishesStep } from './DishesStep'
import { ReviewStep } from './ReviewStep'
import { WhoStep } from './WhoStep'

const STEPS = ['Who’s coming', 'Dishes', 'Review'] as const

export function MealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading, error } = useMeal(id)
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(false)

  if (error)
    return (
      <Screen title="Meal not found" back={{ label: 'Plan', href: '/' }}>
        <Text>We could not find that meal.</Text>
      </Screen>
    )
  if (isLoading || !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )

  const { meal } = data
  return (
    <Screen
      back={{ label: 'Plan', href: '/' }}
      eyebrow={[longDate(meal.date), data.occasionLabel].filter(Boolean).join(' · ')}
      title={meal.name}
      subtitle={meal.time ? `At ${meal.time}` : undefined}
      actions={
        <View style={styles.actions}>
          <Button
            label="Edit name and time"
            variant="secondary"
            small
            onPress={() => setEditing(true)}
          />
          <Badge
            label={meal.status === 'accepted' ? 'Accepted' : 'Draft'}
            tone={meal.status === 'accepted' ? 'accent' : 'muted'}
          />
        </View>
      }
    >
      {editing ? <EditMeal meal={meal} onDone={() => setEditing(false)} /> : null}
      <View style={styles.steps} accessibilityRole="tablist">
        {STEPS.map((s, i) => (
          <Pill key={s} label={`${i + 1}. ${s}`} selected={i === step} onPress={() => setStep(i)} />
        ))}
      </View>
      {step === 0 ? <WhoStep detail={data} /> : null}
      {step === 1 ? <DishesStep detail={data} /> : null}
      {step === 2 ? <ReviewStep detail={data} /> : null}
      <View style={styles.nav}>
        {step > 0 ? (
          <Button label="Back" variant="secondary" onPress={() => setStep(step - 1)} />
        ) : (
          <View />
        )}
        {step < 2 ? (
          <Button label={`Next: ${STEPS[step + 1]}`} onPress={() => setStep(step + 1)} />
        ) : null}
      </View>
    </Screen>
  )
}

function EditMeal({ meal, onDone }: { meal: Meal; onDone: () => void }) {
  const [name, setName] = useState(meal.name)
  const [time, setTime] = useState(meal.time)
  const save = useApiMutation(
    (c: { name: string; time: string }) => api.updateMealDetails(meal.id, c),
    stale.accept,
  )
  const submit = async () => {
    if (!name.trim()) return
    await save.mutateAsync({ name, time })
    onDone()
  }
  return (
    <Card>
      <View style={styles.editRow}>
        <TextField label="Meal name" value={name} onChangeText={setName} onSubmitEditing={submit} />
        <View style={styles.timeField}>
          <TextField
            label="Time (24-hour)"
            value={time}
            onChangeText={setTime}
            placeholder="18:30"
            onSubmitEditing={submit}
          />
        </View>
        <Button label="Save" disabled={!name.trim()} loading={save.isPending} onPress={submit} />
        <Button label="Cancel" variant="ghost" onPress={onDone} />
      </View>
      {save.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(save.error as Error).message}
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.sm },
  timeField: { width: 130, flexGrow: 0 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  nav: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
})
