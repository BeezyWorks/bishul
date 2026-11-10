import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Button, Text } from '@/components'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

export interface StepTimerValue {
  /** Minutes in half-minute steps; 0 means no timer. */
  min: number
  label: string
}

const MAX_MIN = 1440
const STEP = 0.5

/** Rounds to the nearest half minute and keeps it in range. */
export const snapMinutes = (n: number) =>
  Number.isFinite(n) ? Math.min(MAX_MIN, Math.max(0, Math.round(n / STEP) * STEP)) : 0

const show = (n: number) => String(n)

/**
 * A step's timer: an optional label and a minute stepper (− / typed value / +) in half-minute steps. Stepping
 * down from half a minute removes the timer.
 */
export function TimerEditor({
  value,
  onChange,
}: {
  value: StepTimerValue
  onChange: (v: StepTimerValue) => void
}) {
  const [typed, setTyped] = useState(show(value.min))
  useEffect(() => setTyped(show(value.min)), [value.min])

  const setMin = (min: number) => onChange({ ...value, min: snapMinutes(min) })
  const commit = () => {
    const n = snapMinutes(parseFloat(typed.replace(',', '.')))
    setTyped(show(n))
    setMin(n)
  }

  if (value.min <= 0) {
    return (
      <View style={styles.row}>
        <Button
          label="Add timer"
          icon="plus"
          variant="soft"
          small
          onPress={() => onChange({ ...value, min: 1 })}
        />
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text variant="label">Timer</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Half a minute less"
            onPress={() => setMin(value.min - STEP)}
            style={styles.stepBtn}
          >
            <Text style={styles.stepGlyph}>{'−'}</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Timer minutes"
            value={typed}
            onChangeText={(t) => setTyped(t.replace(/[^0-9.,]/g, ''))}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={styles.minutes}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Half a minute more"
            onPress={() => setMin(value.min + STEP)}
            style={styles.stepBtn}
          >
            <Text style={styles.stepGlyph}>+</Text>
          </Pressable>
        </View>
        <Text color={colors.muted}>min</Text>
        <Button
          label="Remove"
          variant="ghost"
          small
          onPress={() => onChange({ ...value, min: 0 })}
        />
      </View>
      <TextInput
        accessibilityLabel="Timer label (optional)"
        value={value.label}
        onChangeText={(label) => onChange({ ...value, label })}
        placeholder="Label (optional), e.g. Rest the dough"
        placeholderTextColor={colors.muted}
        maxLength={60}
        style={styles.label}
      />
    </View>
  )
}

const box = {
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: colors.surface,
  minHeight: size.touch,
} as const

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    ...box,
    width: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  stepGlyph: { fontSize: fontSize.xl, color: colors.accent },
  minutes: {
    ...box,
    width: 72,
    marginHorizontal: -1,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
    borderRadius: 0,
  },
  label: {
    ...box,
    borderRadius: radius.input,
    paddingHorizontal: space.lg,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
})
