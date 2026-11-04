import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { useApiMutation } from '@/lib/api/hooks'
import { api } from '@/lib/api/client'
import type { ISODate } from '@/lib/api/types'
import { weekday } from '@/lib/dates'
import { space } from '@/theme/tokens'

import { Button } from './Button'
import { Pill } from './Pill'
import { TextField } from './TextField'

function presets(date: ISODate): string[] {
  const wd = weekday(date)
  if (wd === 5) return ['Leil Shabbat', 'Friday lunch']
  if (wd === 6) return ['Shabbat lunch', 'Seudah shlishit']
  return ['Dinner', 'Lunch']
}

/** "+ Add a meal": nothing is pre-created. Pick a name (or type one) and the plan opens. */
export function AddMeal({
  date,
  onCreated,
  compact,
}: {
  date: ISODate
  onCreated?: (id: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const router = useRouter()
  const create = useApiMutation(async (n: string) => {
    const m = await api.createMeal(date, n)
    return m
  })
  const make = async (n: string) => {
    const m = await create.mutateAsync(n)
    setOpen(false)
    setName('')
    if (onCreated) onCreated(m.id)
    else router.push(`/meal/${m.id}` as Href)
  }
  if (!open)
    return (
      <Button label="+ Add a meal" variant="soft" small={compact} onPress={() => setOpen(true)} />
    )
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        {presets(date).map((p) => (
          <Pill key={p} label={p} onPress={() => make(p)} />
        ))}
      </View>
      <View style={styles.row}>
        <TextField
          label="Or name it"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Kiddush lunch"
          onSubmitEditing={() => name.trim() && make(name)}
        />
        <Button label="Add" disabled={!name.trim()} onPress={() => make(name)} />
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'flex-end' },
})
