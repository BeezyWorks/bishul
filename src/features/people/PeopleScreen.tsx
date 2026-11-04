import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Card, ListRow, Loading, Screen, SectionHeader, Text } from '@/components'
import { useContacts, useHousehold } from '@/lib/api/hooks'
import type { Constraint, Person } from '@/lib/api/types'
import { space, type Tone } from '@/theme/tokens'

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
