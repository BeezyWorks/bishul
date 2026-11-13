import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Disclaimer, RecipePicker, Text } from '@/components'
import { useAddMealDish, useRemoveMealDish } from '@/lib/api/hooks'
import type { HostedFix, HostedPage, Id } from '@/lib/api/types'
import { colors, radius, space } from '@/theme/tokens'

const KIND_LABEL: Record<HostedFix['kind'], string> = {
  allergy: 'Allergy',
  exclusion: 'Excluded',
  rule: 'Rule',
  meal: 'Meal',
  gap: 'Gap',
}

/** `vegetarian` from "…has no vegetarian main for Miriam", for "Find a vegetarian main". */
function dietWord(text: string): string | undefined {
  return /\b(vegetarian|vegan|pescatarian|dairy-free|gluten-free|kosher for pesach)\b/i.exec(
    text,
  )?.[1]
}

export function ProblemsBox({ page }: { page: HostedPage }) {
  const add = useAddMealDish()
  const remove = useRemoveMealDish()
  const [open, setOpen] = useState<number | null>(null)
  const fixes = page.fixes
  const aiNotes = page.days.flatMap((d) => d.meals.flatMap((m) => m.problemDetails.aiNotes))

  if (!fixes.length && !aiNotes.length) {
    return (
      <View style={styles.box}>
        <Text variant="h3">Nothing to fix</Text>
        <Disclaimer />
      </View>
    )
  }
  return (
    <View style={[styles.box, fixes.length ? styles.boxWarn : null]}>
      <Text variant="h3" accessibilityRole="header">
        {fixes.length} {fixes.length === 1 ? 'thing' : 'things'} to fix
      </Text>
      {fixes.map((f, i) => {
        const isGap = f.kind === 'gap'
        const course = f.course ?? 'main'
        const canFix = !!f.mealId && (isGap || f.itemIds.length > 0)
        const diet = isGap ? dietWord(f.text) : undefined
        return (
          <View key={`${f.mealId}-${i}`} style={{ gap: space.sm }}>
            <View style={styles.issue}>
              <Badge label={KIND_LABEL[f.kind]} tone={f.kind === 'gap' ? 'warn' : 'danger'} />
              <Text style={{ flex: 1, minWidth: 200 }}>
                <Text variant="bodyStrong">{f.dishTitle ?? f.mealName}</Text>
                {f.dishTitle
                  ? ` (${f.mealName}, ${f.dayLabel}${f.course ? `, ${f.course}` : ''})`
                  : ''}
                {f.dishTitle ? ' ' : ': '}
                {f.text}
              </Text>
              {canFix ? (
                <Button
                  small
                  variant="secondary"
                  label={isGap ? (diet ? `Find a ${diet} main` : 'Find a main') : 'Replace dish'}
                  onPress={() => setOpen(open === i ? null : i)}
                />
              ) : null}
            </View>
            {open === i && f.mealId ? (
              <RecipePicker
                mealId={f.mealId}
                course={isGap ? 'main' : course}
                initialQuery={diet ?? ''}
                onClose={() => setOpen(null)}
                onPick={async (hit) => {
                  await add.mutateAsync({
                    mealId: f.mealId as Id,
                    dish: { course: isGap ? 'main' : course, versionId: hit.versionId },
                  })
                  if (!isGap)
                    for (const itemId of f.itemIds)
                      await remove.mutateAsync({ mealId: f.mealId as Id, itemId })
                  setOpen(null)
                }}
                onAddWithoutRecipe={async (text) => {
                  await add.mutateAsync({
                    mealId: f.mealId as Id,
                    dish: { course: isGap ? 'main' : course, description: text },
                  })
                  if (!isGap)
                    for (const itemId of f.itemIds)
                      await remove.mutateAsync({ mealId: f.mealId as Id, itemId })
                  setOpen(null)
                }}
              />
            ) : null}
          </View>
        )
      })}
      {aiNotes.map((n, i) => (
        <Text key={`${n.dishId}-${i}`} variant="small" color={colors.warn}>
          {n.text}
        </Text>
      ))}
      <Disclaimer />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  boxWarn: { borderColor: colors.danger },
  issue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
})
