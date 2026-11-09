import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, Pill, SectionHeader, Text, TextField } from '@/components'
import { useSaveVersion } from '@/lib/api/hooks'
import type { Id, RecipeVersion, VersionEdit } from '@/lib/api/types'
import { SHARES, portionLabel } from '@/lib/units'
import { colors, space } from '@/theme/tokens'

/** step id -> ingredient id -> share of it (1 = all) */
type Links = Record<Id, Record<Id, number>>

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Tie each step to the ingredients it uses, by hand. Tap an ingredient under a step to add it; when an amount is
 * divided between steps ("2 tbsp butter, divided"), pick the share each step uses. The shares for one ingredient
 * should add up to a whole.
 */
export function LinkSteps({
  version,
  onDone,
  onCancel,
}: {
  version: RecipeVersion
  onDone: () => void
  onCancel: () => void
}) {
  const [links, setLinks] = useState<Links>(() =>
    Object.fromEntries(
      version.steps.map((s) => [
        s.id,
        Object.fromEntries(s.ingredientIds.map((id) => [id, s.portions?.[id] ?? 1])),
      ]),
    ),
  )

  /** step id -> timer minutes as typed ('' = none) */
  const [timers, setTimers] = useState<Record<Id, string>>(() =>
    Object.fromEntries(
      version.steps.map((s) => [s.id, s.timerSec ? String(round(s.timerSec / 60)) : '']),
    ),
  )

  const totals: Record<Id, number> = {}
  for (const s of version.steps)
    for (const [id, p] of Object.entries(links[s.id] ?? {})) totals[id] = (totals[id] ?? 0) + p
  const unused = version.ingredients.filter((l) => !totals[l.id])

  const set = (stepId: Id, ingId: Id, share: number | null) =>
    setLinks((cur) => {
      const step = { ...cur[stepId] }
      if (share === null) delete step[ingId]
      else step[ingId] = share
      return { ...cur, [stepId]: step }
    })

  const save = useSaveVersion(version.recipeId)
  const edit = (): VersionEdit => {
    const index = new Map(version.ingredients.map((l, i) => [l.id, i]))
    return {
      steps: version.steps.map((s) => ({
        text: s.text,
        section: s.section,
        ...(Number(timers[s.id]) > 0 && { timerMin: Number(timers[s.id]) }),
        uses: Object.entries(links[s.id] ?? {})
          .filter(([id]) => index.has(id))
          .map(([id, p]) => ({ line: index.get(id)!, ...(p < 1 && { portion: p }) }))
          .sort((a, b) => a.line - b.line),
      })),
    }
  }

  return (
    <Card tone="subtle">
      <SectionHeader
        title="Ingredients and timers for each step"
        hint="Cooking mode shows these with each step. Tap an ingredient to add or remove it. If a step uses only part of it, pick how much. Set a timer in minutes for steps that need one."
      />
      {unused.length ? (
        <Text color={colors.danger}>
          Not used in any step: {unused.map((l) => l.name).join(', ')}
        </Text>
      ) : null}
      {version.steps.map((s, n) => (
        <View key={s.id} style={styles.step}>
          <Text variant="bodyStrong">
            {n + 1}. <Text>{s.text}</Text>
          </Text>
          <TextField
            label="Timer (minutes)"
            value={timers[s.id] ?? ''}
            onChangeText={(t) => setTimers((cur) => ({ ...cur, [s.id]: t.replace(/[^0-9.]/g, '') }))}
            keyboardType="decimal-pad"
            placeholder="No timer"
          />
          <View style={styles.row}>
            {version.ingredients.map((l) => (
              <Pill
                key={l.id}
                label={l.name}
                selected={links[s.id]?.[l.id] !== undefined}
                onPress={() => set(s.id, l.id, links[s.id]?.[l.id] === undefined ? 1 : null)}
              />
            ))}
          </View>
          {Object.entries(links[s.id] ?? {}).map(([ingId, share]) => {
            const l = version.ingredients.find((x) => x.id === ingId)
            if (!l) return null
            const others = round((totals[ingId] ?? 0) - share)
            const rest = round(1 - others)
            return (
              <View key={ingId} style={styles.share}>
                <Text style={{ minWidth: 120 }}>{l.name}</Text>
                <Pill label="All" selected={share === 1} onPress={() => set(s.id, ingId, 1)} />
                {SHARES.map(([v, label]) => (
                  <Pill
                    key={label}
                    label={label}
                    selected={Math.abs(share - v) < 0.01}
                    onPress={() => set(s.id, ingId, round(v))}
                  />
                ))}
                {others > 0 && rest > 0 && rest < 1 && Math.abs(share - rest) > 0.01 ? (
                  <Pill
                    label={`The rest (${portionLabel(rest)})`}
                    onPress={() => set(s.id, ingId, rest)}
                  />
                ) : null}
                {totals[ingId] > 1.01 ? (
                  <Text variant="small" color={colors.danger}>
                    Steps add up to more than the whole
                  </Text>
                ) : totals[ingId] < 0.99 ? (
                  <Text variant="small" color={colors.muted}>
                    {portionLabel(round(1 - totals[ingId]))} not yet used
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ))}
      {save.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(save.error as Error).message}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label="Save links"
          loading={save.isPending}
          onPress={async () => {
            await save.mutateAsync({ versionId: version.id, edit: edit() })
            onDone()
          }}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  step: {
    gap: space.sm,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  share: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
})
