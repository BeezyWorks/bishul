import React from 'react'
import { StyleSheet, View } from 'react-native'

import { AddMeal, Button, Card, Loading, Screen, Text } from '@/components'
import { MealChipView } from '@/components/MealChipView'
import { useUpcoming } from '@/lib/api/hooks'
import { shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

export function PlanScreen() {
  const { data, isLoading } = useUpcoming()
  return (
    <Screen
      title="What are you planning?"
      subtitle="Pick what is coming up. Meals are added to a day only when you need them."
    >
      {isLoading || !data ? (
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
                    <Text variant="small">{d.hebrew}</Text>
                  </View>
                  <View style={styles.chips}>
                    {d.meals.map((m) => (
                      <MealChipView key={m.id} meal={m} />
                    ))}
                  </View>
                  <AddMeal date={d.date} />
                </View>
              ))}
              {o.moreInCalendar ? (
                <Button label={o.moreInCalendar} href="/calendar" variant="ghost" small />
              ) : null}
            </Card>
          ))}
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

const styles = StyleSheet.create({
  list: { gap: space.lg },
  head: { gap: 2 },
  day: { gap: space.md, paddingTop: space.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
