import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { api } from '@/lib/api/client'
import { stale, useApiMutation } from '@/lib/api/hooks'
import type { ISODate } from '@/lib/api/types'
import { weekday } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

import { Button } from './Button'
import { Pill } from './Pill'
import { Text } from './Text'
import { TextField } from './TextField'

function presets(date: ISODate): { name: string; time: string }[] {
  const wd = weekday(date)
  if (wd === 5)
    return [
      { name: 'Leil Shabbat', time: '18:30' },
      { name: 'Friday lunch', time: '12:30' },
    ]
  if (wd === 6)
    return [
      { name: 'Shabbat lunch', time: '13:00' },
      { name: 'Seudah shlishit', time: '17:00' },
    ]
  return [
    { name: 'Dinner', time: '18:30' },
    { name: 'Lunch', time: '12:30' },
  ]
}

/** "+ Add a meal": nothing is pre-created. Pick a name (or type one), set a time, and the plan opens. */
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
  const [time, setTime] = useState('')
  const router = useRouter()
  const create = useApiMutation(
    (m: { name: string; time?: string }) => api.createMeal(date, m.name, m.time),
    stale.meal,
  )
  const make = async (n: string, t = time) => {
    const m = await create.mutateAsync({ name: n.trim(), time: t.trim() || undefined })
    setOpen(false)
    setName('')
    setTime('')
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
          <Pill key={p.name} label={p.name} onPress={() => make(p.name, time || p.time)} />
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
        <View style={styles.time}>
          <TextField
            label="Time (optional)"
            value={time}
            onChangeText={setTime}
            placeholder="18:30"
            onSubmitEditing={() => name.trim() && make(name)}
          />
        </View>
        <Button
          label="Add"
          disabled={!name.trim()}
          loading={create.isPending}
          onPress={() => make(name)}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </View>
      {create.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(create.error as Error).message}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'flex-end' },
  time: { width: 130, flexGrow: 0 },
})
