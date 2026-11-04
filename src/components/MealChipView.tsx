import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import type { MealChip } from '@/lib/api/types'
import { KIND_LABEL } from '@/lib/strings'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'

/** A meal on a day. Solid border = accepted, dashed = draft. Status and kind are also text. */
export function MealChipView({ meal, compact }: { meal: MealChip; compact?: boolean }) {
  const router = useRouter()
  const accepted = meal.status === 'accepted'
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${meal.name}, ${meal.status}${meal.kind ? `, ${KIND_LABEL[meal.kind]}` : ''}`}
      onPress={() => router.push(`/meal/${meal.id}` as Href)}
      style={[styles.chip, accepted ? styles.solid : styles.dashed, compact && styles.compact]}
    >
      <Text
        style={{
          fontFamily: fonts.bodySemiBold,
          fontSize: compact ? fontSize.xs : fontSize.sm,
          color: accepted ? colors.accent : colors.ink,
        }}
        numberOfLines={1}
      >
        {meal.name}
      </Text>
      {compact ? null : (
        <View>
          <Text variant="small">
            {meal.kind ? `${KIND_LABEL[meal.kind]} · ` : ''}
            {accepted ? 'Accepted' : 'Draft'} {'·'} {meal.itemCount} dish
            {meal.itemCount === 1 ? '' : 'es'}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  compact: { minHeight: 0, paddingVertical: 2, paddingHorizontal: space.sm, borderRadius: 8 },
  solid: { borderColor: colors.accent, backgroundColor: colors.accentSoft, borderStyle: 'solid' },
  dashed: { borderColor: colors.muted, backgroundColor: colors.surface, borderStyle: 'dashed' },
})
