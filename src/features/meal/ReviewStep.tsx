import React from 'react'
import { StyleSheet, View } from 'react-native'

import { AddMeal, Badge, Button, Card, Disclaimer, Empty, SectionHeader, Text } from '@/components'
import { api } from '@/lib/api/client'
import { useApiMutation } from '@/lib/api/hooks'
import type { MealDetail } from '@/lib/api/types'
import { formatMinutes } from '@/lib/units'
import { colors, space } from '@/theme/tokens'

import { MenuList } from './MenuList'

export function ReviewStep({ detail }: { detail: MealDetail }) {
  const { meal, review, brief } = detail
  const accept = useApiMutation(() => api.acceptMeals([meal.id]))
  const accepted = meal.status === 'accepted'
  const blocked = review.issues.length > 0 || meal.items.length === 0

  return (
    <View style={styles.wrap}>
      <Card>
        <SectionHeader title="Menu" />
        {meal.items.length ? (
          <MenuList items={meal.items} />
        ) : (
          <Empty>The menu is empty. Add dishes first.</Empty>
        )}
      </Card>

      {review.issues.length ? (
        <Card tone="danger">
          <Text variant="h3" color={colors.danger}>
            Fix before accepting
          </Text>
          {review.issues.map((i) => (
            <Text key={i} color={colors.danger}>
              {i}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Adjustments still needed" />
        {review.adjustments.length === 0 ? (
          <Text color={colors.muted}>None. Every dish works for everyone coming.</Text>
        ) : (
          review.adjustments.map((a) => (
            <View key={a.item + a.text} style={styles.line}>
              <Badge label={a.item} tone="warn" />
              <Text style={{ flex: 1 }}>{a.text}</Text>
            </View>
          ))
        )}
        {brief.hasAllergy ? <Disclaimer /> : null}
      </Card>

      <View style={styles.two}>
        <Card style={{ flex: 1, minWidth: 260 }}>
          <SectionHeader title="Hands-on time" />
          <Text variant="display">{formatMinutes(review.handsOnMin)}</Text>
          <Text variant="small">Across all dishes you cook. Brought dishes are not counted.</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: 260 }}>
          <SectionHeader title="Shopping notes" />
          {review.sourcing.map((s) => (
            <View key={s} style={styles.line}>
              <Badge label="Sourcing" tone="info" />
              <Text style={{ flex: 1 }}>{s}</Text>
            </View>
          ))}
          {review.shopping.map((s) => (
            <Text key={s}>{s}</Text>
          ))}
          {review.sourcing.length + review.shopping.length === 0 ? (
            <Text color={colors.muted}>Nothing to buy yet.</Text>
          ) : null}
        </Card>
      </View>

      {accepted ? (
        <Card tone="accent">
          <Text variant="h3" color={colors.accent}>
            Accepted. Pantry items are held and the cooking is scheduled.
          </Text>
          <View style={styles.actions}>
            <Button label="See the prep schedule" href="/prep" variant="secondary" />
            <Button label="Shopping list" href="/shopping" variant="secondary" />
            {review.nextMealId ? (
              <Button
                label={`Plan the next meal: ${review.nextMealName}`}
                href={`/meal/${review.nextMealId}`}
              />
            ) : null}
          </View>
          {!review.nextMealId ? (
            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong">Plan the next meal</Text>
              <AddMeal date={meal.date} />
            </View>
          ) : null}
        </Card>
      ) : (
        <Button
          label={blocked ? 'Accept (fix the issues first)' : 'Accept this menu'}
          disabled={blocked}
          loading={accept.isPending}
          onPress={() => accept.mutate(undefined)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
