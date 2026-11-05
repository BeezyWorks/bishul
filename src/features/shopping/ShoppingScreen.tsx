import React, { useRef, useState } from 'react'
import { PanResponder, Platform, StyleSheet, View } from 'react-native'

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
  const moveTo = (id: string, to: number) => {
    const ids = (data ?? []).map((l) => l.id)
    const i = ids.indexOf(id)
    if (i < 0 || to === i) return
    ids.splice(to, 0, ids.splice(i, 1)[0])
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
      subtitle="Totals across your accepted meals, minus what is in the pantry. Drag the handle to match your route."
    >
      {isLoading || !data ? (
        <Loading />
      ) : (
        <Card>
          <Text variant="small">
            {left} to buy, {data.length - left} checked
          </Text>
          {data.length === 0 ? (
            <Empty>
              Nothing to buy yet. Accept a meal and its ingredients appear here, or add your own.
            </Empty>
          ) : null}
          {data.map((l, i) => (
            <Line
              key={l.id}
              line={l}
              index={i}
              count={data.length}
              onCheck={(checked) => check.mutate({ id: l.id, checked })}
              onMoveTo={(to) => moveTo(l.id, to)}
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
  index,
  count,
  onCheck,
  onMoveTo,
  onRemove,
}: {
  line: ShoppingLine
  index: number
  count: number
  onCheck: (c: boolean) => void
  onMoveTo: (to: number) => void
  onRemove?: () => void
}) {
  const [dy, setDy] = useState<number | null>(null)
  const height = useRef(48)
  const latest = useRef({ index, count, onMoveTo })
  latest.current = { index, count, onMoveTo }
  const target = (d: number) => {
    const { index: i, count: n } = latest.current
    return Math.max(0, Math.min(n - 1, i + Math.round(d / height.current)))
  }
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => setDy(0),
      onPanResponderMove: (_, g) => setDy(g.dy),
      onPanResponderRelease: (_, g) => {
        setDy(null)
        latest.current.onMoveTo(target(g.dy))
      },
      onPanResponderTerminate: () => setDy(null),
    }),
  ).current
  const dragging = dy !== null
  return (
    <View
      style={[
        styles.row,
        dragging && {
          transform: [{ translateY: dy }],
          zIndex: 10,
          backgroundColor: colors.surface,
        },
      ]}
      onLayout={(e) => {
        height.current = e.nativeEvent.layout.height
      }}
    >
      <View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={`Drag to reorder ${line.name}`}
        style={styles.handle}
      >
        <Text variant="bodyStrong" style={styles.grip}>
          ⠿
        </Text>
      </View>
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
  handle: {
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object)
      : {}),
  },
  grip: { color: colors.muted },
  add: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end', flexWrap: 'wrap' },
})
