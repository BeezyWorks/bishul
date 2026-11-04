import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  KindLabel,
  Loading,
  Pill,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  useLayout,
} from '@/components'
import { useRecipe } from '@/lib/api/hooks'
import type { Fit, RecipeVersion, SkipImpact } from '@/lib/api/types'
import { useUnits } from '@/lib/prefs'
import { COURSE_LABEL } from '@/lib/strings'
import { formatAmount, formatMinutes } from '@/lib/units'
import { colors, radius, space, type Tone } from '@/theme/tokens'

const SCALES = [0.5, 1, 2, 3]
const FIT_TONE: Record<Fit, Tone> = { fine: 'muted', good: 'info', 'especially suited': 'accent' }
const SKIP_TEXT: Record<SkipImpact, { text: string; tone: Tone }> = {
  none: { text: 'Fine to skip', tone: 'accent' },
  minor: { text: 'Minor change', tone: 'warn' },
  ruins: { text: 'Don’t skip', tone: 'danger' },
}

export function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: recipe, isLoading } = useRecipe(id)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [units, setUnits] = useUnits()
  if (isLoading || !recipe)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const v = recipe.versions.find((x) => x.id === versionId) ?? recipe.versions[0]

  return (
    <Screen
      back={{ label: 'Recipes', href: '/recipes' }}
      eyebrow={`${COURSE_LABEL[recipe.course]} · ${recipe.form}`}
      title={recipe.title}
      subtitle={
        recipe.aliases.length ? `Also searched as: ${recipe.aliases.join(', ')}` : undefined
      }
      actions={<Button label="Start cooking" href={`/cook/${v.id}?scale=${scale}`} />}
    >
      <View style={styles.wrapRow} accessibilityRole="tablist">
        {recipe.versions.map((x) => (
          <Pill
            key={x.id}
            label={x.label}
            selected={x.id === v.id}
            onPress={() => setVersionId(x.id)}
          />
        ))}
      </View>
      <VersionView v={v} scale={scale} setScale={setScale} units={units} setUnits={setUnits} />
    </Screen>
  )
}

