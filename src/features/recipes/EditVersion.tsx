import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, Pill, SectionHeader, Segmented, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation } from '@/lib/api/hooks'
import { COURSES, type Course, type Kind, type Recipe, type RecipeVersion } from '@/lib/api/types'
import { COURSE_LABEL } from '@/lib/strings'
import { colors, space } from '@/theme/tokens'

const lines = (t: string) =>
  t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
const num = (t: string) => (t.trim() === '' ? undefined : Math.max(0, Math.round(Number(t))))

/**
 * Edit a version in place (every edit is kept in its history), or fork it as a new variation.
 * Ingredients and steps are plain text, one per line; the server reads the quantities.
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
  const startIngredients = version.ingredients.map((l) => l.original)
  const startSteps = version.steps.map((s) => s.text)
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
  const [ingredients, setIngredients] = useState(startIngredients.join('\n'))
  const [steps, setSteps] = useState(startSteps.join('\n'))

  const save = useApiMutation(async () => {
    const ing = lines(ingredients)
    const st = lines(steps)
    const edit = {
      ...(!variation && recipeTitle.trim() !== recipe.title && { recipeTitle: recipeTitle.trim() }),
      ...(course !== recipe.course && { course }),
      ...(kind !== version.kind && { kind }),
      ...(num(servings) !== undefined &&
        num(servings) !== version.servings && { servings: num(servings) }),
      ...(num(active) !== undefined &&
        num(active) !== version.activeMin && { activeMin: num(active) }),
      ...(num(total) !== undefined && num(total) !== version.totalMin && { totalMin: num(total) }),
      ...(description !== version.description && { description }),
      // Only rewrite the lists when they changed, so skip-impact and substitutions are kept otherwise.
      ...(!same(ing, startIngredients) && { ingredients: ing }),
      ...(!same(st, startSteps) && { steps: st }),
    }
    if (variation) return api.createVariation(version.id, label.trim(), edit)
    await api.saveVersion(version.id, {
      ...edit,
      ...(label.trim() && label.trim() !== version.label && { label: label.trim() }),
    })
    return version.id
  }, stale.recipes)

  const ready = variation ? !!label.trim() : !!recipeTitle.trim()
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
          label="Servings"
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
      <TextField
        label="Ingredients, one per line"
        value={ingredients}
        onChangeText={setIngredients}
        lines={8}
        hint="Write them as you would on a card: 2 cups flour, sifted"
      />
      <TextField label="Steps, one per line" value={steps} onChangeText={setSteps} lines={8} />
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
          onPress={async () => onDone(await save.mutateAsync(undefined))}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
})
