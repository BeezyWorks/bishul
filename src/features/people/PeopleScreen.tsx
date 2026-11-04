import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
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
import type { Constraint, Person } from '@/lib/api/types'
import { colors, space, type Tone } from '@/theme/tokens'

export function constraintTone(c: Constraint): Tone {
  if (c.kind === 'medical') return c.severity === 'strict' ? 'danger' : 'warn'
  if (c.kind === 'religious') return c.tagType === 'kashrut-sourcing' ? 'info' : 'warn'
  return 'muted'
}

function PersonRow({ p, last }: { p: Person; last: boolean }) {
  return (
    <ListRow
      title={p.name}
      subtitle={[p.relation, p.age ? `age ${p.age}` : ''].filter(Boolean).join(' · ')}
      href={`/people/${p.id}`}
      last={last}
    >
      <View style={styles.badges}>
        {p.link ? <Badge label="Linked profile" tone="accent" /> : null}
        {p.constraints.map((c) => (
          <Badge key={c.id} label={c.label} tone={constraintTone(c)} />
        ))}
        {p.constraints.length === 0 ? <Badge label="No constraints" tone="muted" /> : null}
      </View>
    </ListRow>
  )
}

/** Adds a person to the household, to a contact household, or starts a new contact household. */
function AddPerson() {
  const router = useRouter()
  const contacts = useContacts()
  const [name, setName] = useState('')
  const [where, setWhere] = useState<string>('new')
  const [group, setGroup] = useState('')
  const [child, setChild] = useState(false)
  const add = useApiMutation(
    () =>
      api.addPerson({
        name: name.trim(),
        isChild: child,
        ...(where === 'new'
          ? { newContactHousehold: group.trim() || name.trim() }
          : where === 'mine'
            ? {}
            : { contactHouseholdId: where }),
      }),
    stale.people,
  )
  return (
    <Card tone="subtle">
      <SectionHeader title="Add a person" hint="Guests go in a contact household; family goes in yours." />
      <TextField label="Name" value={name} onChangeText={setName} />
      <View style={styles.badges}>
        <Pill label="New contact household" selected={where === 'new'} onPress={() => setWhere('new')} />
        <Pill label="My household" selected={where === 'mine'} onPress={() => setWhere('mine')} />
        {(contacts.data ?? []).map((h) => (
          <Pill key={h.id} label={h.name} selected={where === h.id} onPress={() => setWhere(h.id)} />
        ))}
      </View>
      {where === 'new' ? (
        <TextField label="Household name (optional)" value={group} onChangeText={setGroup} placeholder="e.g. The Levins" />
      ) : null}
      <View style={styles.badges}>
        <Pill label="Child" selected={child} onPress={() => setChild(!child)} />
      </View>
      {add.error ? <Text>{(add.error as Error).message}</Text> : null}
      <Button
        label="Add person"
        disabled={!name.trim()}
        loading={add.isPending}
        onPress={async () => {
          const p = await add.mutateAsync(undefined)
          setName('')
          setGroup('')
          router.push(`/people/${p.id}` as Href)
        }}
      />
    </Card>
  )
}

export function PeopleScreen() {
  const household = useHousehold()
  const contacts = useContacts()
  return (
    <Screen
      title="People"
      subtitle="Your household and your contacts. Contacts are private to your household."
    >
      {!household.data || !contacts.data ? (
        <Loading />
      ) : (
        <>
          <Card>
            <SectionHeader title={`${household.data.name}: your household`} />
            {household.data.people.map((p, i) => (
              <PersonRow key={p.id} p={p} last={i === household.data!.people.length - 1} />
            ))}
          </Card>
          {contacts.data.map((h) => (
            <Card key={h.id}>
              <SectionHeader
                title={h.name}
                hint={h.note ?? 'Contact household (a ghost only you can see)'}
              />
              {h.people.map((p, i) => (
                <PersonRow key={p.id} p={p} last={i === h.people.length - 1} />
              ))}
            </Card>
          ))}
          {contacts.data.length === 0 ? (
            <Text color={colors.muted}>
              No contacts yet. Add the people you host and what they can’t eat.
            </Text>
          ) : null}
          <AddPerson />
          <Text variant="small">
            Contacts are ghost households you create. They are never shared or discoverable.
          </Text>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
})
