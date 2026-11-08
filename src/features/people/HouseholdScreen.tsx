import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  ConstraintText,
  ListRow,
  Loading,
  Pill,
  Screen,
  SectionHeader,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useContacts, useHousehold } from '@/lib/api/hooks'
import { parseBirthInput } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

import { combinedConstraints, displayName, householdCounts, labelOf } from './householdText'

/** A household opened from the People list: its members, each linking to PersonScreen for constraints. */
export function HouseholdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const own = useHousehold()
  const contacts = useContacts()
  const [adding, setAdding] = useState(false)
  if (!own.data || !contacts.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const h = [own.data, ...contacts.data].find((x) => x.id === id)
  if (!h)
    return (
      <Screen title="Household not found" back={{ label: 'People', href: '/people' }}>
        <Text>We could not find that household.</Text>
      </Screen>
    )
  return (
    <Screen
      back={{ label: 'People', href: '/people' }}
      title={displayName(h)}
      subtitle={[householdCounts(h), h.note].filter(Boolean).join(' · ')}
      actions={adding ? null : <Button label="+ Person" small onPress={() => setAdding(true)} />}
    >
      {adding ? <AddPerson household={h} onDone={() => setAdding(false)} /> : null}
      <Card>
        {h.people.length === 0 ? (
          <Text color={colors.muted}>No one here yet. Add the people and what they can’t eat.</Text>
        ) : null}
        {h.people.map((p, i) => (
          <ListRow
            key={p.id}
            title={p.name}
            subtitle={[p.isChild ? 'Child' : '', p.age ? `age ${p.age}` : '', p.relation]
              .filter(Boolean)
              .join(' · ')}
            href={`/people/${p.id}`}
            last={i === h.people.length - 1}
          >
            <View style={styles.row}>
              {p.link ? <Badge label="Linked profile" tone="accent" /> : null}
              {p.constraints.length === 0 ? (
                <Text variant="small" color={colors.muted}>
                  No constraints
                </Text>
              ) : (
                <ConstraintText constraints={labelOf(p)} />
              )}
            </View>
          </ListRow>
        ))}
      </Card>
      {h.people.length > 1 ? (
        <Text variant="small" color={colors.muted}>
          Together: <ConstraintText constraints={combinedConstraints(h.people)} />
        </Text>
      ) : null}
    </Screen>
  )
}

function AddPerson({
  household,
  onDone,
}: {
  household: { id: string; isOwn: boolean }
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [child, setChild] = useState(false)
  const [birth, setBirth] = useState('')
  const born = birth.trim() ? parseBirthInput(birth) : null
  const add = useApiMutation(
    () =>
      api.addPerson({
        name: name.trim(),
        isChild: child,
        ...born,
        ...(household.isOwn ? {} : { contactHouseholdId: household.id }),
      }),
    stale.people,
  )
  return (
    <Card tone="subtle">
      <SectionHeader title="Add a person" />
      <TextField label="Name" value={name} onChangeText={setName} />
      <View style={styles.row}>
        <Pill label="Child" selected={child} onPress={() => setChild(!child)} />
      </View>
      <TextField
        label="Birthday or age (optional)"
        value={birth}
        onChangeText={setBirth}
        placeholder="YYYY-MM-DD, or just 5"
      />
      {birth.trim() && !born ? (
        <Text variant="small">Use a date like 2020-03-14, or a whole number for an age.</Text>
      ) : null}
      {add.error ? <Text>{(add.error as Error).message}</Text> : null}
      <View style={styles.row}>
        <Button
          label="Add person"
          disabled={!name.trim() || (!!birth.trim() && !born)}
          loading={add.isPending}
          onPress={async () => {
            const p = await add.mutateAsync(undefined)
            router.push(`/people/${p.id}` as Href)
            onDone()
          }}
        />
        <Button label="Cancel" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2, alignItems: 'center' },
})
