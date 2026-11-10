import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'

/** A switch between a few options (meat/dairy/parve, metric/cups). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dark,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  dark?: boolean
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View
        style={[
          styles.wrap,
          dark && { backgroundColor: colors.cookSurface, borderColor: colors.cookLine },
        ]}
      >
        {options.map((o) => {
          const on = o.value === value
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[
                styles.opt,
                on && { backgroundColor: dark ? colors.cookAccent : colors.accent },
              ]}
            >
              <Text
                style={{
                  fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium,
                  fontSize: fontSize.sm,
                  color: on
                    ? dark
                      ? colors.cookBg
                      : colors.onAccent
                    : dark
                      ? colors.cookInk
                      : colors.ink,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // Scrolls sideways when the options don't fit, rather than wrapping into a lumpy shape.
  scroll: { flexGrow: 0, alignSelf: 'flex-start', maxWidth: '100%' },
  wrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 3,
    flexShrink: 0,
  },
  opt: {
    minHeight: size.touch - 8,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
