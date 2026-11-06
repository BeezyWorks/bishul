import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Card, Loading, Screen, SectionHeader, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, usePantry } from '@/lib/api/hooks'
import type { PantryItem } from '@/lib/api/types'
import { diffDays, shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function daysLeftLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

function Item({ it, today }: { it: PantryItem; today: string }) {
  const days = it.expires ? diffDays(today, it.expires) : undefined
  const expired = days !== undefined && days < 0
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(it.quantity === 'some' ? '' : it.quantity)
  const [exp, setExp] = useState(it.expires ?? '')
  const update = useApiMutation(
    () =>
      api.updatePantryItem(it.id, {
        quantity: qty,
        // Chametz may have no date of its own; an empty field leaves it as it is.
        expires: exp.trim() || undefined,
      }),
    stale.pantry,
  )
  const remove = useApiMutation(() => api.removePantryItem(it.id), stale.pantry)
  if (editing)
    return (
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Text variant="bodyStrong" style={{ width: '100%' }}>
          {it.name}
        </Text>
        <TextField label="How much (optional)" value={qty} onChangeText={setQty} />
        <TextField label="Use by" value={exp} onChangeText={setExp} placeholder="YYYY-MM-DD" />
        <Button
          label="Save"
          small
          loading={update.isPending}
          disabled={!!exp && !DATE.test(exp)}
          onPress={() => update.mutate(undefined, { onSuccess: () => setEditing(false) })}
        />
        <Button label="Cancel" small variant="ghost" onPress={() => setEditing(false)} />
        {update.error ? <Text color={colors.danger}>{(update.error as Error).message}</Text> : null}
      </View>
    )
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{it.name}</Text>
        <Text variant="small">
          {[
            it.quantity !== 'some' ? it.quantity : null,
            it.expires && `use by ${shortDate(it.expires)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {it.heldFor ? <Badge label={`Held for ${it.heldFor}`} tone="info" /> : null}
      </View>
      {days !== undefined && days >= 0 && days <= 7 ? (
        <Badge label={daysLeftLabel(days)} tone="warn" />
      ) : null}
      {!expired ? (
        <Button
          label="Edit"
          variant="ghost"
          small
          accessibilityLabel={`Edit ${it.name}`}
          onPress={() => setEditing(true)}
        />
      ) : null}
      <Button
        label={expired ? 'Clear' : 'Used it'}
        variant="ghost"
        small
        accessibilityLabel={expired ? `Clear ${it.name}` : `Used up ${it.name}`}
        loading={remove.isPending}
        onPress={() => remove.mutate(undefined)}
      />
    </View>
  )
}

export function UseSoonScreen() {
  const { data, isLoading } = usePantry()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [exp, setExp] = useState('')
  const add = useApiMutation(
    (i: { name: string; quantity: string; expires?: string }) => api.addPantryItem(i),
    stale.pantry,
  )
  if (isLoading || !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const expired = data.items.filter((i) => i.expires && diffDays(data.today, i.expires) < 0)
  const current = data.items.filter((i) => !expired.includes(i))
  const validExp = !exp || DATE.test(exp)

  return (
    <Screen
      title="Use soon"
      subtitle="Things to use up before they go bad, soonest first. Suggestions favor dishes that use them, and accepted menus hold what they need."
    >
      {expired.length ? (
        <Card tone="danger">
          <SectionHeader title="Past their date" hint="Never suggested. Clear them out." />
          {expired.map((i) => (
            <Item key={i.id} it={i} today={data.today} />
          ))}
        </Card>
      ) : null}
      <Card>
        {current.length === 0 ? (
          <Text color={colors.muted}>
            Nothing to use up. Add the chicken in the fridge or the half bag of spinach, and menus
            will use it before it goes bad.
          </Text>
        ) : null}
        {current.map((i) => (
          <Item key={i.id} it={i} today={data.today} />
        ))}
      </Card>
      <Card tone="subtle">
        <SectionHeader title="Add something to use up" />
        <View style={styles.form}>
          <TextField label="Item" value={name} onChangeText={setName} placeholder="e.g. Pargiyot" />
          <TextField
            label="Use by"
            value={exp}
            onChangeText={setExp}
            placeholder="YYYY-MM-DD"
            hint={validExp ? undefined : 'Use YYYY-MM-DD'}
          />
          <TextField
            label="How much (optional)"
            value={qty}
            onChangeText={setQty}
            placeholder="e.g. 500 g or 3"
          />
        </View>
        <Button
          label="Add"
          disabled={!name.trim() || !validExp}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              { name: name.trim(), quantity: qty, expires: exp || undefined },
              {
                onSuccess: () => {
                  setName('')
                  setQty('')
                  setExp('')
                },
              },
            )
          }
        />
        {add.error ? <Text color={colors.danger}>{(add.error as Error).message}</Text> : null}
      </Card>
      <Text variant="small" color={colors.muted}>
        Not for staples like sugar, rice or oil. Chametz can go in without a date: it's used up
        before Pesach.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  form: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
})
