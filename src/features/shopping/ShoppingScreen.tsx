import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Loading,
  Screen,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useShopping } from '@/lib/api/hooks'
import type { ShoppingLine } from '@/lib/api/types'
import { colors, space } from '@/theme/tokens'

export function ShoppingScreen() {
  const { data, isLoading } = useShopping()
  const [name, setName] = useState('')
  const check = useApiMutation(
    (a: { id: string; checked: boolean }) => api.setShoppingChecked(a.id, a.checked),
    stale.shopping,
  )
  const order = useApiMutation((ids: string[]) => api.setShoppingOrder(ids), stale.shopping)
  const add = useApiMutation((n: string) => api.addShoppingLine(n), stale.shopping)
  const del = useApiMutation((id: string) => api.removeShoppingLine(id), stale.shopping)
  const move = (id: string, dir: 'up' | 'down') => {
    const ids = (data ?? []).map((l) => l.id)
    const i = ids.indexOf(id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    order.mutate(ids)
  }
  const submit = async () => {
    if (!name.trim()) return
    await add.mutateAsync(name.trim())
    setName('')
  }
  const left = (data ?? []).filter((l) => !l.checked).length

  return (
    <Screen
      title="Shopping list"
      subtitle="Totals across your accepted meals, minus what is in the pantry. Reorder to match your route."
    >
      {isLoading || !data ? (
        <Loading />
      ) : (
        <Card>
          <Text variant="small">
            {left} to buy, {data.length - left} checked
          </Text>
          {data.length === 0 ? (
            <Empty>Nothing to buy yet. Accept a meal and its ingredients appear here, or add your own.</Empty>
          ) : null}
          {data.map((l, i) => (
            <Line
              key={l.id}
              line={l}
              first={i === 0}
              last={i === data.length - 1}
              onCheck={(checked) => check.mutate({ id: l.id, checked })}
              onMove={(dir) => move(l.id, dir)}
              onRemove={l.custom ? () => del.mutate(l.id) : undefined}
            />
          ))}
          <View style={styles.add}>
            <TextField
              label="Add something"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Tin foil"
              onSubmitEditing={submit}
            />
            <Button label="+ Add" disabled={!name.trim()} onPress={submit} />
          </View>
        </Card>
      )}
    </Screen>
  )
}

function Line({
  line,
  first,
  last,
  onCheck,
  onMove,
  onRemove,
}: {
  line: ShoppingLine
  first: boolean
  last: boolean
  onCheck: (c: boolean) => void
  onMove: (d: 'up' | 'down') => void
  onRemove?: () => void
}) {
  return (
    <View style={styles.row}>
      <Checkbox label={`Bought ${line.name}`} checked={line.checked} onChange={onCheck} />
      <View style={styles.main}>
        <Text variant="bodyStrong" style={line.checked && styles.done}>
          {line.name}
        </Text>
        {line.need || line.have ? (
          <Text variant="small">
            {line.need ? `need ${line.need}` : ''}
            {line.need && line.have ? ' · ' : ''}
            {line.have ? `you have ${line.have}` : ''}
          </Text>
        ) : null}
        {line.note ? <Badge label={line.note} tone="info" /> : null}
      </View>
      <View style={styles.move}>
        {onRemove ? (
          <Button
            label="Remove"
            accessibilityLabel={`Remove ${line.name}`}
            variant="ghost"
            small
            onPress={onRemove}
          />
        ) : null}
        <Button
          label={'↑'}
          accessibilityLabel={`Move ${line.name} up`}
          variant="ghost"
          small
          disabled={first}
          onPress={() => onMove('up')}
        />
        <Button
          label={'↓'}
          accessibilityLabel={`Move ${line.name} down`}
          variant="ghost"
          small
          disabled={last}
          onPress={() => onMove('down')}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: space.xs,
  },
  main: { flex: 1, gap: 4, paddingVertical: space.xs },
  done: { textDecorationLine: 'line-through', color: colors.muted },
  move: { flexDirection: 'row' },
  add: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end', flexWrap: 'wrap' },
})
