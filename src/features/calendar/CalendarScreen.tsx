import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
  AddMeal,
  Button,
  Card,
  KindLabel,
  Loading,
  Screen,
  Text,
  useLayout,
} from '@/components'
import { MealChipView } from '@/components/MealChipView'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useCalendar, useToday } from '@/lib/api/hooks'
import type { CalendarDay } from '@/lib/api/types'
import { dayNum, longDate, monthGrid, monthName, rangeDays, toDate, weekday } from '@/lib/dates'
import { colors, fontSize, fonts, radius, space } from '@/theme/tokens'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbat']

export function CalendarScreen() {
  const today = useToday()
  if (!today)
    return (
      <Screen title="Calendar">
        <Loading />
      </Screen>
    )
  return <CalendarView today={today} />
}

function CalendarView({ today }: { today: string }) {
  const { wide, phone } = useLayout()
  const [ym, setYm] = useState(() => {
    const d = toDate(today)
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
  })
  const [sel, setSel] = useState<{ start: string; end?: string }>({ start: today })
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym])
  const cal = useCalendar(grid[0], grid[grid.length - 1])
  const byDate = useMemo(() => new Map((cal.data ?? []).map((d) => [d.date, d])), [cal.data])

  const from = sel.end && sel.end < sel.start ? sel.end : sel.start
  const to = sel.end && sel.end > sel.start ? sel.end : sel.start
  const rangeQ = useCalendar(from, to)

  const pick = (d: string) =>
    setSel((s) => (!s.start || s.end ? { start: d } : { start: s.start, end: d }))
  const inRange = (d: string) => d >= from && d <= to
  const step = (n: number) =>
    setYm(({ y, m }) => {
      const t = new Date(Date.UTC(y, m + n, 1))
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() }
    })

  return (
    <Screen
      title="Calendar"
      subtitle="Click a start day, then an end day. Hebrew dates, parshiyot and holidays included."
    >
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.gridCol, wide && { flex: 3 }]}>
          <View style={styles.monthBar}>
            <Button label="Previous" variant="secondary" small onPress={() => step(-1)} />
            <Text variant="h2" accessibilityRole="header">
              {monthName(ym.m)} {ym.y}
            </Text>
            <Button label="Next" variant="secondary" small onPress={() => step(1)} />
          </View>
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
                {grid.slice(r * 7, r * 7 + 7).map((d) => (
                  <DayCell
                    key={d}
                    date={d}
                    day={byDate.get(d)}
                    inMonth={toDate(d).getUTCMonth() === ym.m}
                    selected={inRange(d)}
                    today={d === today}
                    edge={d === from || d === to}
                    phone={phone}
                    onPress={() => pick(d)}
                  />
                ))}
              </View>
            ))}
          </Card>
          <View style={styles.legend}>
            <View
              style={[
                styles.swatch,
                { borderColor: colors.accent, backgroundColor: colors.accentSoft },
              ]}
            />
            <Text variant="small">Accepted</Text>
            <View style={[styles.swatch, { borderColor: colors.muted, borderStyle: 'dashed' }]} />
            <Text variant="small">Draft</Text>
            <View style={[styles.dot, { backgroundColor: colors.warn }]} />
            <Text variant="small">Jewish holiday</Text>
            <View style={[styles.dot, { backgroundColor: colors.info }]} />
            <Text variant="small">Civil holiday</Text>
          </View>
        </View>

        <View style={[styles.panel, wide && { flex: 2 }]}>
          <RangePanel days={rangeQ.data} loading={rangeQ.isLoading} from={from} to={to} />
        </View>
      </View>
    </Screen>
  )
}

function DayCell({
  date,
  day,
  inMonth,
  selected,
  edge,
  today,
  phone,
  onPress,
}: {
  date: string
  day?: CalendarDay
  inMonth: boolean
  selected: boolean
  edge: boolean
  today: boolean
  phone: boolean
  onPress: () => void
}) {
  const shabbat = weekday(date) === 6
  const hol = day?.holidays ?? []
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${longDate(date)}${day?.hebrew ? `, ${day.hebrew}` : ''}${hol.length ? `, ${hol.map((h) => h.name).join(', ')}` : ''}${day?.meals.length ? `, ${day.meals.length} meals` : ''}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.cell,
        phone ? styles.cellPhone : styles.cellWide,
        shabbat && { backgroundColor: colors.subtle },
        selected && { backgroundColor: colors.accentSoft },
        edge && { borderColor: colors.accent, borderWidth: 2 },
        !inMonth && { opacity: 0.45 },
      ]}
    >
      <View style={styles.cellTop}>
        <Text
          style={{
            fontFamily: fonts.bodySemiBold,
            fontSize: fontSize.md,
            color: today ? colors.accent : colors.ink,
            textDecorationLine: today ? 'underline' : 'none',
          }}
        >
          {dayNum(date)}
        </Text>
        {phone ? null : <Text variant="small">{day?.hebrew}</Text>}
      </View>
      {day?.parasha && !phone ? (
        <Text variant="small" color={colors.accent} numberOfLines={1}>
          {day.parasha}
        </Text>
      ) : null}
      {phone ? (
        <View style={styles.dots}>
          {hol.map((h) => (
            <View
              key={h.name}
              style={[
                styles.dot,
                { backgroundColor: h.type === 'civil' ? colors.info : colors.warn },
              ]}
            />
          ))}
          {day?.meals.map((m) => (
            <View
              key={m.id}
              style={[
                styles.dot,
                m.status === 'accepted'
                  ? { backgroundColor: colors.accent }
                  : { borderWidth: 1, borderColor: colors.muted },
              ]}
            />
          ))}
        </View>
      ) : (
        <>
          {hol.slice(0, 2).map((h) => (
            <Text
              key={h.name}
              variant="small"
              color={h.type === 'civil' ? colors.info : colors.warn}
              style={h.type === 'civil' ? { fontStyle: 'italic' } : undefined}
              numberOfLines={1}
            >
              {h.type === 'civil' ? `${h.name} (civil)` : h.name}
            </Text>
          ))}
          {day?.cooking.length ? (
            <Text variant="small" color={colors.muted} numberOfLines={1}>
              {day.cooking.length} cooking task{day.cooking.length === 1 ? '' : 's'}
            </Text>
          ) : null}
          {day?.meals.map((m) => (
            <View
              key={m.id}
              style={[styles.mini, m.status === 'accepted' ? styles.miniSolid : styles.miniDashed]}
            >
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11 }} numberOfLines={1}>
                {m.name}
              </Text>
            </View>
          ))}
        </>
      )}
    </Pressable>
  )
}

