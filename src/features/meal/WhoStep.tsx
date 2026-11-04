import React from 'react'
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
  useLayout,
} from '@/components'
import { api } from '@/lib/api/client'
import { useApiMutation, useContacts } from '@/lib/api/hooks'
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
  const setKind = useApiMutation((k: Kind) => api.setMealKind(meal.id, k))
  const setAtt = useApiMutation((a: { guestIds: string[]; notComing: string[] }) =>
    api.setAttendees(meal.id, a),
  )

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

  return (
    <View style={[styles.cols, wide && styles.colsWide]}>
      <View style={[styles.main, wide && { flex: 3 }]}>
        <Card>
          <SectionHeader
            title="Meal type"
            hint="Meat, dairy or parve. Dishes of the other kind are hidden."
          />
          <Segmented options={kindOptions} value={meal.kind} onChange={(k) => setKind.mutate(k)} />
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
          {guests.map((g, i) => (
            <ListRow
              key={g.person.id}
              title={g.person.name}
              subtitle={g.person.relation}
              last={i === guests.length - 1}
              right={
                <Button
                  label="Remove"
                  variant="ghost"
                  small
                  onPress={() => removeGuest(g.person.id)}
                />
              }
            >
              <ConstraintBadges constraints={g.person.constraints} />
            </ListRow>
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
          <Button label="Manage contacts" href="/people" variant="ghost" small />
        </Card>
      </View>

      <View style={[styles.side, wide && { flex: 2 }]}>
        <Card tone="subtle">
          <SectionHeader
            title="What this means for the menu"
            hint="Updates as you change who is coming."
          />
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
  addList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
    borderRadius: radius.tile,
  },
})
