import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button, Pill, Text, TextField } from '@/components'
import { useSaveVersion } from '@/lib/api/hooks'
import type { Cost, Difficulty, RecipeVersion, VersionEdit } from '@/lib/api/types'
import { formatMinutes } from '@/lib/units'
import { colors, radius, space } from '@/theme/tokens'

type Field = 'servings' | 'activeMin' | 'totalMin' | 'difficulty' | 'cost' | 'serving'

const DIFFICULTIES: Difficulty[] = ['easy', 'average', 'a pain']
const COSTS: Cost[] = ['$', '$$', '$$$']
const SERVINGS: RecipeVersion['serving'][] = ['hot', 'room temperature', 'cold']

/**
 * The summary tiles at the top of a recipe. Tap one to change it in place; choices save the moment
 * you pick, numbers save on Enter or Save. Edits are kept in the version's history like any other.
 */
export function EditableTiles({ v, scale }: { v: RecipeVersion; scale: number }) {
  const [open, setOpen] = useState<Field | null>(null)
  const save = useSaveVersion(v.recipeId)
  // The tile shows the new value at once; if the save fails it goes back and the error shows below.
  const commit = (edit: VersionEdit, close = true) => {
    save.mutate({ versionId: v.id, edit })
    if (close) setOpen(null)
  }
  const close = () => setOpen(null)

  const tile = (field: Field, label: string, value: string, editor: React.ReactNode) => (
    <Tile
      key={field}
      label={label}
      value={value}
      open={open === field}
      onOpen={() => setOpen(field)}
    >
      {editor}
    </Tile>
  )

  return (
    <View style={styles.col}>
      <View style={styles.tiles}>
        {tile(
          'servings',
          'Serves',
          String(Math.round(v.servings * scale)),
          <NumberEditor
            label="Servings the recipe makes"
            value={v.servings}
            step={1}
            onSave={(servings) => commit({ servings })}
            onCancel={close}
          />,
        )}
        {tile(
          'activeMin',
          'Hands-on',
          formatMinutes(v.activeMin),
          <NumberEditor
            label="Hands-on minutes"
            value={v.activeMin}
            step={5}
            onSave={(activeMin) => commit({ activeMin })}
            onCancel={close}
          />,
        )}
        {tile(
          'totalMin',
          'Total',
          formatMinutes(v.totalMin),
          <NumberEditor
            label="Total minutes"
            value={v.totalMin}
            step={5}
            onSave={(totalMin) => commit({ totalMin })}
            onCancel={close}
          />,
        )}
        {tile(
          'difficulty',
          'Difficulty',
          v.difficulty,
          <Choices
            options={DIFFICULTIES}
            value={v.difficulty}
            onPick={(difficulty) => commit({ difficulty })}
          />,
        )}
        {tile(
          'cost',
          'Cost',
          v.cost,
          <Choices options={COSTS} value={v.cost} onPick={(cost) => commit({ cost })} />,
        )}
        {tile(
          'serving',
          'Served',
          v.serving + (v.holdsOnBlech ? ', holds on the blech' : ''),
          <View style={styles.col}>
            <Choices
              options={SERVINGS}
              value={v.serving}
              onPick={(serving) => commit({ serving }, false)}
            />
            <View style={styles.row}>
              <Pill
                label="Holds on the blech"
                selected={v.holdsOnBlech}
                onPress={() => commit({ holdsOnBlech: !v.holdsOnBlech }, false)}
              />
              <Button label="Done" small variant="ghost" onPress={close} />
            </View>
          </View>,
        )}
      </View>
      {save.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(save.error as Error).message}
        </Text>
      ) : null}
    </View>
  )
}

function Tile({
  label,
  value,
  open,
  onOpen,
  children,
}: {
  label: string
  value: string
  open: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to change.`}
      onPress={open ? undefined : onOpen}
      style={[styles.tile, open && styles.tileOpen]}
    >
      <View style={styles.tileHead}>
        <Text variant="label">{label}</Text>
        {open ? null : (
          <Text variant="small" color={colors.muted}>
            {'✎'}
          </Text>
        )}
      </View>
      {open ? children : <Text variant="h3">{value}</Text>}
    </Pressable>
  )
}

function Choices<T extends string>({
  options,
  value,
  onPick,
}: {
  options: T[]
  value: T
  onPick: (o: T) => void
}) {
  return (
    <View style={styles.row}>
      {options.map((o) => (
        <Pill key={o} label={o} selected={o === value} onPress={() => onPick(o)} />
      ))}
    </View>
  )
}

function NumberEditor({
  label,
  value,
  step,
  onSave,
  onCancel,
}: {
  label: string
  value: number
  step: number
  onSave: (n: number) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(String(value))
  const n = Math.max(0, Math.round(Number(text)))
  const valid = text.trim() !== '' && Number.isFinite(n)
  const submit = () => {
    if (!valid) return
    if (n === value) onCancel()
    else onSave(n)
  }
  const bump = (d: number) => setText(String(Math.max(0, (valid ? n : value) + d)))
  return (
    <View style={styles.col}>
      <View style={styles.row}>
        <Button
          label="−"
          small
          variant="secondary"
          accessibilityLabel="Less"
          onPress={() => bump(-step)}
        />
        <View style={styles.input}>
          <TextField
            accessibilityLabel={label}
            value={text}
            onChangeText={setText}
            keyboardType="numeric"
            autoFocus
            selectTextOnFocus
            onSubmitEditing={submit}
          />
        </View>
        <Button
          label="+"
          small
          variant="secondary"
          accessibilityLabel="More"
          onPress={() => bump(step)}
        />
      </View>
      <View style={styles.row}>
        <Button label="Save" small disabled={!valid} onPress={submit} />
        <Button label="Cancel" small variant="ghost" onPress={onCancel} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  col: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-start' },
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
  tileOpen: { borderColor: colors.accent, flexBasis: 240, gap: space.sm },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { width: 80 },
})
