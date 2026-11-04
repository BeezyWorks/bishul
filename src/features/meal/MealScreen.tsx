import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Loading, Pill, Screen, Text } from '@/components'
import { useMeal } from '@/lib/api/hooks'
import { longDate } from '@/lib/dates'
import { space } from '@/theme/tokens'

import { DishesStep } from './DishesStep'
import { ReviewStep } from './ReviewStep'
import { WhoStep } from './WhoStep'

const STEPS = ['Who’s coming', 'Dishes', 'Review'] as const

export function MealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading, error } = useMeal(id)
  const [step, setStep] = useState(0)

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
      actions={
        <Badge
          label={meal.status === 'accepted' ? 'Accepted' : 'Draft'}
          tone={meal.status === 'accepted' ? 'accent' : 'muted'}
        />
      }
    >
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

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  nav: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
})
