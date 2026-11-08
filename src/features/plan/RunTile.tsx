import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Text } from '@/components'
import type { RunSummary, WeekDay } from '@/lib/api/types'
import { shortDate } from '@/lib/dates'
import { hostedHref } from '@/lib/plan'
import { colors, fonts, radius, space } from '@/theme/tokens'

import { plural } from './model'
import { ProblemBadges, RunSlot } from './Slots'

/**
 * Shabbat / Yom Tov days as one tile: a column per holy day (clipped to the dates in view), each meal the same
 * height. Opens the hosted page. `stacked` puts the columns under each other (phones).
 */
export function RunTile({
  run,
  days,
  stacked,
}: {
  run: RunSummary
  days: WeekDay[]
  stacked?: boolean
}) {
  const router = useRouter()
  const dates = new Set(days.map((d) => d.date))
  const cols = run.holyDays.filter((h) => dates.has(h.date))
  const single = cols.length === 1
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${run.title}, ${plural(run.mealCount, 'meal', 'meals')}${run.toPlan ? `, ${run.toPlan} to plan` : ''}. Open`}
      onPress={() => router.push(hostedHref(run.key) as Href)}
      style={({ hovered }: { hovered?: boolean }) => [styles.tile, hovered && styles.hover]}
    >
      <View style={styles.head}>
        <Text numberOfLines={2} style={styles.title}>
          {run.title}
        </Text>
        {single ? <Text variant="small">{shortDate(cols[0].date)}</Text> : null}
      </View>
      <Text variant="small">
        {plural(run.mealCount, 'meal', 'meals')}
        {run.toPlan ? ` · ${run.toPlan} to plan` : ''}
      </Text>
      <View style={[styles.cols, stacked && styles.stacked]}>
        {cols.map((h) => (
          <View key={h.date} style={styles.col}>
            <Text style={styles.colh}>{h.label}</Text>
            {h.meals.map((m) => (
              <RunSlot key={m.id ?? `${m.date}-${m.slot}-${m.name}`} meal={m} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.foot}>
        <ProblemBadges allergies={run.problems.allergies} gaps={run.problems.gaps} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.infoSoft,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 10,
    gap: space.sm,
    minWidth: 0,
  },
  hover: { borderColor: colors.info },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.info, flexShrink: 1 },
  cols: { flexDirection: 'row', gap: space.sm },
  stacked: { flexDirection: 'column' },
  col: { flex: 1, gap: 6, minWidth: 0 },
  colh: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.info },
  foot: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
})
