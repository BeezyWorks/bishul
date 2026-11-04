import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Disclaimer,
  Loading,
  Screen,
  SectionHeader,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { useApiMutation, usePerson } from '@/lib/api/hooks'
import type { Constraint } from '@/lib/api/types'
import { shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

import { constraintTone } from './PeopleScreen'

const KIND = { medical: 'Medical', religious: 'Religious', preference: 'Preference' } as const
const SOURCE = { self: 'Entered by them', host: 'Entered by you', ai: 'Filled by AI' } as const

function ConstraintRow({ c }: { c: Constraint }) {
  return (
    <View style={styles.crow}>
      <Text variant="bodyStrong">{c.label}</Text>
      <View style={styles.badges}>
        <Badge label={KIND[c.kind]} tone={constraintTone(c)} />
        <Badge
          label={c.severity === 'strict' ? 'Strict' : 'Flexible'}
          tone={c.severity === 'strict' ? 'neutral' : 'muted'}
        />
        <Badge
          label={c.activeWhen === 'always' ? 'Always' : `Active: ${c.activeWhen}`}
          tone="muted"
        />
        <Badge label={SOURCE[c.source]} tone="muted" />
      </View>
      {c.note ? <Text variant="small">{c.note}</Text> : null}
    </View>
  )
}

export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = usePerson(id)
  const [note, setNote] = useState('')
  const addNote = useApiMutation((n: string) => api.addPersonNote(id, n))
  if (isLoading || !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  const { person: p, household } = data
  const fromProfile = p.constraints.filter((c) => c.fromProfile)
  const mine = p.constraints.filter((c) => !c.fromProfile)
  const first = p.name.split(' ')[0]

  return (
    <Screen
      back={{ label: 'People', href: '/people' }}
      eyebrow={
        household.isOwn ? `${household.name}: your household` : `Contact · ${household.name}`
      }
      title={p.name}
      subtitle={[p.relation, p.age ? `age ${p.age}` : ''].filter(Boolean).join(' · ')}
    >
      {p.link ? (
        <Card tone="info">
          <Text variant="h3" color={colors.info}>
            From {p.link.profileName}’s profile
          </Text>
          <Text color={colors.info}>
            Linked and live ({p.link.mode}). What {first} enters about themselves flows in as they
            change it. They never see your additions below.
          </Text>
        </Card>
      ) : null}

      {p.link ? (
        <Card>
          <SectionHeader title={`From ${first}’s profile`} hint="Live. You can’t edit these." />
          {fromProfile.length === 0 ? <Text color={colors.muted}>Nothing shared yet.</Text> : null}
          {fromProfile.map((c) => (
            <ConstraintRow key={c.id} c={c} />
          ))}
          {fromProfile.some((c) => c.tagType === 'allergen') ? <Disclaimer /> : null}
        </Card>
      ) : null}

      <Card tone="subtle">
        <SectionHeader
          title="Your additions"
          hint="Private to your household. The real person never sees these."
        />
        {mine.length ? <Text variant="label">Constraints</Text> : null}
        {mine.map((c) => (
          <ConstraintRow key={c.id} c={c} />
        ))}
        {mine.length === 0 && !p.link ? <Text color={colors.muted}>No constraints.</Text> : null}
        {!p.link && mine.some((c) => c.tagType === 'allergen') ? <Disclaimer /> : null}

        <Text variant="label">Notes</Text>
        {p.notes.map((n) => (
          <Text key={n}>{n}</Text>
        ))}
        <View style={styles.addNote}>
          <TextField
            label="Add a note"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Prefers a small portion"
          />
          <Button
            label="Save note"
            disabled={!note.trim()}
            onPress={async () => {
              await addNote.mutateAsync(note.trim())
              setNote('')
            }}
          />
        </View>

        <Text variant="label">Likes</Text>
        <View style={styles.badges}>
          {p.likes.length ? (
            p.likes.map((l) => <Badge key={l} label={l} tone="accent" />)
          ) : (
            <Text color={colors.muted}>None recorded.</Text>
          )}
        </View>
        <Text variant="label">Dislikes</Text>
        <View style={styles.badges}>
          {p.dislikes.length ? (
            p.dislikes.map((l) => <Badge key={l} label={l} tone="warn" />)
          ) : (
            <Text color={colors.muted}>None recorded.</Text>
          )}
        </View>

        <Text variant="label">Served history</Text>
        {p.served.length === 0 ? <Text color={colors.muted}>Nothing served yet.</Text> : null}
        {p.served.slice(0, 8).map((s) => (
          <Text key={s.versionId} variant="small" color={colors.ink}>
            {shortDate(s.date)} {'·'} {s.title}
          </Text>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  crow: { gap: 6, paddingVertical: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addNote: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
})
