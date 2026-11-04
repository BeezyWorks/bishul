import React from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { colors, fontSize, fonts, radius, size, space, tones, type Tone } from '@/theme/tokens'

import { Text } from './Text'

/** A selectable chip (filters, collections, course choices). Touch target is at least 44px tall. */
export function Pill({
  label,
  selected,
  onPress,
  dashed,
  style,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
  dashed?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.pill, selected && styles.selected, dashed && styles.dashed, style]}
    >
      <Text
        style={{
          fontFamily: selected ? fonts.bodySemiBold : fonts.bodyMedium,
          fontSize: fontSize.sm,
          color: selected ? colors.onAccent : colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** A small read-only label: status, reasons, kinds. Always carries text. */
export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string
  tone?: Tone
  style?: StyleProp<ViewStyle>
}) {
  const t = tones[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: fontSize.xs, color: t.fg }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dashed: { borderStyle: 'dashed' },
  badge: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
})