function VersionView({
  v,
  scale,
  setScale,
  units,
  setUnits,
}: {
  v: RecipeVersion
  scale: number
  setScale: (n: number) => void
  units: 'metric' | 'us'
  setUnits: (u: 'metric' | 'us') => void
}) {
  const { wide } = useLayout()
  const tiles: [string, string][] = [
    ['Serves', String(Math.round(v.servings * scale))],
    ['Hands-on', formatMinutes(v.activeMin)],
    ['Total', formatMinutes(v.totalMin)],
    ['Difficulty', v.difficulty],
    ['Cost', v.cost],
    ['Served', v.serving + (v.holdsOnBlech ? ', holds on the blech' : '')],
  ]
  return (
    <View style={styles.col}>
      <Text color={colors.muted}>{v.description}</Text>
      <View style={styles.wrapRow}>
        <KindLabel kind={v.kind} />
        {v.pesachFriendly ? <Badge label="Pesach-friendly" tone="info" /> : null}
        {v.easyToDeliver ? <Badge label="Easy to deliver" tone="muted" /> : null}
        {v.flags.map((f) => (
          <Badge key={f} label={f} tone="warn" />
        ))}
        {v.parentId ? <Badge label="A variation" tone="muted" /> : null}
      </View>

      <View style={styles.tiles}>
        {tiles.map(([k, val]) => (
          <View key={k} style={styles.tile}>
            <Text variant="label">{k}</Text>
            <Text variant="h3">{val}</Text>
          </View>
        ))}
      </View>

      {v.prePrep.length ? (
        <Card tone="info">
          <Text variant="label" color={colors.info}>
            Start ahead
          </Text>
          {v.prePrep.map((p) => (
            <Text key={p.text} color={colors.info}>
              {p.text}: {p.leadHours} h{p.passive ? ' (passive, can run over Shabbat)' : ''}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={styles.wrapRow}>
        {v.occasionFit.map((f) => (
          <Badge key={f.dimension} label={`${f.dimension}: ${f.fit}`} tone={FIT_TONE[f.fit]} />
        ))}
        {v.source ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(v.source!.url)}
            style={styles.link}
          >
            <Text variant="small" color={colors.info}>
              Source: {v.source.label} {'↗'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.cols, wide && styles.colsWide]}>
        <Card style={wide ? { flex: 3 } : undefined}>
          <SectionHeader title="Ingredients" />
          <View style={styles.wrapRow}>
            <Text variant="small">Scale</Text>
            {SCALES.map((s) => (
              <Pill
                key={s}
                label={s === 0.5 ? '½×' : `×${s}`}
                selected={scale === s}
                onPress={() => setScale(s)}
              />
            ))}
            <Segmented
              options={[
                { value: 'metric', label: 'Metric' },
                { value: 'us', label: 'Cups' },
              ]}
              value={units}
              onChange={setUnits}
            />
          </View>
          <View style={styles.tableHead}>
            <Text variant="label" style={styles.cName}>
              Ingredient
            </Text>
            <Text variant="label" style={styles.cAmt}>
              Amount
            </Text>
            <Text variant="label" style={styles.cSkip}>
              If you skip it
            </Text>
          </View>
          {v.ingredients.map((l) => {
            const a = formatAmount(l, scale, units)
            const skip = SKIP_TEXT[l.skipImpact]
            return (
              <View key={l.id} style={styles.tr}>
                <View style={styles.cName}>
                  <Text variant="bodyStrong">{l.name}</Text>
                  {l.prep ? <Text variant="small">{l.prep}</Text> : null}
                  {l.allergens.length ? (
                    <Text variant="small" color={colors.danger}>
                      Contains {l.allergens.join(', ')}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.cAmt}>
                  <Text>
                    {a.approx ? '~' : ''}
                    {a.text}
                  </Text>
                </View>
                <View style={styles.cSkip}>
                  <Badge label={skip.text} tone={skip.tone} />
                </View>
              </View>
            )
          })}
          {units === 'us' ? (
            <Text variant="small">
              ~ means converted from weight using ingredient density, so approximate.
            </Text>
          ) : null}
        </Card>

        <View style={[styles.col, wide && { flex: 2 }]}>
          <Card>
            <SectionHeader title="Equipment" />
            {v.equipment.length === 0 ? <Text color={colors.muted}>Nothing special.</Text> : null}
            {v.equipment.map((e) => (
              <View key={e.name} style={styles.wrapRow}>
                <Text>{e.name}</Text>
                <Badge label={e.designation} tone="muted" />
              </View>
            ))}
          </Card>
          <Card>
            <SectionHeader title="Who has had this version" />
            {v.reactions.length === 0 ? (
              <Text color={colors.muted}>No reactions recorded yet.</Text>
            ) : null}
            {v.reactions.map((r) => (
              <View key={r.personId + r.date} style={{ gap: 2 }}>
                <View style={styles.wrapRow}>
                  <Text variant="bodyStrong">{r.personName}</Text>
                  <Badge
                    label={r.kind === 'like' ? 'Liked it' : 'Didn’t like it'}
                    tone={r.kind === 'like' ? 'accent' : 'warn'}
                  />
                </View>
                {r.note ? <Text variant="small">{r.note}</Text> : null}
                <Text variant="small">
                  Recorded by {r.recordedBy}, {r.date}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      </View>

      <Card>
        <SectionHeader title="Steps" />
        {v.steps.map((s, i) => (
          <View key={s.id} style={styles.step}>
            <View style={styles.num}>
              <Text variant="bodyStrong" color={colors.accent}>
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text>{s.text}</Text>
              {s.timerSec ? (
                <Text variant="small">Timer: {Math.round(s.timerSec / 60)} min</Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeader title="Edit history" hint="Versions are mutable; every change is kept." />
        {v.history.map((h) => (
          <Text key={h.date + h.summary} variant="small" color={colors.ink}>
            {h.date} {'·'} {h.by} {'·'} {h.summary}
          </Text>
        ))}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  col: { gap: space.lg },
  cols: { gap: space.lg },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: space.md,
    gap: 2,
  },
  link: { minHeight: 44, justifyContent: 'center' },
  tableHead: {
    flexDirection: 'row',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: space.xs,
  },
  tr: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.subtle,
  },
  cName: { flex: 3 },
  cAmt: { flex: 2 },
  cSkip: { flex: 2 },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
