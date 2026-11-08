import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Card, Loading, Text, useLayout } from '@/components'
import { useWeek } from '@/lib/api/hooks'
import type { ISODate, PlanView, WeekDay } from '@/lib/api/types'
import { dayNum, weekdayName } from '@/lib/dates'
import { colors, fonts, radius, space } from '@/theme/tokens'

import { DayCell } from './DayCell'
import { buildSegments } from './model'
import { PlanHeader, rangeLabel } from './PlanHeader'
import { RunTile } from './RunTile'
import { UpNext } from './UpNext'

export function WeekView({
  week,
  go,
}: {
  week?: ISODate
  go: (o: { week?: ISODate; view?: 'week' | 'month' }) => void
}) {
  const { wide } = useLayout()
  const q = useWeek(week)
  const view = q.data
  return (
    <View style={styles.page}>
      <PlanHeader
        view="week"
        title={view ? rangeLabel(view.from, view.to, view.today) : ''}
        sub={view?.parasha ? `Parashat ${view.parasha}` : undefined}
        week={view?.from}
        today={view?.today}
        go={go}
      />
      {q.error ? (
        <Card tone="danger">
          <Text color={colors.danger}>{(q.error as Error).message}</Text>
        </Card>
      ) : !view ? (
        <Loading />
      ) : (
        <>
          {wide ? <Strip view={view} /> : <PhoneWeek view={view} />}
          <UpNext today={view.today} />
        </>
      )}
    </View>
  )
}

/** Desktop: one row, a cell per day, one tile for each run of holy days. */
function Strip({ view }: { view: PlanView }) {
  const segs = useMemo(() => buildSegments(view.days, view.runs), [view])
  return (
    <View style={styles.strip}>
      {segs.map((s) =>
        s.kind === 'day' ? (
          <DayCell key={s.day.date} day={s.day} today={view.today} />
        ) : (
          <View
            key={s.run.key + s.days[0].date}
            style={{ flex: s.days.length === 1 ? 1.4 : s.days.length }}
          >
            <RunTile run={s.run} days={s.days} />
          </View>
        ),
      )}
    </View>
  )
}

/** Phone: a row of day chips; the chosen day's cell (or its run tile) below. */
function PhoneWeek({ view }: { view: PlanView }) {
  const [picked, setPicked] = useState<ISODate | null>(null)
  const sel: WeekDay =
    view.days.find((d) => d.date === picked) ?? view.days.find((d) => d.isToday) ?? view.days[0]
  const segs = useMemo(() => buildSegments(view.days, view.runs), [view])
  const seg = segs.find((s) =>
    s.kind === 'day' ? s.day.date === sel.date : s.days.some((d) => d.date === sel.date),
  )
  return (
    <View style={styles.phone}>
      <View style={styles.chips}>
        {view.days.map((d) => {
          const on = d.date === sel.date
          const holy = !!d.holyDay
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${weekdayName(d.date)} ${dayNum(d.date)}${d.isToday ? ', today' : ''}`}
              onPress={() => setPicked(d.date)}
              style={[
                styles.chip,
                holy && { backgroundColor: colors.infoSoft },
                d.isToday && !on && { borderColor: colors.accent },
                on && {
                  backgroundColor: holy ? colors.info : colors.accent,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: on ? colors.onAccent : holy ? colors.info : colors.muted,
                }}
              >
                {weekdayName(d.date, true)}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 15,
                  color: on ? colors.onAccent : holy ? colors.info : colors.ink,
                }}
              >
                {dayNum(d.date)}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {seg?.kind === 'run' ? (
        <RunTile run={seg.run} days={seg.days} stacked />
      ) : seg ? (
        <DayCell day={seg.day} today={view.today} grow={false} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { gap: space.xl },
  strip: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  phone: { gap: space.md },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.tile - 2,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.subtle,
  },
})
