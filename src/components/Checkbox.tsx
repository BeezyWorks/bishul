import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, size, space } from '@/theme/tokens'

import { Text } from './Text'

export function Checkbox({
  checked,
  onChange,
  label,
  dark,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name; also rendered when `showLabel`. */
  label: string
  dark?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.hit}
    >
      <View
        style={[
          styles.box,
          dark && { borderColor: colors.cookMuted },
          checked && {
            backgroundColor: dark ? colors.cookAccent : colors.accent,
            borderColor: dark ? colors.cookAccent : colors.accent,
          },
        ]}
      >
        {checked ? (
          <Text
            style={{ color: dark ? colors.cookBg : colors.onAccent, fontSize: 14, lineHeight: 16 }}
          >
            {'✓'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hit: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.sm,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
