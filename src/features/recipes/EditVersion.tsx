import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, Pill, SectionHeader, Segmented, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useSaveVersion, useTags } from '@/lib/api/hooks'
import {
  COURSES,
  type Course,
  type Kind,
  type NutritionInfo,
  type Recipe,
  type RecipeVersion,
  type VersionEdit,
} from '@/lib/api/types'
import { fromEditorText, sameLines, toEditorText } from '@/lib/sections'
import { COURSE_LABEL } from '@/lib/strings'
import { colors, space } from '@/theme/tokens'

const NUTRITION_FIELDS = [
  ['calories', 'Calories'],
  ['proteinG', 'Protein (g)'],
  ['carbsG', 'Carbs (g)'],
  ['fatG', 'Fat (g)'],
  ['fiberG', 'Fiber (g)'],
  ['sugarG', 'Sugar (g)'],
  ['sodiumMg', 'Sodium (mg)'],
] as const
type NutritionKey = (typeof NUTRITION_FIELDS)[number][0]

const amount = (t: string) => {
  const n = Number(t.trim())
  return t.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n
}

/** Tags as typed: comma-separated, trimmed, blanks and repeats (any case) dropped. */
const parseTags = (text: string) => {
  const seen = new Set<string>()
  return text
    .split(',')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => {
      const k = t.toLowerCase()
      if (!t || seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** One link per line: "https://..." or "Label | https://...". Lines without a web address are dropped. */
const parseSources = (text: string) =>
  text.split('\n').flatMap((line) => {
    const [a, b] = line.includes('|') ? line.split('|', 2) : ['', line]
    const url = b.trim()
    if (!/^https?:\/\/\S+$/i.test(url)) return []
    return [{ url, ...(a.trim() && { label: a.trim() }) }]
  })
const sourcesText = (v: RecipeVersion) =>
  v.sources.map((s) => (s.label && s.label !== s.url ? `${s.label} | ${s.url}` : s.url)).join('\n')

const num = (t: string) => (t.trim() === '' ? undefined : Math.max(0, Math.round(Number(t))))

/**
 * Edit a version in place (every edit is kept in its history), or fork it as a new variation.
 * Ingredients and steps are plain text, one per line; the server reads the quantities. A "## Cake" line starts a
 * part of the recipe ("### Meringue" a part inside it), so a recipe can have a cake, a mousse and a ganache.
 */
export function EditVersion({
  recipe,
  version,
  mode,
  onDone,
  onCancel,
}: {
  recipe: Recipe
  version: RecipeVersion
  mode: 'edit' | 'variation'
  onDone: (versionId: string) => void
  onCancel: () => void
}) {
  const variation = mode === 'variation'
  const startIngredients = version.ingredients.map((l) => ({
    text: l.original,
    section: l.section,
  }))
  const startSteps = version.steps.map((s) => ({ text: s.text, section: s.section }))
  const [recipeTitle, setRecipeTitle] = useState(recipe.title)
  const [label, setLabel] = useState(
    variation ? '' : version.label === 'Original' ? '' : version.label,
  )
  const [course, setCourse] = useState<Course>(recipe.course)
  const [kind, setKind] = useState<Kind>(version.kind)
  const [servings, setServings] = useState(String(version.servings))
  const [active, setActive] = useState(String(version.activeMin))
  const [total, setTotal] = useState(String(version.totalMin))
  const [description, setDescription] = useState(version.description)
  const [ingredients, setIngredients] = useState(toEditorText(startIngredients))
  const [steps, setSteps] = useState(toEditorText(startSteps))
  const [nutrition, setNutrition] = useState<Record<NutritionKey, string>>(
    () =>
      Object.fromEntries(
        NUTRITION_FIELDS.map(([k]) => [
          k,
          version.nutrition?.[k] != null ? String(version.nutrition[k]) : '',
        ]),
      ) as Record<NutritionKey, string>,
  )
  const [tags, setTags] = useState(version.tags.join(', '))
  const [sources, setSources] = useState(sourcesText(version))
  const knownTags = useTags()
  const [wholeRecipe, setWholeRecipe] = useState(version.nutrition?.perServing === false)

  /** Only when a figure or the per-serving choice changed. Whatever a person types is theirs, not an AI estimate. */
  const nutritionEdit = (): { nutrition?: NutritionInfo | null } => {
    const next = Object.fromEntries(
      NUTRITION_FIELDS.flatMap(([k]) => {
        const v = amount(nutrition[k])
        return v === undefined ? [] : [[k, v]]
      }),
    ) as Partial<Record<NutritionKey, number>>
    const had = version.nutrition
    const unchanged =
      NUTRITION_FIELDS.every(([k]) => next[k] === (had?.[k] ?? undefined)) &&
      (wholeRecipe === (had?.perServing === false) || !Object.keys(next).length)
    if (unchanged) return {}
    if (!Object.keys(next).length) return had ? { nutrition: null } : {}
    return { nutrition: { ...next, perServing: !wholeRecipe, source: 'user' } }
  }

  const buildEdit = () => {
    const ing = fromEditorText(ingredients)
    const st = fromEditorText(steps)
    const edit: VersionEdit = {
      ...(!variation && recipeTitle.trim() !== recipe.title && { recipeTitle: recipeTitle.trim() }),
      ...(course !== recipe.course && { course }),
      ...(kind !== version.kind && { kind }),
      ...(num(servings) !== undefined &&
        num(servings) !== version.servings && { servings: num(servings) }),
      ...(num(active) !== undefined &&
        num(active) !== version.activeMin && { activeMin: num(active) }),
      ...(num(total) !== undefined && num(total) !== version.totalMin && { totalMin: num(total) }),
      ...(description !== version.description && { description }),
      ...(!sameTags(parseTags(tags), version.tags) && { tags: parseTags(tags) }),
      ...(sourcesText({
        sources: parseSources(sources).map((s) => ({ label: s.label ?? s.url, url: s.url })),
      } as RecipeVersion) !== sourcesText(version) && {
        sources: parseSources(sources),
      }),
      // Only rewrite the lists when they changed, so skip-impact and substitutions are kept otherwise.
      ...(!sameLines(ing, startIngredients) && { ingredients: ing }),
      ...(!sameLines(st, startSteps) && {
        // Keep each step's timer when its text is unchanged.
        steps: st.map((x) => {
          const was = version.steps.find((o) => o.text === x.text)
          return was?.timerSec
            ? { ...x, timerMin: was.timerSec / 60, timerLabel: was.timerLabel }
            : x
        }),
      }),
      ...nutritionEdit(),
    }
    return edit
  }
  const create = useApiMutation(
    (edit: VersionEdit) => api.createVariation(version.id, label.trim(), edit),
    stale.recipes,
  )
  // Waits only for the write: the page already shows the edit, and the refetch runs behind it.
  const update = useSaveVersion(recipe.id)
  const save = variation ? create : update
  const submit = async () => {
    const edit = buildEdit()
    try {
      if (variation) return onDone(await create.mutateAsync(edit))
      await update.mutateAsync({
        versionId: version.id,
        edit: {
          ...edit,
          ...(label.trim() && label.trim() !== version.label && { label: label.trim() }),
        },
      })
      onDone(version.id)
    } catch {
      // The error shows above the buttons; the form stays open so nothing typed is lost.
    }
  }

  const ready = (variation ? !!label.trim() : !!recipeTitle.trim()) && (num(servings) ?? 0) > 0
  return (
    <Card tone="subtle">
      <SectionHeader
        title={variation ? 'New variation' : 'Edit this version'}
        hint={
          variation
            ? 'A copy of this version with your changes. The original stays as it is.'
            : 'Every change is kept in the edit history.'
        }
      />
      {!variation ? (
        <TextField label="Recipe name" value={recipeTitle} onChangeText={setRecipeTitle} />
      ) : null}
      <TextField
        label={variation ? 'Name of the variation' : 'Version name'}
        value={label}
        onChangeText={setLabel}
        placeholder={variation ? 'e.g. Pesach, fudgy, doubled' : 'e.g. Fudgy'}
      />
      <View style={styles.group}>
        <Text variant="label">Course</Text>
        <View style={styles.row}>
          {COURSES.map((c) => (
            <Pill
              key={c}
              label={COURSE_LABEL[c]}
              selected={course === c}
              onPress={() => setCourse(c)}
            />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <Text variant="label">Meat, dairy or parve</Text>
        <Segmented
          options={[
            { value: 'meat', label: 'Meat' },
            { value: 'dairy', label: 'Dairy' },
            { value: 'parve', label: 'Parve' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </View>
      <View style={styles.row}>
        <TextField
          label="Servings (required)"
          value={servings}
          onChangeText={setServings}
          keyboardType="numeric"
        />
        <TextField
          label="Hands-on (min)"
          value={active}
          onChangeText={setActive}
          keyboardType="numeric"
        />
        <TextField
          label="Total (min)"
          value={total}
          onChangeText={setTotal}
          keyboardType="numeric"
        />
      </View>
      <TextField label="Description" value={description} onChangeText={setDescription} lines={2} />
      <View style={styles.group}>
        <TextField
          label="Tags"
          value={tags}
          onChangeText={setTags}
          placeholder="e.g. italian, spicy, one pot"
          hint={
            'Your own keywords, separated by commas. Search and filter find them. Tag a dish “spicy” to flag it for guests who can’t eat spicy food, and “kid friendly” to favour it when kids are coming. Tags are never checked for allergies.'
          }
        />
        <View style={styles.row}>
          {(knownTags.data ?? [])
            .filter((k) => !parseTags(tags).some((t) => t.toLowerCase() === k.tag.toLowerCase()))
            .slice(0, 12)
            .map((k) => (
              <Pill
                key={k.tag}
                label={`+ ${k.tag}`}
                dashed
                onPress={() => setTags([...parseTags(tags), k.tag].join(', '))}
              />
            ))}
        </View>
      </View>
      <TextField
        label="Original recipe links"
        value={sources}
        onChangeText={setSources}
        lines={2}
        placeholder="https://example.com/recipe"
        hint={
          'One per line: a website or a video. Add a name first if you like: “Savta’s video | https://…”.'
        }
      />
      <TextField
        label="Ingredients, one per line"
        value={ingredients}
        onChangeText={setIngredients}
        lines={8}
        hint="Write them as you would on a card: 2 cups flour, sifted. For a recipe in parts, put a line like ## Cake before each part, and ### Meringue for a part inside a part."
      />
      <TextField
        label="Steps, one per line"
        value={steps}
        onChangeText={setSteps}
        lines={8}
        hint="Steps can have their own ## headings, such as ## Assembly."
      />
      <View style={styles.group}>
        <Text variant="label">Nutrition (optional)</Text>
        <Segmented
          options={[
            { value: 'serving', label: 'Per serving' },
            { value: 'recipe', label: 'Whole recipe' },
          ]}
          value={wholeRecipe ? 'recipe' : 'serving'}
          onChange={(v) => setWholeRecipe(v === 'recipe')}
        />
        <View style={styles.row}>
          {NUTRITION_FIELDS.map(([k, label]) => (
            <TextField
              key={k}
              label={label}
              value={nutrition[k]}
              onChangeText={(t) => setNutrition((n) => ({ ...n, [k]: t }))}
              keyboardType="numeric"
            />
          ))}
        </View>
        <Text variant="small">
          Lets you and your AI find high-protein or high-fiber dishes. Stored per serving:
          whole-recipe figures are divided by Servings when you save. Leave blank if unknown.
        </Text>
      </View>
      {save.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(save.error as Error).message}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={variation ? 'Save variation' : 'Save changes'}
          disabled={!ready}
          loading={save.isPending}
          onPress={submit}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  )
}

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i])

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
})
