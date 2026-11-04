import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, KindLabel, Text } from '@/components'
import { COURSES, type MealItem } from '@/lib/api/types'
import { COURSE_LABEL, dishName } from '@/lib/strings'
import { colors, space } from '@/theme/tokens'

/** The menu grouped by course. Shows brought dishes and any adjustment notes. */
export function MenuList({
  items,
  onRemove,
}: {
  items: MealItem[]
  onRemove?: (id: string) => void
}) {
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
