import React from 'react'
import { StyleSheet, View } from 'react-native'

import { space } from '@/theme/tokens'

import { Text } from './Text'

export function SectionHeader({
  title,
  hint,
  right,
}: {
  title: string
  hint?: string
  right?: React.ReactNode
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        {hint ? <Text variant="small">{hint}</Text> : null}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    flexWrap: 'wrap',
  },
  text: { flexShrink: 1, gap: 2 },
})
