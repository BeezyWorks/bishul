import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Disclaimer,
  Loading,
  Pill,
  Screen,
  SearchField,
  Segmented,
  SectionHeader,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, usePerson, useRecipe, useRecipes } from '@/lib/api/hooks'
import {
  PERIODS,
  PERSON_RULES,
  type Constraint,
  type ConstraintInput,
  type ConstraintTagInput,
  type Person,
} from '@/lib/api/types'
import { shortDate } from '@/lib/dates'
import { colors, space } from '@/theme/tokens'

import { constraintTone } from './PeopleScreen'

const KIND = { medical: 'Medical', religious: 'Religious', preference: 'Preference' } as const
const SOURCE = { self: 'Entered by them', host: 'Entered by you', ai: 'Filled by AI' } as const

function ConstraintRow({ c, onRemove }: { c: Constraint; onRemove?: () => void }) {
  return (
    <View style={styles.crow}>
      <View style={styles.badges}>
        <Text variant="bodyStrong">{c.label}</Text>
        {onRemove ? (
          <Button
            label="Remove"
            variant="ghost"
            small
            accessibilityLabel={`Remove ${c.label}`}
            onPress={onRemove}
          />
        ) : null}
      </View>
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
  const addNote = useApiMutation((n: string) => api.addPersonNote(id, n), stale.reactions)
  const removeC = useApiMutation((cid: string) => api.removeConstraint(id, cid), stale.people)
  const setRules = useApiMutation((r: string[]) => api.setPersonRules(id, r), stale.people)
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
          <ConstraintRow key={c.id} c={c} onRemove={() => removeC.mutate(c.id)} />
        ))}
        <AddConstraint personId={id} />
        <Text variant="label">Rules and minhagim</Text>
        <View style={styles.badges}>
          {PERSON_RULES.map((r) => {
            const on = (p.rules ?? []).includes(r.id)
            return (
              <Pill
                key={r.id}
                label={r.label}
                selected={on}
                onPress={() =>
                  setRules.mutate(on ? (p.rules ?? []).filter((x) => x !== r.id) : [...(p.rules ?? []), r.id])
                }
              />
            )
          })}
        </View>
        {mine.length === 0 && !p.link ? <Text color={colors.muted}>No constraints.</Text> : null}
        {!p.link && mine.some((c) => c.tagType === 'allergen') ? <Disclaimer /> : null}

        <Text variant="label">Notes</Text>
        {p.notes.map((n, i) => (
          <Text key={i}>{n}</Text>
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

        <RecordReaction person={p} />

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

const TAG_TYPES: { value: ConstraintTagInput; label: string; hint: string }[] = [
  { value: 'allergen', label: 'Allergy', hint: 'peanut, sesame, egg' },
  { value: 'ingredient', label: 'Ingredient', hint: 'cilantro' },
  { value: 'diet', label: 'Diet', hint: 'vegetarian, vegan or pescatarian' },
  { value: 'kashrut-dish', label: 'Kashrut', hint: 'kitniyot, gebrokts' },
  { value: 'kashrut-sourcing', label: 'Sourcing', hint: 'chalav_yisrael, pat_yisrael, yashan, glatt' },
]

/** Add a constraint: what, how serious, and when it applies. */
function AddConstraint({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false)
  const [tagType, setTagType] = useState<ConstraintTagInput>('allergen')
  const [tag, setTag] = useState('')
  const [severity, setSeverity] = useState<'strict' | 'flexible'>('strict')
  const [when, setWhen] = useState('always')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const add = useApiMutation((c: ConstraintInput) => api.addConstraint(personId, c), stale.people)
  if (!open) return <Button label="+ Add a constraint" variant="soft" small onPress={() => setOpen(true)} />
  const kind = tagType === 'allergen' ? 'medical' : tagType === 'ingredient' || tagType === 'diet' ? 'preference' : 'religious'
  const range = when === 'range'
  const ok = !!tag.trim() && (!range || (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)))
  return (
    <Card>
      <Text variant="label">What</Text>
      <View style={styles.badges}>
        {TAG_TYPES.map((t) => (
          <Pill key={t.value} label={t.label} selected={tagType === t.value} onPress={() => setTagType(t.value)} />
        ))}
      </View>
      <TextField
        label="Which one"
        value={tag}
        onChangeText={setTag}
        placeholder={TAG_TYPES.find((t) => t.value === tagType)?.hint}
        autoCapitalize="none"
      />
      <Text variant="label">How strict</Text>
      <Segmented
        options={[
          { value: 'strict', label: 'Strict: can’t be at the meal' },
          { value: 'flexible', label: 'Flexible: can eat around it' },
        ]}
        value={severity}
        onChange={setSeverity}
      />
      <Text variant="label">Active when</Text>
      <View style={styles.badges}>
        <Pill label="Always" selected={when === 'always'} onPress={() => setWhen('always')} />
        {PERIODS.map((p) => (
          <Pill key={p.id} label={p.label} selected={when === p.id} onPress={() => setWhen(p.id)} />
        ))}
        <Pill label="Dates" selected={range} onPress={() => setWhen('range')} />
      </View>
      {range ? (
        <View style={styles.addNote}>
          <TextField label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
          <TextField label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
        </View>
      ) : null}
      <TextField label="Note (optional)" value={note} onChangeText={setNote} />
      {add.error ? <Text color={colors.danger}>{(add.error as Error).message}</Text> : null}
      <View style={styles.addNote}>
        <Button
          label="Save constraint"
          disabled={!ok}
          loading={add.isPending}
          onPress={async () => {
            await add.mutateAsync({
              tagType,
              tag: tag.trim(),
              kind,
              severity,
              activeWhen: range ? { from, to } : when,
              note,
            })
            setTag('')
            setNote('')
            setOpen(false)
          }}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  )
}

/** Record that this person liked or didn't like a recipe version. */
function RecordReaction({ person }: { person: Person }) {
  const [q, setQ] = useState('')
  const [recipeId, setRecipeId] = useState<string | null>(null)
  const found = useRecipes(q, {})
  const recipe = useRecipe(recipeId ?? '')
  const react = useApiMutation(
    (a: { versionId: string; reaction: 'like' | 'dislike' }) =>
      api.recordReaction(person.id, a.versionId, a.reaction),
    stale.reactions,
  )
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">Record a like or dislike</Text>
      <SearchField value={q} onChangeText={(t) => { setQ(t); setRecipeId(null) }} placeholder="Find a recipe" />
      {q.trim() && !recipeId ? (
        <View style={styles.badges}>
          {(found.data ?? []).slice(0, 8).map((r) => (
            <Pill key={r.id} label={r.title} onPress={() => setRecipeId(r.id)} />
          ))}
          {found.data?.length === 0 ? <Text color={colors.muted}>No recipe found.</Text> : null}
        </View>
      ) : null}
      {recipeId && recipe.data
        ? recipe.data.versions.map((v) => (
            <View key={v.id} style={styles.addNote}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {recipe.data!.title}
                {v.label !== 'Original' ? `: ${v.label}` : ''}
              </Text>
              <Button label="Liked it" variant="soft" small onPress={() => react.mutate({ versionId: v.id, reaction: 'like' })} />
              <Button label="Didn’t like it" variant="secondary" small onPress={() => react.mutate({ versionId: v.id, reaction: 'dislike' })} />
            </View>
          ))
        : null}
      {react.isSuccess ? <Text color={colors.accent}>Recorded.</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  crow: { gap: 6, paddingVertical: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addNote: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
})
