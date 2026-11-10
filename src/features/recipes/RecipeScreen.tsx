import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  KindLabel,
  Loading,
  PartHeading,
  Pill,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  useLayout,
} from '@/components'
import { useHousehold, useRecipe, useRecordReaction } from '@/lib/api/hooks'

import { AddEquipment } from './AddEquipment'
import { AddTag } from './AddTag'
import { EditableTiles } from './EditableTiles'
import { EditVersion } from './EditVersion'
import { LinkSteps } from './LinkSteps'
import { SharePanel } from './SharePanel'
import type { Fit, RecipeVersion, SkipImpact } from '@/lib/api/types'
import { useMeasure, useUnits } from '@/lib/prefs'
import { groupBySection, headingFor } from '@/lib/sections'
import { COURSE_LABEL } from '@/lib/strings'
import { formatAmount, portionLabel } from '@/lib/units'
import { colors, space, type Tone } from '@/theme/tokens'

const isVideo = (u: string) =>
  /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com\/(reel|tv))/i.test(u)

const SCALES = [0.5, 1, 2, 3]
const FIT_TONE: Record<Fit, Tone> = { fine: 'muted', good: 'info', 'especially suited': 'accent' }
const SKIP_TEXT: Record<SkipImpact, { text: string; tone: Tone }> = {
  none: { text: 'Fine to skip', tone: 'accent' },
  minor: { text: 'Minor change', tone: 'warn' },
  ruins: { text: 'Don’t skip', tone: 'danger' },
}

/** Set or clear what someone in the household thought of this version. */
function VersionReactions({ version }: { version: RecipeVersion }) {
  const household = useHousehold()
  const [personId, setPersonId] = useState<string | null>(null)
  const react = useRecordReaction(version.recipeId)
  const everyone = household.data?.people ?? []
  const person = everyone.find((p) => p.id === personId)
  if (!everyone.length) return null
  const mine = version.reactions.find((r) => r.personId === personId)
  const record = (reaction: 'like' | 'dislike' | 'none') =>
    person &&
    react.mutate({ personId: person.id, personName: person.name, versionId: version.id, reaction })
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">Record a reaction</Text>
      <View style={styles.wrapRow}>
        {everyone.map((p) => (
          <Pill
            key={p.id}
            label={p.name}
            selected={p.id === personId}
            onPress={() => setPersonId(p.id)}
          />
        ))}
      </View>
      {personId ? (
        <Segmented
          options={[
            { value: 'none', label: 'Not set' },
            { value: 'like', label: 'Liked it' },
            { value: 'dislike', label: 'Didn’t like it' },
          ]}
          value={mine?.kind ?? 'none'}
          onChange={record}
        />
      ) : null}
    </View>
  )
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * Whether the original text says nothing beyond what is already on screen (the name and the prep note). A line with
 * no amount has no catalog name to fall back on, so the name is often the original text, and "salt to taste" splits
 * into "salt" plus a "to taste" note; showing the original on top of those would print it twice.
 */
export function isCovered(original: string, shown: (string | undefined)[]): boolean {
  const seen = new Set(shown.flatMap((s) => words(s ?? '')))
  return words(original).every((w) => seen.has(w))
}

export function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: recipe, isLoading } = useRecipe(id)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [editing, setEditing] = useState<
    null | 'edit' | 'variation' | 'link' | 'share' | 'steps' | 'ingredients'
  >(null)
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
      eyebrow={[COURSE_LABEL[recipe.course], recipe.form].filter(Boolean).join(' · ')}
      title={recipe.title}
      subtitle={
        recipe.aliases.length ? `Also searched as: ${recipe.aliases.join(', ')}` : undefined
      }
      actions={
        <View style={styles.wrapRow}>
          <Button
            label="Edit"
            icon="edit"
            iconOnly
            variant="secondary"
            onPress={() => setEditing('edit')}
          />
          <Button
            label="Share"
            icon="share"
            iconOnly
            variant="secondary"
            onPress={() => setEditing('share')}
          />
          <Button label="Start cooking" icon="play" href={`/cook/${v.id}?scale=${scale}`} />
        </View>
      }
    >
      {editing === 'share' ? (
        <SharePanel
          key={`share:${recipe.id}`}
          recipeId={recipe.id}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === 'edit' || editing === 'variation' ? (
        <EditVersion
          key={`${editing}:${v.id}`}
          recipe={recipe}
          version={v}
          mode={editing}
          onCancel={() => setEditing(null)}
          onDone={(id) => {
            setVersionId(id)
            setEditing(null)
          }}
        />
      ) : null}
      <View style={{ gap: space.xs }}>
        {recipe.versions.length > 1 ? <Text variant="label">Variation</Text> : null}
        <View style={styles.wrapRow}>
          {recipe.versions.length > 1 ? (
            <Segmented
              options={recipe.versions.map((x) => ({ value: x.id, label: x.label }))}
              value={v.id}
              onChange={setVersionId}
            />
          ) : null}
          <Button
            label="New variation"
            icon="plus"
            variant="ghost"
            small
            onPress={() => setEditing('variation')}
          />
        </View>
      </View>
      <VersionView
        v={v}
        scale={scale}
        setScale={setScale}
        units={units}
        setUnits={setUnits}
        onLink={() => setEditing('link')}
        onEditSteps={() => setEditing('steps')}
        onEditIngredients={() => setEditing('ingredients')}
        ingredientsPanel={
          editing === 'ingredients' ? (
            <EditVersion
              key={`ingredients:${v.id}`}
              recipe={recipe}
              version={v}
              mode="edit"
              only="ingredients"
              onCancel={() => setEditing(null)}
              onDone={() => setEditing(null)}
            />
          ) : null
        }
        stepsPanel={
          editing === 'steps' ? (
            <EditVersion
              key={`steps:${v.id}`}
              recipe={recipe}
              version={v}
              mode="edit"
              only="steps"
              onCancel={() => setEditing(null)}
              onDone={() => setEditing(null)}
            />
          ) : null
        }
        linkPanel={
          editing === 'link' ? (
            <LinkSteps
              key={`link:${v.id}`}
              version={v}
              onCancel={() => setEditing(null)}
              onDone={() => setEditing(null)}
            />
          ) : null
        }
      />
    </Screen>
  )
}

