import React from 'react'
import { StyleSheet, View } from 'react-native'

import { AddMeal, Badge, Button, Card, Loading, Screen, Text } from '@/components'
import { MealChipView } from '@/components/MealChipView'
import { useCalendar, useToday, useUpcoming } from '@/lib/api/hooks'
import type { CalendarDay } from '@/lib/api/types'
import { addDays, shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

export function PlanScreen() {
  const { data, isLoading, error } = useUpcoming()
  const today = useToday()
  const week = useCalendar(today ?? '', today ? addDays(today, 6) : '', !!today)
  return (
    <Screen
      title="What are you planning?"
      subtitle="Pick what is coming up. Meals are added to a day only when you need them."
    >
      {error ? (
        <Card tone="danger">
          <Text color={colors.danger}>{(error as Error).message}</Text>
        </Card>
      ) : isLoading || !data ? (
        <Loading />
      ) : (
        <View style={styles.list}>
          {data.map((o) => (
            <Card key={o.id}>
              <View style={styles.head}>
                <Text variant="h2" accessibilityRole="header">
                  {o.title}
                </Text>
                <Text variant="small">{o.subtitle}</Text>
              </View>
              {o.days.map((d, i) => (
                <View key={d.date} style={[styles.day, i > 0 && styles.divider]}>
                  <View>
                    <Text variant="bodyStrong">
                      {shortDate(d.date)}
                      {d.label ? ` · ${d.label}` : ''}
                    </Text>
                    <Text variant="small">
                      {[
                        d.hebrew,
                        d.candleLighting ? `candle lighting ${d.candleLighting}` : '',
                        d.havdalah ? `Shabbat ends ${d.havdalah}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.chips}>
                    {d.meals.map((m) => (
                      <MealChipView key={m.id} meal={m} />
                    ))}
                  </View>
                  <AddMeal date={d.date} />
                </View>
              ))}
            </Card>
          ))}

          <Card tone="subtle">
            <Text variant="h3">This week</Text>
            {!week.data ? (
              <Loading />
            ) : (
              week.data.map((d, i) => <DayRow key={d.date} day={d} first={i === 0} today={today} />)
            )}
          </Card>

          <Card tone="subtle">
            <Text variant="h3">Another day?</Text>
            <Text color={colors.muted}>
              Pick any range of days on the calendar, from one meal to a whole Yom Tov.
            </Text>
            <Button label="Other days..." href="/calendar" variant="secondary" />
          </Card>
        </View>
      )}
    </Screen>
  )
}

function DayRow({ day, first, today }: { day: CalendarDay; first: boolean; today?: string }) {
  return (
    <View style={[styles.day, !first && styles.divider]}>
      <View style={styles.inline}>
        <Text variant="bodyStrong">
          {day.date === today ? 'Today · ' : ''}
          {shortDate(day.date)}
        </Text>
        {day.holidays.map((h) => (
          <Badge key={h.name} label={h.name} tone={h.type === 'civil' ? 'info' : 'warn'} />
        ))}
      </View>
      <Text variant="small">
        {[day.hebrew, day.parasha ? `Parashat ${day.parasha}` : ''].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.chips}>
        {day.meals.map((m) => (
          <MealChipView key={m.id} meal={m} />
        ))}
      </View>
      <AddMeal date={day.date} compact />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.lg },
  head: { gap: 2 },
  day: { gap: space.sm, paddingTop: space.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.lg },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
