import React from 'react'
import { StyleSheet, View } from 'react-native'

import { DISCLAIMER, KIND_LABEL } from '@/lib/strings'
import type { Kind } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

import { Badge } from './Pill'
import { Text } from './Text'

/** Meat / dairy / parve as a text label (never colour alone). */
export function KindLabel({ kind }: { kind: Kind | null }) {
  if (!kind) return null
  return <Badge label={KIND_LABEL[kind]} tone="neutral" />
}

/** "It's on the host." Shown under any allergy result. */
export function Disclaimer() {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text variant="small" color={colors.info}>
        {DISCLAIMER}
      </Text>
    </View>
  )
}

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <Text color={colors.muted}>{label}</Text>
    </View>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.state}>
      <Text color={colors.muted}>{children}</Text>
    </View>
  )
}

export function Row({
  children,
  gap = space.sm,
  wrap = true,
}: {
  children: React.ReactNode
  gap?: number
  wrap?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap,
        alignItems: 'center',
      }}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.infoSoft, borderRadius: 10, padding: space.md },
  state: { paddingVertical: space.xl, alignItems: 'center' },
})
