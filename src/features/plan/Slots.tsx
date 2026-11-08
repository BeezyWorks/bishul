import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Badge, Text } from '@/components'
import type { MealCard } from '@/lib/api/types'
import { hostedHref, summaryLine } from '@/lib/plan'
import { colors, fontSize, fonts, radius, space } from '@/theme/tokens'

import { plural } from './model'

/** Problem badges for a tile: "1 allergy", "1 gap". */
export function ProblemBadges({ allergies, gaps }: { allergies: number; gaps: number }) {
  if (!allergies && !gaps) return null
  return (
    <View style={styles.badges}>
      {allergies ? <Badge tone="danger" label={plural(allergies, 'allergy', 'allergies')} /> : null}
      {gaps ? <Badge tone="warn" label={plural(gaps, 'gap', 'gaps')} /> : null}
    </View>
  )
}

/** One line: the dishes, ellipsized; "Not planned" in muted italic when there are none. */
export function SummaryLine({ summary }: { summary: string[] }) {
  return summary.length ? (
    <Text numberOfLines={1} style={styles.value}>
      {summaryLine(summary)}
    </Text>
  ) : (
    <Text numberOfLines={1} color={colors.muted} style={[styles.value, { fontStyle: 'italic' }]}>
      Not planned
    </Text>
  )
}

const kicker = (...parts: (string | number | null | undefined | false)[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(' · ')

/** A hosted weekday meal: hosted colour, name and headcount; opens the hosted page. */
export function HostedSlot({ meal }: { meal: MealCard }) {
  const router = useRouter()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Hosting ${meal.name}, ${meal.headcountText || 'no guests yet'}`}
      onPress={() => router.push(hostedHref(meal.hostedKey) as Href)}
      style={[styles.slot, styles.hosted]}
    >
      <Text numberOfLines={1} style={[styles.k, { color: colors.info }]}>
        {kicker('Hosting', meal.slotLabel.toLowerCase(), meal.headcount.total || null)}
      </Text>
      <Text numberOfLines={1} style={[styles.value, { color: colors.info }]}>
        {meal.name}
      </Text>
      <ProblemBadges allergies={meal.problems.allergies} gaps={meal.problems.gaps} />
    </Pressable>
  )
}

/** An everyday meal (or the empty "+ Dinner"): tap to fill it in place. */
export function MealSlot({
  meal,
  label,
  onOpen,
}: {
  meal?: MealCard
  label: string
  onOpen: () => void
}) {
  if (!meal)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${label.toLowerCase()}`}
        onPress={onOpen}
        style={[styles.slot, styles.add]}
      >
        <Text color={colors.muted} align="center" style={{ fontSize: fontSize.sm }}>
          {`+ ${label}`}
        </Text>
      </Pressable>
    )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meal.name}: ${meal.summary.length ? summaryLine(meal.summary) : 'not planned'}. Edit`}
      onPress={onOpen}
      style={styles.slot}
    >
      <Text numberOfLines={1} style={styles.k}>
        {kicker(label, meal.timeText, meal.headcount.total || null)}
      </Text>
      <SummaryLine summary={meal.summary} />
    </Pressable>
  )
}

/** A meal inside a run tile: same height every time, one-line summary. */
export function RunSlot({ meal }: { meal: MealCard }) {
  return (
    <View style={[styles.slot, styles.runSlot]}>
      <Text numberOfLines={1} style={styles.k}>
        {kicker(meal.name, meal.headcount.total || null)}
      </Text>
      <SummaryLine summary={meal.summary} />
    </View>
  )
}

const styles = StyleSheet.create({
  slot: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    backgroundColor: colors.subtle,
    minWidth: 0,
    gap: 2,
  },
  runSlot: { height: 48, backgroundColor: colors.surface, justifyContent: 'center' },
  hosted: { backgroundColor: colors.infoSoft },
  add: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.tile - 4,
  },
  k: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  value: { fontFamily: fonts.body, fontSize: fontSize.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 2 },
})
