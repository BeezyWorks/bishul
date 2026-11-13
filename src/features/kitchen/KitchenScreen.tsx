import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Loading,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useKitchen } from '@/lib/api/hooks'
import type { KitchenItem } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

type Designation = NonNullable<KitchenItem['designation']> | 'none'

const OPTIONS: { value: Designation; label: string }[] = [
  { value: 'meat', label: 'Meat' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'parve', label: 'Parve' },
  { value: 'pesach', label: 'Pesach' },
  { value: 'none', label: 'Any' },
]

const LABEL: Record<NonNullable<KitchenItem['designation']>, string> = {
  meat: 'Meat',
  dairy: 'Dairy',
  parve: 'Parve',
  pesach: 'Pesach',
}

const toServer = (d: Designation): KitchenItem['designation'] => (d === 'none' ? null : d)

function Item({ it }: { it: KitchenItem }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(it.item)
  const [count, setCount] = useState(String(it.count))
  const [des, setDes] = useState<Designation>(it.designation ?? 'none')
  const update = useApiMutation(
    () =>
      api.updateEquipment(it.id, {
        item: name.trim(),
        count: Math.max(0, parseInt(count, 10) || 0),
        designation: toServer(des),
      }),
    stale.kitchen,
  )
  const remove = useApiMutation(() => api.removeEquipment(it.id), stale.kitchen)
  if (editing)
    return (
      <View style={styles.form}>
        <TextField label="Item" value={name} onChangeText={setName} />
        <TextField
          label="How many"
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
        />
        <View style={styles.group}>
          <Text variant="label">Kept for</Text>
          <Segmented options={OPTIONS} value={des} onChange={setDes} />
        </View>
        <View style={styles.actions}>
          <Button
            label="Save"
            small
            loading={update.isPending}
            disabled={!name.trim()}
            onPress={() => update.mutate(undefined, { onSuccess: () => setEditing(false) })}
          />
          <Button label="Cancel" small variant="ghost" onPress={() => setEditing(false)} />
        </View>
        {update.error ? <Text color={colors.danger}>{(update.error as Error).message}</Text> : null}
      </View>
    )
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{it.item}</Text>
        {it.count !== 1 ? <Text variant="small">{it.count} in the kitchen</Text> : null}
      </View>
      {it.designation ? <Badge label={LABEL[it.designation]} /> : null}
      <Button
        label="Edit"
        variant="ghost"
        small
        accessibilityLabel={`Edit ${it.item}`}
        onPress={() => setEditing(true)}
      />
      <Button
        label="Remove"
        variant="ghost"
        small
        accessibilityLabel={`Remove ${it.item}`}
        loading={remove.isPending}
        onPress={() => remove.mutate(undefined)}
      />
    </View>
  )
}

export function KitchenScreen() {
  const { data, isLoading } = useKitchen()
  const [name, setName] = useState('')
  const [count, setCount] = useState('1')
  const [des, setDes] = useState<Designation>('none')
  const add = useApiMutation(
    (i: { item: string; count: number; designation: KitchenItem['designation'] }) =>
      api.addEquipment(i),
    stale.kitchen,
  )
  if (isLoading || !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const item = name.replace(/\s+/g, ' ').trim()
  const have = data.some((e) => e.item.toLowerCase() === item.toLowerCase())
  const submit = () => {
    if (!item || have) return
    add.mutate(
      { item, count: Math.max(1, parseInt(count, 10) || 1), designation: toServer(des) },
      {
        onSuccess: () => {
          setName('')
          setCount('1')
          setDes('none')
        },
      },
    )
  }

  return (
    <Screen
      title="Kitchen equipment"
      subtitle="What your household has, and what each piece is kept for (meat, dairy, parve or Pesach)."
    >
      <Card>
        {data.length === 0 ? (
          <Text color={colors.muted}>
            Nothing listed yet. Add your pots, pans and appliances below.
          </Text>
        ) : null}
        {data.map((e) => (
          <Item key={e.id} it={e} />
        ))}
      </Card>
      <Card tone="subtle">
        <SectionHeader title="Add equipment" />
        <View style={styles.form}>
          <TextField
            label="Item"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dairy 9×13 pan, Pesach pot"
            onSubmitEditing={submit}
          />
          <TextField
            label="How many"
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
          />
          <View style={styles.group}>
            <Text variant="label">Kept for</Text>
            <Segmented options={OPTIONS} value={des} onChange={setDes} />
          </View>
          {have ? <Text variant="small">Already listed.</Text> : null}
          <View style={styles.actions}>
            <Button
              label="Add"
              small
              loading={add.isPending}
              disabled={!item || have}
              onPress={submit}
            />
          </View>
          {add.error ? <Text color={colors.danger}>{(add.error as Error).message}</Text> : null}
        </View>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  form: { gap: space.md },
  group: { gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
})