function VersionView({
  v,
  scale,
  setScale,
  units,
  setUnits,
  onLink,
  onEditSteps,
  onEditIngredients,
  ingredientsPanel,
  stepsPanel,
  linkPanel,
}: {
  v: RecipeVersion
  scale: number
  setScale: (n: number) => void
  units: 'metric' | 'us'
  setUnits: (u: 'metric' | 'us') => void
  onLink: () => void
  onEditSteps: () => void
  onEditIngredients: () => void
  ingredientsPanel: React.ReactNode
  stepsPanel: React.ReactNode
  linkPanel: React.ReactNode
}) {
  const { wide } = useLayout()
  const [addingEquipment, setAddingEquipment] = useState(false)
  const [measure, setMeasure] = useMeasure()
  return (
    <View style={styles.col}>
      <Text color={colors.muted}>{v.description}</Text>
      <View style={styles.wrapRow}>
        <KindLabel kind={v.kind} />
        {v.pesachFriendly ? (
          <Badge
            label={v.pesachKitniyot ? 'Pesach, with kitniyot' : 'Pesach-friendly'}
            tone="info"
          />
        ) : null}
        {v.easyToDeliver ? <Badge label="Easy to deliver" tone="muted" /> : null}
        {v.flags.map((f) => (
          <Badge key={f} label={f} tone="warn" />
        ))}
        {v.parentId ? <Badge label="A variation" tone="muted" /> : null}
        {v.tags.map((t) => (
          <Badge key={`tag:${t}`} label={`#${t}`} tone="muted" />
        ))}
        <AddTag v={v} />
      </View>

      <EditableTiles v={v} scale={scale} />

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
        {(v.sources ?? []).map((s) => (
          <Pressable
            key={s.url}
            accessibilityRole="link"
            onPress={() => Linking.openURL(s.url)}
            style={styles.link}
          >
            <Text variant="small" color={colors.info}>
              {isVideo(s.url) ? 'Video' : 'Source'}: {s.label} {'↗'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.cols, wide && styles.colsWide]}>
        <Card style={wide ? { flex: 3 } : undefined}>
          <SectionHeader
            title="Ingredients"
            right={
              <Button
                label="Edit ingredients"
                icon="edit"
                iconOnly
                variant="ghost"
                small
                onPress={onEditIngredients}
              />
            }
          />
          {ingredientsPanel}
          {ingredientsPanel ? null : (
            <>
              <View style={styles.wrapRow}>
                <Text variant="small">Scale</Text>
                <Segmented
                  options={SCALES.map((s) => ({
                    value: String(s),
                    label: s === 0.5 ? '½×' : `×${s}`,
                  }))}
                  value={String(scale)}
                  onChange={(v) => setScale(Number(v))}
                />
                <Segmented
                  options={[
                    { value: 'metric', label: 'Metric' },
                    { value: 'us', label: 'US' },
                  ]}
                  value={units}
                  onChange={setUnits}
                />
                <Segmented
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'weight', label: 'Weight' },
                    { value: 'volume', label: 'Volume' },
                  ]}
                  value={measure}
                  onChange={setMeasure}
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
              {groupBySection(v.ingredients).map((g, gi, all) => (
                <View key={gi + g.section}>
                  <PartHeading heading={headingFor(g.path, all[gi - 1]?.path ?? [])} />
                  {g.items.map((l) => {
                    const a = formatAmount(l, scale, units, measure)
                    const skip = SKIP_TEXT[l.skipImpact]
                    return (
                      <View key={l.id} style={styles.tr}>
                        <View style={styles.cName}>
                          <Text variant="bodyStrong">{l.name}</Text>
                          {l.prep ? <Text variant="small">{l.prep}</Text> : null}
                          {l.unquantified && !isCovered(l.original, [l.name, l.prep]) ? (
                            <Text variant="small">{l.original}</Text>
                          ) : null}
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
                </View>
              ))}
              {units === 'us' ? (
                <Text variant="small">
                  ~ means converted from weight using ingredient density, so approximate.
                </Text>
              ) : null}
            </>
          )}
        </Card>

        <View style={[styles.col, wide && { flex: 2 }]}>
          <Card>
            <SectionHeader
              title="Equipment"
              right={
                addingEquipment ? null : (
                  <Button
                    label="Add"
                    icon="plus"
                    variant="ghost"
                    small
                    onPress={() => setAddingEquipment(true)}
                  />
                )
              }
            />
            {v.equipment.length === 0 && !addingEquipment ? (
              <Text color={colors.muted}>Nothing special.</Text>
            ) : null}
            {v.equipment.map((e) => (
              <View key={e.name} style={styles.wrapRow}>
                <Text>{e.name}</Text>
                <Badge label={e.designation} tone="muted" />
              </View>
            ))}
            {addingEquipment ? (
              <AddEquipment key={v.id} v={v} onClose={() => setAddingEquipment(false)} />
            ) : null}
          </Card>
          <Card>
            <SectionHeader title="Who has had this variation" />
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
            <VersionReactions version={v} />
            <Text variant="small">Reactions are private to your household.</Text>
          </Card>
        </View>
      </View>

      <Card>
        <SectionHeader
          title="Steps"
          right={
            <View style={styles.wrapRow}>
              <Button label="Link ingredients" icon="link" variant="ghost" small onPress={onLink} />
              <Button
                label="Edit steps"
                icon="edit"
                iconOnly
                variant="ghost"
                small
                onPress={onEditSteps}
              />
            </View>
          }
        />
        {linkPanel}
        {stepsPanel}
        {stepsPanel
          ? null
          : groupBySection(v.steps).map((g, gi, all) => (
              <View key={gi + g.section} style={{ gap: space.md }}>
                <PartHeading heading={headingFor(g.path, all[gi - 1]?.path ?? [])} />
                {g.items.map((s) => (
                  <View key={s.id} style={styles.step}>
                    <View style={styles.num}>
                      <Text variant="bodyStrong" color={colors.accent}>
                        {v.steps.indexOf(s) + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text>{s.text}</Text>
                      {s.ingredientIds.length ? (
                        <Text variant="small" color={colors.muted}>
                          Uses:{' '}
                          {s.ingredientIds
                            .map((id) => {
                              const name = v.ingredients.find((l) => l.id === id)?.name ?? ''
                              const p = s.portions?.[id]
                              return p ? `${name} (${portionLabel(p)})` : name
                            })
                            .join(', ')}
                        </Text>
                      ) : null}
                      {s.timerSec ? (
                        <Text variant="small">Timer: {Math.round(s.timerSec / 60)} min</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}
      </Card>

      {v.nutrition ? <NutritionCard n={v.nutrition} servings={v.servings} /> : null}

      <Card>
        <SectionHeader title="Edit history" hint="Variations are mutable; every change is kept." />
        {v.history.map((h) => (
          <Text key={h.date + h.summary} variant="small" color={colors.ink}>
            {h.date} {'·'} {h.by} {'·'} {h.summary}
          </Text>
        ))}
      </Card>
    </View>
  )
}

function NutritionCard({
  n,
  servings,
}: {
  n: NonNullable<RecipeVersion['nutrition']>
  servings: number
}) {
  const rows: [string, number | undefined, string][] = [
    ['Calories', n.calories, ''],
    ['Protein', n.proteinG, ' g'],
    ['Carbs', n.carbsG, ' g'],
    ['Fat', n.fatG, ' g'],
    ['Fiber', n.fiberG, ' g'],
    ['Sugar', n.sugarG, ' g'],
    ['Sodium', n.sodiumMg, ' mg'],
  ]
  const shown = rows.filter(([, val]) => val != null)
  if (!shown.length) return null
  return (
    <Card>
      <SectionHeader
        title="Nutrition"
        hint={`${n.perServing === false ? 'For the whole recipe' : 'Per serving'}${
          n.source === 'ai' ? ' · estimated by AI, treat as approximate' : ''
        } · makes ${servings}`}
      />
      <View style={styles.wrapRow}>
        {shown.map(([label, val, unit]) => (
          <View key={label} style={{ minWidth: 88 }}>
            <Text variant="bodyStrong">
              {Math.round(val as number)}
              {unit}
            </Text>
            <Text variant="small" color={colors.muted}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  col: { gap: space.lg },
  cols: { gap: space.lg },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
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
