import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'

import { colors, radius, space } from '@/theme/tokens'

interface Props extends ViewProps {
  tone?: 'default' | 'subtle' | 'accent' | 'danger' | 'warn' | 'info'
  padded?: boolean
  style?: StyleProp<ViewStyle>
}

const toneStyle = {
  default: { backgroundColor: colors.surface, borderColor: colors.line },
  subtle: { backgroundColor: colors.subtle, borderColor: colors.line },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  warn: { backgroundColor: colors.warnSoft, borderColor: colors.warn },
  info: { backgroundColor: colors.infoSoft, borderColor: colors.info },
}

export function Card({ tone = 'default', padded = true, style, ...rest }: Props) {
  return <View {...rest} style={[styles.card, toneStyle[tone], padded && styles.padded, style]} />
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  padded: { padding: space.lg, gap: space.md },
})
