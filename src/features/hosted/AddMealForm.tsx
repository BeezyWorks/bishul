import React, { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'

import { Button, Segmented, Text } from '@/components'
import { useCreatePlanMeal } from '@/lib/api/hooks'
import type { DaySlot, HostedHolyDay } from '@/lib/api/types'
import { PICKABLE_SLOTS, SLOT_LABEL, parseTime } from '@/lib/plan'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { dayBefore } from './dates'
import { ActionLink } from './MealParts'

const NIGHT: DaySlot[] = ['dinner', 'oneg']

/** "+ Another meal" at the end of a holy day (or of a single hosted meal's page). */
export function AddMealForm({ day }: { day: HostedHolyDay }) {
  const create = useCreatePlanMeal()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slot, setSlot] = useState<DaySlot>('lunch')
  const [time, setTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsed = parseTime(time, slot)
  const timeOk = parsed !== null
  const reset = () => {
    setOpen(false)
    setName('')
    setTime('')
    setSlot('lunch')
    setError(null)
  }
  const submit = async () => {
    if (!timeOk) return
    try {
      await create.mutateAsync({
        // An evening meal belongs to the holy day that starts the next morning.
        date: day.label && NIGHT.includes(slot) ? dayBefore(day.date) : day.date,
        name: name.trim() || undefined,
        slot,
        time: parsed || undefined,
        hosted: true,
      })
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the meal')
    }
  }

  if (!open) return <ActionLink label="+ Another meal" onPress={() => setOpen(true)} />
  return (
    <View style={styles.form}>
      <Text variant="bodyStrong">Another meal{day.label ? ` on ${day.label}` : ''}</Text>
      <View style={styles.field}>
        <Text variant="label">Name (optional)</Text>
        <TextInput
          accessibilityLabel="Name"
          value={name}
          onChangeText={setName}
          placeholder="Kiddush after shul"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text variant="label">Kind</Text>
        <Segmented
          options={PICKABLE_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))}
          value={slot}
          onChange={setSlot}
        />
        <Text variant="small">
          Sets where it sits in the day. An oneg comes after the evening meal.
        </Text>
      </View>
      <View style={styles.field}>
        <Text variant="label">Time (optional)</Text>
        <TextInput
          accessibilityLabel="Time, like 6:30pm or 1830"
          value={time}
          onChangeText={setTime}
          placeholder="6:30pm"
          placeholderTextColor={colors.muted}
          style={[styles.input, { width: 120 }, !timeOk && { borderColor: colors.danger }]}
        />
      </View>
      {error ? (
        <Text variant="small" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={reset} />
        <Button label="Add meal" onPress={submit} loading={create.isPending} disabled={!timeOk} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    maxWidth: 560,
  },
  field: { gap: space.xs },
  input: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
})
