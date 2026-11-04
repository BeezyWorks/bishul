import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  AddMeal,
  Badge,
  Button,
  Card,
  Disclaimer,
  Empty,
  Pill,
  SectionHeader,
  Text,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation } from '@/lib/api/hooks'
import type { MealDetail } from '@/lib/api/types'
import { dishName } from '@/lib/strings'
import { formatMinutes } from '@/lib/units'
import { colors, space } from '@/theme/tokens'

import { MenuList } from './MenuList'

export function ReviewStep({ detail }: { detail: MealDetail }) {
  const { meal, review, brief } = detail
  const router = useRouter()
  const accept = useApiMutation(() => api.acceptMeals([meal.id]), stale.accept)
  const reopen = useApiMutation(() => api.reopenMeals([meal.id]), stale.accept)
  const remove = useApiMutation(() => api.deleteMeal(meal.id), stale.menu)
  const accepted = meal.status === 'accepted'
  const blocked = review.issues.length > 0 || meal.items.length === 0
  const refused = accept.data?.blocked ?? []

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

      {review.warnings?.length ? (
        <Card tone="warn">
          <Text variant="h3" color={colors.warn}>
            Worth a look
          </Text>
          {review.warnings.map((w) => (
            <Text key={w} color={colors.warn}>
              {w}
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

      {refused.map((b) => (
        <Card key={b.id} tone="danger">
          <Text variant="h3" color={colors.danger}>
            Not accepted
          </Text>
          {b.problems.map((p) => (
            <Text key={p} color={colors.danger}>
              {p}
            </Text>
          ))}
        </Card>
      ))}
      {accept.error ? <Text color={colors.danger}>{(accept.error as Error).message}</Text> : null}

      {accepted ? (
        <Card tone="accent">
          <Text variant="h3" color={colors.accent}>
            Accepted. Pantry items are held and the cooking is scheduled.
          </Text>
          <View style={styles.actions}>
            <Button label="See the prep schedule" href="/prep" variant="secondary" />
            <Button label="Shopping list" href="/shopping" variant="secondary" />
            <Button
              label="Reopen to edit"
              variant="ghost"
              loading={reopen.isPending}
              onPress={() => reopen.mutate(undefined)}
            />
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

      <Reactions detail={detail} />

      <Button
        label="Delete this meal"
        variant="danger"
        small
        loading={remove.isPending}
        onPress={async () => {
          await remove.mutateAsync(undefined)
          router.replace('/')
        }}
      />
    </View>
  )
}

/** "How did it go?": likes and dislikes go on the version, for whoever was at the table. */
function Reactions({ detail }: { detail: MealDetail }) {
  const dishes = detail.meal.items.filter((i) => i.versionId)
  const eaters = detail.people.filter((p) => p.coming)
  const [personId, setPersonId] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, 'like' | 'dislike'>>({})
  const react = useApiMutation(
    async (a: { versionId: string; reaction: 'like' | 'dislike' }) => {
      await api.recordReaction(personId!, a.versionId, a.reaction)
      setDone((d) => ({ ...d, [`${personId}:${a.versionId}`]: a.reaction }))
    },
    stale.reactions,
  )
  if (!dishes.length || !eaters.length) return null
  return (
    <Card>
      <SectionHeader
        title="How did it go?"
        hint="Record who liked or didn’t like a dish. Likes help it come back, but not every week."
      />
      <View style={styles.actions}>
        {eaters.map((p) => (
          <Pill
            key={p.person.id}
            label={p.person.name}
            selected={personId === p.person.id}
            onPress={() => setPersonId(p.person.id)}
          />
        ))}
      </View>
      {personId
        ? dishes.map((d) => {
            const mark = done[`${personId}:${d.versionId}`]
            return (
              <View key={d.id} style={styles.line}>
                <Text style={{ flex: 1 }}>{dishName(d.title, d.versionLabel)}</Text>
                <Button
                  label={mark === 'like' ? 'Liked' : 'Liked it'}
                  variant={mark === 'like' ? 'primary' : 'soft'}
                  small
                  accessibilityLabel={`Liked ${d.title}`}
                  onPress={() => react.mutate({ versionId: d.versionId!, reaction: 'like' })}
                />
                <Button
                  label={mark === 'dislike' ? 'Disliked' : 'Didn’t like it'}
                  variant={mark === 'dislike' ? 'primary' : 'secondary'}
                  small
                  accessibilityLabel={`Didn’t like ${d.title}`}
                  onPress={() => react.mutate({ versionId: d.versionId!, reaction: 'dislike' })}
                />
              </View>
            )
          })
        : (
          <Text color={colors.muted}>Choose who you are recording for.</Text>
        )}
    </Card>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
