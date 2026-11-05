import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Checkbox, KindLabel, Text } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation } from '@/lib/api/hooks'
import { COURSES, type MealItem } from '@/lib/api/types'
import { COURSE_LABEL, dishName } from '@/lib/strings'
import { colors, space } from '@/theme/tokens'

/** The menu grouped by course. Shows brought dishes and any adjustment notes. */
export function MenuList({
  mealId,
  items,
  onRemove,
  accepted,
}: {
  mealId?: string
  items: MealItem[]
  onRemove?: (id: string) => void
  /** Accepted menu: plain dishes by course, to check off, each with a link to cook it. */
  accepted?: boolean
}) {
  const setDone = useApiMutation(
    (a: { id: string; done: boolean }) => api.setItemDone(mealId!, a.id, a.done),
    stale.meal,
  )
  if (accepted) {
    return (
      <View style={styles.wrap}>
        {COURSES.filter((c) => items.some((i) => i.course === c)).map((c) => (
          <View key={c} style={styles.group}>
            <Text variant="label">{COURSE_LABEL[c]}</Text>
            {items
              .filter((i) => i.course === c)
              .map((it) => {
                const name = dishName(it.title, it.versionLabel)
                return (
                  <View key={it.id} style={styles.item}>
                    <Checkbox
                      label={name}
                      checked={!!it.done}
                      onChange={(v) => setDone.mutate({ id: it.id, done: v })}
                    />
                    <View style={styles.main}>
                      <Text variant="bodyStrong" style={it.done && styles.struck}>
                        {name}
                      </Text>
                      {it.broughtBy ? <Text variant="small">Brought by {it.broughtBy}</Text> : null}
                      {it.versionId && !it.broughtBy ? (
                        <Button
                          label="Cook it"
                          href={`/cook/${it.versionId}`}
                          variant="ghost"
                          small
                          accessibilityLabel={`Cook ${name}`}
                        />
                      ) : null}
                    </View>
                  </View>
                )
              })}
          </View>
        ))}
      </View>
    )
  }
  return (
    <View style={styles.wrap}>
      {COURSES.filter((c) => items.some((i) => i.course === c)).map((c) => (
        <View key={c} style={styles.group}>
          <Text variant="label">{COURSE_LABEL[c]}</Text>
          {items
            .filter((i) => i.course === c)
            .map((it) => (
              <View key={it.id} style={styles.item}>
                <View style={styles.main}>
                  <Text variant="bodyStrong">{dishName(it.title, it.versionLabel)}</Text>
                  <View style={styles.badges}>
                    <KindLabel kind={it.kind} />
                    {it.broughtBy ? (
                      <Badge label={`Brought by ${it.broughtBy}`} tone="info" />
                    ) : null}
                    {it.scale !== 1 ? <Badge label={`×${it.scale}`} tone="muted" /> : null}
                    {it.servings ? <Badge label={`${it.servings} servings`} tone="muted" /> : null}
                  </View>
                  {it.adjustments.map((a) => (
                    <Text key={a} variant="small" color={colors.warn}>
                      {a}
                    </Text>
                  ))}
                </View>
                {onRemove ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    small
                    accessibilityLabel={`Remove ${it.title}`}
                    onPress={() => onRemove(it.id)}
                  />
                ) : null}
              </View>
            ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  group: { gap: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  main: { flex: 1, gap: 6 },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
