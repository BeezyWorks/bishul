import React, { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Card, Loading, Text, useLayout } from '@/components'
import { useToday, usePlan } from '@/lib/api/hooks'
import type { ISODate, WeekDay } from '@/lib/api/types'
import { dayNum, longDate, monthGrid, monthName, toDate } from '@/lib/dates'
import { colors, fontSize, fonts, space } from '@/theme/tokens'

import { PlanHeader } from './PlanHeader'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbat']

/** The month grid with meals; clicking a day opens that week. */
export function MonthView({
  anchor,
  go,
}: {
  anchor?: ISODate
  go: (o: { week?: ISODate; view?: 'week' | 'month' }) => void
}) {
  const today = useToday()
  const base = anchor ?? today
  if (!base) return <Loading />
  return <Month base={base} today={today} go={go} />
}

function Month({
  base,
  today,
  go,
}: {
  base: ISODate
  today?: ISODate
  go: (o: { week?: ISODate; view?: 'week' | 'month' }) => void
}) {
  const { phone } = useLayout()
  const d = toDate(base)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const grid = useMemo(() => monthGrid(y, m), [y, m])
  const q = usePlan(grid[0], grid[grid.length - 1])
  const byDate = new Map((q.data?.days ?? []).map((x) => [x.date, x]))
  return (
    <View style={styles.page}>
      <PlanHeader view="month" title={`${monthName(m)} ${y}`} week={base} today={today} go={go} />
      {q.error ? (
        <Card tone="danger">
          <Text color={colors.danger}>{(q.error as Error).message}</Text>
        </Card>
      ) : null}
      <Card padded={false}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <View key={w} style={styles.weekCell}>
              <Text variant="label">{phone ? w.slice(0, 1) : w}</Text>
            </View>
          ))}
        </View>
        {Array.from({ length: 6 }, (_, r) => (
          <View key={r} style={styles.weekRow}>
            {grid.slice(r * 7, r * 7 + 7).map((date) => (
              <DayBox
                key={date}
                date={date}
                day={byDate.get(date)}
                inMonth={toDate(date).getUTCMonth() === m}
                today={date === today}
                phone={phone}
                onPress={() => go({ week: date })}
              />
            ))}
          </View>
        ))}
      </Card>
      {q.isLoading ? <Loading /> : null}
    </View>
  )
}

function DayBox({
  date,
  day,
  inMonth,
  today,
  phone,
  onPress,
}: {
  date: ISODate
  day?: WeekDay
  inMonth: boolean
  today: boolean
  phone: boolean
  onPress: () => void
}) {
  const holidays = (day?.holidays ?? []).slice(0, 2)
  const meals = day?.meals ?? []
  const label = day?.holyDay?.label
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${longDate(date)}${label ? `, ${label}` : ''}${meals.length ? `, ${meals.length} meals` : ''}. Open this week`}
      onPress={onPress}
      style={[
        styles.cell,
        phone ? styles.cellPhone : styles.cellWide,
        label ? { backgroundColor: colors.infoSoft } : null,
        today && { borderColor: colors.accent, borderWidth: 2 },
        !inMonth && { opacity: 0.45 },
      ]}
    >
      <View style={styles.cellTop}>
        <Text
          style={{
            fontFamily: fonts.bodySemiBold,
            fontSize: fontSize.md,
            color: today ? colors.accent : colors.ink,
          }}
        >
          {dayNum(date)}
        </Text>
        {phone ? null : <Text variant="small">{day?.hebrew}</Text>}
      </View>
      {phone ? (
        <View style={styles.dots}>
          {label ? <View style={[styles.dot, { backgroundColor: colors.info }]} /> : null}
          {meals.map((x) => (
            <View
              key={x.id ?? x.name}
              style={[
                styles.dot,
                x.hosted
                  ? { backgroundColor: colors.info }
                  : { borderWidth: 1, borderColor: colors.muted },
              ]}
            />
          ))}
        </View>
      ) : (
        <>
          {label ? (
            <Text numberOfLines={1} style={styles.holy}>
              {label}
            </Text>
          ) : null}
          {holidays.map((h) => (
            <Text
              key={h.name}
              variant="small"
              numberOfLines={1}
              color={h.kind === 'civil' ? colors.info : colors.warn}
              style={h.kind === 'civil' ? { fontStyle: 'italic' } : undefined}
            >
              {h.name}
            </Text>
          ))}
          {meals.map((x) => (
            <View key={x.id ?? x.name} style={[styles.mini, x.hosted && styles.miniHosted]}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.bodyMedium,
                  fontSize: 11,
                  color: x.hosted ? colors.info : colors.ink,
                }}
              >
                {x.summary.length ? x.summary.join(', ') : x.name}
              </Text>
            </View>
          ))}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  weekRow: { flexDirection: 'row' },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  cell: { flex: 1, borderWidth: 0.5, borderColor: colors.line, padding: 4, gap: 2, minWidth: 0 },
  cellWide: { minHeight: 104 },
  cellPhone: { minHeight: 56, alignItems: 'center' },
  cellTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 4,
  },
  holy: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.info },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mini: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: colors.subtle,
  },
  miniHosted: { backgroundColor: colors.infoSoft },
})
