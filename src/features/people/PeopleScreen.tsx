import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Button,
  Card,
  ConstraintText,
  ListRow,
  Loading,
  Screen,
  SearchField,
  Text,
  TextField,
} from '@/components'
import { useContacts, useCreateContactHousehold, useHousehold } from '@/lib/api/hooks'
import type { Constraint } from '@/lib/api/types'
import { colors, space, type Tone } from '@/theme/tokens'

import { combinedConstraints, displayName, householdCounts, matches } from './householdText'

export function constraintTone(c: Constraint): Tone {
  if (c.kind === 'medical') return c.severity === 'strict' ? 'danger' : 'warn'
  if (c.kind === 'religious') return c.tagType === 'kashrut-sourcing' ? 'info' : 'warn'
  return 'muted'
}

/** One row per household; open one to see and edit its members. */
export function PeopleScreen() {
  const router = useRouter()
  const household = useHousehold()
  const contacts = useContacts()
  const create = useCreateContactHousehold()
  const [q, setQ] = useState('')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const all = household.data && contacts.data ? [household.data, ...contacts.data] : null
  const shown = all?.filter((h) => matches(h, q)) ?? []

  const submit = async () => {
    if (!name.trim()) return
    const h = await create.mutateAsync(name.trim())
    setName('')
    setNaming(false)
    router.push(`/people/household/${h.id}` as Href)
  }

  return (
    <Screen
      title="People"
      subtitle="Households you cook for. Contacts are private to your household."
      actions={naming ? null : <Button label="+ Household" small onPress={() => setNaming(true)} />}
    >
      {!all ? (
        <Loading />
      ) : (
        <>
          {naming ? (
            <Card tone="subtle">
              <TextField
                label="Household name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. The Levins"
                autoFocus
                onSubmitEditing={submit}
              />
              {create.error ? <Text>{(create.error as Error).message}</Text> : null}
              <View style={styles.row}>
                <Button
                  label="Create"
                  disabled={!name.trim()}
                  loading={create.isPending}
                  onPress={submit}
                />
                <Button label="Cancel" variant="ghost" onPress={() => setNaming(false)} />
              </View>
            </Card>
          ) : null}
          <SearchField value={q} onChangeText={setQ} placeholder="Search households or people" />
          <Card>
            {shown.map((h, i) => {
              const combined = combinedConstraints(h.people)
              return (
                <ListRow
                  key={h.id}
                  title={displayName(h)}
                  subtitle={householdCounts(h) || 'No one yet'}
                  href={`/people/household/${h.id}`}
                  last={i === shown.length - 1}
                >
                  <Text variant="small">
                    {combined.length ? (
                      <ConstraintText constraints={combined} />
                    ) : (
                      <Text variant="small" color={colors.muted}>
                        No constraints
                      </Text>
                    )}
                  </Text>
                </ListRow>
              )
            })}
            {shown.length === 0 ? (
              <Text color={colors.muted}>
                {q ? 'No household or person matches.' : 'Nothing here yet.'}
              </Text>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
})
