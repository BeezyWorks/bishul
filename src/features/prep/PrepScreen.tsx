import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Card, Empty, Loading, Screen, Text } from '@/components'
import { usePrep } from '@/lib/api/hooks'
import { shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

export function PrepScreen() {
  const { data, isLoading } = usePrep()
  return (
    <Screen
      title="Prep schedule"
      subtitle="Worked back from each accepted meal. Hands-on work is never scheduled over Shabbat or Yom Tov."
    >
      {isLoading || !data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>Accept a meal and its prep appears here.</Empty>
      ) : (
        data.map((d) => (
          <Card key={d.id} tone={d.tasks.length === 0 ? 'subtle' : 'default'}>
            <View style={styles.head}>
              <Text variant="h2" accessibilityRole="header">
                {d.label}
              </Text>
              <Text variant="small">{shortDate(d.date)}</Text>
            </View>
            {d.note ? <Text color={colors.muted}>{d.note}</Text> : null}
            {d.tasks.map((t) => (
              <View key={t.id} style={styles.task}>
                <Text variant="bodyStrong" style={styles.time}>
                  {t.time}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text>{t.text}</Text>
                  <View style={styles.badges}>
                    <Badge label={t.mealName} tone="muted" />
                    {t.passive ? <Badge label="Passive" tone="info" /> : null}
                  </View>
                </View>
              </View>
            ))}
          </Card>
        ))
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap' },
  task: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  time: { width: 76 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
})
