import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Disclaimer,
  ListRow,
  SectionHeader,
  Segmented,
  Text,
  TextField,
  useLayout,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useContacts } from '@/lib/api/hooks'
import type { BriefTone, Constraint, Kind, MealDetail } from '@/lib/api/types'
import { colors, radius, size, space, type Tone } from '@/theme/tokens'

const BRIEF_TONE: Record<BriefTone, { tone: Tone; label: string }> = {
  danger: { tone: 'danger', label: 'Must fix' },
  warn: { tone: 'warn', label: 'Rule or minhag' },
  info: { tone: 'info', label: 'Sourcing' },
  preference: { tone: 'muted', label: 'Preference' },
}

const kindOptions: { value: Kind; label: string }[] = [
  { value: 'meat', label: 'Meat' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'parve', label: 'Parve' },
]

function constraintTone(c: Constraint): Tone {
  if (c.kind === 'medical') return c.severity === 'strict' ? 'danger' : 'warn'
  if (c.kind === 'religious') return c.tagType === 'kashrut-sourcing' ? 'info' : 'warn'
  return 'muted'
}

export function WhoStep({ detail }: { detail: MealDetail }) {
  const { wide } = useLayout()
  const { meal, people, brief } = detail
  const contacts = useContacts()
  const setKind = useApiMutation((k: Kind) => api.setMealKind(meal.id, k), stale.who)
  const setAtt = useApiMutation(
    (a: { guestIds: string[]; notComing: string[] }) => api.setAttendees(meal.id, a),
    stale.who,
  )
  const [guestName, setGuestName] = useState('')
  const [guestHousehold, setGuestHousehold] = useState('')
  const newGuest = useApiMutation(async () => {
    const name = guestName.trim()
    const p = await api.addPerson({
      name,
      newContactHousehold: guestHousehold.trim() || name,
    })
    await api.setAttendees(meal.id, {
      guestIds: [...meal.guestIds, p.id],
      notComing: meal.notComing,
    })
    setGuestName('')
    setGuestHousehold('')
    return p
  }, [...stale.who, ['contacts']])

  const toggle = (id: string) =>
    setAtt.mutate({
      guestIds: meal.guestIds,
      notComing: meal.notComing.includes(id)
        ? meal.notComing.filter((x) => x !== id)
        : [...meal.notComing, id],
    })
  const addGuest = (id: string) =>
    setAtt.mutate({ guestIds: [...meal.guestIds, id], notComing: meal.notComing })
  const removeGuest = (id: string) =>
    setAtt.mutate({ guestIds: meal.guestIds.filter((x) => x !== id), notComing: meal.notComing })

  const invited = new Set(meal.guestIds)
  const available = (contacts.data ?? []).flatMap((h) => h.people).filter((p) => !invited.has(p.id))
  const family = people.filter((p) => !p.isGuest)
  const guests = people.filter((p) => p.isGuest)
  const guestHouseholds = [...new Set(guests.map((g) => g.householdName))].map((name) => ({
    name,
    members: guests.filter((g) => g.householdName === name),
  }))
  const comingCount = people.filter((p) => p.coming).length
  const comingGuests = guests.length

  return (
    <View style={[styles.cols, wide && styles.colsWide]}>
      <View style={[styles.main, wide && { flex: 3 }]}>
        <Card>
          <SectionHeader
            title="Meal type"
            hint="Meat, dairy or parve. Dishes of the other kind are hidden."
          />
          <Segmented
            options={kindOptions}
            value={meal.kindDeclared === false ? null : meal.kind}
            onChange={(k) => setKind.mutate(k)}
          />
          {meal.kindDeclared === false ? (
            <Text variant="small">
              Not set yet. It follows the first dish you add, or choose it now.
            </Text>
          ) : null}
        </Card>

        <Card tone="subtle">
          <Text variant="bodyStrong">
            {comingCount} {comingCount === 1 ? 'person' : 'people'} coming
          </Text>
          <Text variant="small">
            {comingCount - comingGuests} from your household, {comingGuests}{' '}
            {comingGuests === 1 ? 'guest' : 'guests'} from {guestHouseholds.length}{' '}
            {guestHouseholds.length === 1 ? 'household' : 'households'}.
          </Text>
        </Card>

        <Card>
          <SectionHeader
            title="Your household"
            hint="Everyone is in by default. Tap a person who isn’t coming."
          />
          <View>
            {family.map((p, i) => (
              <PersonRow
                key={p.person.id}
                name={p.person.name}
                sub={p.person.relation}
                constraints={p.person.constraints}
                coming={p.coming}
                last={i === family.length - 1}
                onPress={() => toggle(p.person.id)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader title="Guests" hint="Add people from your contacts." />
          {guests.length === 0 ? <Text color={colors.muted}>No guests yet.</Text> : null}
          {guestHouseholds.map((h) => (
            <View key={h.name} style={styles.addList}>
              <Text variant="label">
                {h.name} ({h.members.length})
              </Text>
              {h.members.map((g, i) => (
                <ListRow
                  key={g.person.id}
                  title={g.person.name}
                  subtitle={g.person.isChild ? 'Child' : undefined}
                  last={i === h.members.length - 1}
                  href={`/people/${g.person.id}`}
                  right={
                    <Button
                      label="Remove"
                      variant="ghost"
                      small
                      accessibilityLabel={`Remove ${g.person.name} from this meal`}
                      onPress={() => removeGuest(g.person.id)}
                    />
                  }
                >
                  <ConstraintBadges constraints={g.person.constraints} />
                </ListRow>
              ))}
            </View>
          ))}
          {available.length ? (
            <View style={styles.addList}>
              <Text variant="label">Add from contacts</Text>
              {available.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  subtitle={p.relation}
                  right={
                    <Button label="+ Add" variant="soft" small onPress={() => addGuest(p.id)} />
                  }
                />
              ))}
            </View>
          ) : null}
          <View style={styles.addList}>
            <Text variant="label">New guest</Text>
            <View style={styles.newGuest}>
              <TextField
                label="Name"
                value={guestName}
                onChangeText={setGuestName}
                placeholder="e.g. George"
              />
              <TextField
                label="Household (optional)"
                value={guestHousehold}
                onChangeText={setGuestHousehold}
                placeholder="e.g. The Levins"
              />
              <Button
                label="Add guest"
                disabled={!guestName.trim()}
                loading={newGuest.isPending}
                onPress={() => newGuest.mutate(undefined)}
              />
            </View>
            <Text variant="small">
              Open a guest to add their allergies, diets and minhagim; the menu checks them live.
            </Text>
            {newGuest.error ? (
              <Text color={colors.danger}>{(newGuest.error as Error).message}</Text>
            ) : null}
          </View>
          <Button label="Manage contacts" href="/people" variant="ghost" small />
        </Card>
      </View>

      <View style={[styles.side, wide && { flex: 2 }]}>
        <Card tone="subtle">
          <SectionHeader
            title="What this means for the menu"
            hint="Updates as you change who is coming."
          />
          {brief.lines.length === 0 ? (
            <Text color={colors.muted}>
              No allergies, diets or minhagim to plan around. Add guests to see what they bring.
            </Text>
          ) : null}
          {brief.lines.map((l) => (
            <View key={l.id} style={styles.brief}>
              <Badge label={BRIEF_TONE[l.tone].label} tone={BRIEF_TONE[l.tone].tone} />
              <Text>{l.text}</Text>
              {l.people.length ? <Text variant="small">For {l.people.join(', ')}</Text> : null}
            </View>
          ))}
          {brief.hasAllergy ? <Disclaimer /> : null}
        </Card>
      </View>
    </View>
  )
}

function ConstraintBadges({ constraints }: { constraints: Constraint[] }) {
  if (!constraints.length) return null
  return (
    <View style={styles.badges}>
      {constraints.map((c) => (
        <Badge
          key={c.id}
          label={c.activeWhen === 'always' ? c.label : `${c.label} (${c.activeWhen})`}
          tone={constraintTone(c)}
        />
      ))}
    </View>
  )
}

function PersonRow({
  name,
  sub,
  constraints,
  coming,
  last,
  onPress,
}: {
  name: string
  sub?: string
  constraints: Constraint[]
  coming: boolean
  last: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${name}: ${coming ? 'coming' : 'not coming'}`}
      accessibilityState={{ checked: coming }}
      onPress={onPress}
      style={[styles.person, !last && styles.divider]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong" style={!coming && styles.struck}>
          {name}
        </Text>
        {sub ? <Text variant="small">{sub}</Text> : null}
        <ConstraintBadges constraints={constraints} />
      </View>
      <Badge label={coming ? 'Coming' : 'Not coming'} tone={coming ? 'accent' : 'muted'} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cols: { gap: space.lg },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { gap: space.lg },
  side: { gap: space.lg },
  brief: { gap: 4, paddingBottom: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  person: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  newGuest: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
  addList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
    borderRadius: radius.tile,
  },
})
