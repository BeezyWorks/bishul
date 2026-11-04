import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Card, Loading, Screen, SectionHeader, Text, TextField } from '@/components'
import { api } from '@/lib/api/client'
import { useApiMutation, usePantry } from '@/lib/api/hooks'
import type { PantryItem } from '@/lib/api/types'
import { diffDays, shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

function Item({ it, today }: { it: PantryItem; today: string }) {
  const days = it.expires ? diffDays(today, it.expires) : undefined
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{it.name}</Text>
        <Text variant="small">
          {it.quantity}
          {it.location ? ` · ${it.location}` : ''}
          {it.expires ? ` · expires ${shortDate(it.expires)}` : ''}
        </Text>
        {it.heldFor ? <Badge label={`Held for ${it.heldFor}`} tone="info" /> : null}
      </View>
      {days !== undefined && days < 0 ? <Badge label="Expired" tone="danger" /> : null}
      {days !== undefined && days >= 0 && days <= 7 ? (
        <Badge
          label={days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} left`}
          tone="warn"
        />
      ) : null}
    </View>
  )
}

export function PantryScreen() {
  const { data, isLoading } = usePantry()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [exp, setExp] = useState('')
  const add = useApiMutation((i: { name: string; quantity: string; expires?: string }) =>
    api.addPantryItem(i),
  )
  if (isLoading || !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const soon = data.items.filter(
    (i) =>
      i.expires && diffDays(data.today, i.expires) >= 0 && diffDays(data.today, i.expires) <= 7,
  )
  const expired = data.items.filter((i) => i.expires && diffDays(data.today, i.expires) < 0)
  const rest = data.items.filter((i) => !soon.includes(i) && !expired.includes(i))
  const validExp = !exp || /^\d{4}-\d{2}-\d{2}$/.test(exp)

  return (
    <Screen
      title="Pantry"
      subtitle="Expired items are never suggested. Items expiring soon are used first. Accepted menus hold what they need."
    >
      {soon.length ? (
        <Card tone="warn">
          <SectionHeader title="Expiring soon" hint="Menus that use these are ranked higher." />
          {soon.map((i) => (
            <Item key={i.id} it={i} today={data.today} />
          ))}
        </Card>
      ) : null}
      <Card>
        <SectionHeader title="Everything else" />
        {rest.map((i) => (
          <Item key={i.id} it={i} today={data.today} />
        ))}
      </Card>
      {expired.length ? (
        <Card tone="danger">
          <SectionHeader
            title="Expired"
            hint="Not counted in the shopping list and never suggested."
          />
          {expired.map((i) => (
            <Item key={i.id} it={i} today={data.today} />
          ))}
        </Card>
      ) : null}
      <Card tone="subtle">
        <SectionHeader title="Add item" />
        <View style={styles.form}>
          <TextField label="Item" value={name} onChangeText={setName} placeholder="e.g. Tahini" />
          <TextField
            label="Quantity"
            value={qty}
            onChangeText={setQty}
            placeholder="e.g. 500 g or 3"
          />
          <TextField
            label="Expires (optional)"
            value={exp}
            onChangeText={setExp}
            placeholder="YYYY-MM-DD"
            hint={validExp ? undefined : 'Use YYYY-MM-DD'}
          />
        </View>
        <Button
          label="Add to pantry"
          disabled={!name.trim() || !validExp}
          loading={add.isPending}
          onPress={async () => {
            await add.mutateAsync({ name: name.trim(), quantity: qty, expires: exp || undefined })
            setName('')
            setQty('')
            setExp('')
          }}
        />
      </Card>
      <Text variant="small" color={colors.muted}>
        Chametz items get an earlier effective expiry before Pesach.
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
