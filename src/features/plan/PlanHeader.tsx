import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Segmented, Text, useLayout } from '@/components'
import type { ISODate } from '@/lib/api/types'
import { addDays, dayNum, monthName, toDate } from '@/lib/dates'
import { space } from '@/theme/tokens'

/** `8 – 14 November`, with the year when it is not the current one. */
export function rangeLabel(from: ISODate, to: ISODate, today: ISODate): string {
  const a = toDate(from)
  const b = toDate(to)
  const year = b.getUTCFullYear() !== toDate(today).getUTCFullYear() ? ` ${b.getUTCFullYear()}` : ''
  if (a.getUTCMonth() === b.getUTCMonth())
    return `${dayNum(from)} – ${dayNum(to)} ${monthName(b.getUTCMonth())}${year}`
  return `${dayNum(from)} ${monthName(a.getUTCMonth()).slice(0, 3)} – ${dayNum(to)} ${monthName(b.getUTCMonth()).slice(0, 3)}${year}`
}

type Go = (o: { week?: ISODate; view?: 'week' | 'month' }) => void

/** Date range, parasha, previous / this week / next, and the Week | Month toggle. */
export function PlanHeader({
  view,
  title,
  sub,
  week,
  today,
  go,
}: {
  view: 'week' | 'month'
  title: string
  sub?: string
  /** First day of the week on screen, or any day of the month. */
  week?: ISODate
  today?: ISODate
  go: Go
}) {
  const { phone } = useLayout()
  const unit = view === 'week' ? 'week' : 'month'
  const shift = (n: number) => {
    if (!week) return
    if (view === 'week') return go({ week: addDays(week, 7 * n) })
    const d = toDate(week)
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))
    go({ week: t.toISOString().slice(0, 10), view: 'month' })
  }
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant={phone ? 'h2' : 'h1'} accessibilityRole="header">
          {title}
        </Text>
        {sub ? <Text variant="small">{sub}</Text> : null}
      </View>
      <View style={styles.controls}>
        <Button
          label="‹"
          variant="secondary"
          small
          accessibilityLabel={`Previous ${unit}`}
          onPress={() => shift(-1)}
        />
        <Button
          label={view === 'week' ? 'This week' : 'This month'}
          variant="secondary"
          small
          onPress={() => go(view === 'month' ? { view: 'month' } : {})}
        />
        <Button
          label="›"
          variant="secondary"
          small
          accessibilityLabel={`Next ${unit}`}
          onPress={() => shift(1)}
        />
        <Segmented
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={view}
          onChange={(v) => go({ week: week ?? today, view: v })}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  text: { flexShrink: 1, gap: 2, marginRight: 'auto' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
})
