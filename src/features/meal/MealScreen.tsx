import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Loading, Pill, Screen, Text } from '@/components'
import { api } from '@/lib/api/client'
import { useHostedMeal } from '@/lib/api/hooks'
import { hostedHref, planHref } from '@/lib/plan'
import { space } from '@/theme/tokens'

import { CheckStep } from './CheckStep'
import { GuestsStep } from './GuestsStep'
import { MenuStep } from './MenuStep'

const STEPS = [
  { key: 'guests', label: 'Who’s coming' },
  { key: 'menu', label: 'Menu' },
  { key: 'check', label: 'Check' },
] as const
type StepKey = (typeof STEPS)[number]['key']

const asStep = (s: string | undefined): StepKey | null =>
  STEPS.some((x) => x.key === s) ? (s as StepKey) : null

/** The wizard plans ONE meal: who's coming, its menu, then the check. Finishing lands on the hosted page. */
export function MealScreen() {
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step?: string }>()
  const router = useRouter()
  const meal = useHostedMeal(id)
  const runKey = meal.data?.runKey ?? null
  const run = useQuery({
    queryKey: ['hosted', runKey],
    queryFn: () => api.getHosted(runKey!),
    enabled: !!runKey,
  })
  const [step, setStep] = useState<StepKey>(asStep(stepParam) ?? 'guests')
  // A meal that already has dishes goes to its page, unless a step was asked for. Decided once, on first load.
  const redirected = useRef(false)

  if (meal.error)
    return (
      <Screen title="Meal not found" back={{ label: 'Back to week', href: planHref() }}>
        <Text>We could not find that meal.</Text>
      </Screen>
    )
  if (meal.isLoading || !meal.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )

  const m = meal.data
  if (!redirected.current) {
    redirected.current = true
    if (m.planned && !asStep(stepParam)) {
      router.replace(hostedHref(m.hostedKey) as Href)
      return (
        <Screen>
          <Loading />
        </Screen>
      )
    }
  }

  const holyDay = run.data?.days.find((d) => d.date === m.holyDate)?.label
  const crumb = m.runKey && run.data ? [run.data.title, holyDay].filter(Boolean).join(' › ') : ''
  const index = STEPS.findIndex((s) => s.key === step)
  const finish = () => router.replace(hostedHref(m.hostedKey) as Href)

  return (
    <Screen
      back={{ label: 'Back to week', href: planHref() }}
      eyebrow={crumb || undefined}
      title={`Plan ${m.name}`}
    >
      <View style={styles.steps} accessibilityRole="tablist">
        {STEPS.map((s, i) => (
          <Pill
            key={s.key}
            label={`${i + 1} · ${s.label}`}
            selected={s.key === step}
            onPress={() => setStep(s.key)}
          />
        ))}
      </View>
      {step === 'guests' ? (
        <GuestsStep meal={m} onNext={() => setStep('menu')} />
      ) : step === 'menu' ? (
        <MenuStep
          meal={m}
          onBack={() => setStep(STEPS[index - 1].key)}
          onNext={() => setStep('check')}
        />
      ) : (
        <CheckStep meal={m} onBack={() => setStep('menu')} onFinish={finish} />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