function RangePanel({
  days,
  loading,
  from,
  to,
}: {
  days?: CalendarDay[]
  loading: boolean
  from: string
  to: string
}) {
  const accept = useApiMutation((ids: string[]) => api.acceptMeals(ids), stale.accept)
  const reopen = useApiMutation((ids: string[]) => api.reopenMeals(ids), stale.accept)
  const blocked = accept.data?.blocked ?? []
  const drafts = (days ?? []).flatMap((d) => d.meals).filter((m) => m.status === 'draft')
  const n = rangeDays(from, to).length
  return (
    <View style={styles.panelInner}>
      <Text variant="h2" accessibilityRole="header">
        {from === to ? longDate(from) : `${longDate(from)} to ${longDate(to)}`}
      </Text>
      <Text variant="small">
        {n} day{n === 1 ? '' : 's'} selected
      </Text>
      {loading || !days ? (
        <Loading />
      ) : (
        days.map((d) => (
          <Card key={d.date}>
            <View>
              <Text variant="h3">{longDate(d.date)}</Text>
              <Text variant="small">
                {[
                  d.hebrew,
                  d.parasha ? `Parashat ${d.parasha}` : '',
                  ...d.holidays.filter((h) => h.type !== 'civil').map((h) => h.name),
                  d.candleLighting ? `candle lighting ${d.candleLighting}` : '',
                  d.havdalah ? `ends ${d.havdalah}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {d.holidays.some((h) => h.type === 'civil') ? (
              <Text variant="small" color={colors.info} style={{ fontStyle: 'italic' }}>
                {d.holidays
                  .filter((h) => h.type === 'civil')
                  .map((h) => `${h.name} (civil holiday)`)
                  .join(' · ')}
              </Text>
            ) : null}
            {d.meals.length === 0 ? <Text color={colors.muted}>No meals yet.</Text> : null}
            {d.meals.map((m) => (
              <View key={m.id} style={styles.mealRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <MealChipView meal={m} />
                </View>
                <KindLabel kind={m.kind} />
                {m.status === 'draft' ? (
                  <Button
                    label="Accept"
                    small
                    variant="soft"
                    onPress={() => accept.mutate([m.id])}
                  />
                ) : (
                  <Button
                    label="Reopen"
                    small
                    variant="ghost"
                    accessibilityLabel={`Reopen ${m.name}`}
                    onPress={() => reopen.mutate([m.id])}
                  />
                )}
              </View>
            ))}
            {d.cooking.length ? (
              <View style={styles.cooking}>
                <Text variant="label">Cooking this day</Text>
                {d.cooking.map((c, i) => (
                  <Text key={i} variant="small" color={colors.ink}>
                    {c.text}
                  </Text>
                ))}
              </View>
            ) : null}
            <AddMeal date={d.date} compact />
          </Card>
        ))
      )}
      {blocked.map((b) => (
        <Card key={b.id} tone="danger">
          <Text variant="h3" color={colors.danger}>
            {b.name} was not accepted
          </Text>
          {b.problems.map((p) => (
            <Text key={p} color={colors.danger}>
              {p}
            </Text>
          ))}
        </Card>
      ))}
      {accept.error ? <Text color={colors.danger}>{(accept.error as Error).message}</Text> : null}
      <Button
        label={
          drafts.length
            ? `Accept ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`
            : 'No drafts to accept'
        }
        disabled={!drafts.length}
        loading={accept.isPending}
        onPress={() => accept.mutate(drafts.map((m) => m.id))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  layout: { gap: space.xl },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  gridCol: { gap: space.md },
  panel: { gap: space.md },
  panelInner: { gap: space.md },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  weekRow: { flexDirection: 'row' },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  cell: { flex: 1, borderWidth: 0.5, borderColor: colors.line, padding: 4, gap: 2 },
  cellWide: { minHeight: 104 },
  cellPhone: { minHeight: 56, alignItems: 'center' },
  cellTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 4,
  },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mini: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  miniSolid: { borderColor: colors.accent, backgroundColor: colors.surface },
  miniDashed: { borderColor: colors.muted, borderStyle: 'dashed', backgroundColor: colors.surface },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  swatch: { width: 18, height: 12, borderRadius: 4, borderWidth: 1.5 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  cooking: { backgroundColor: colors.subtle, borderRadius: radius.tile, padding: space.md, gap: 4 },
})
