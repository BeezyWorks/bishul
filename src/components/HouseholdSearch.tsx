import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import type { ConstraintLabel, Id, PickableHousehold } from '@/lib/api/types'
import { countsText } from '@/lib/plan'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Button } from './Button'
import { ConstraintText } from './HouseholdGuests'
import { Text } from './Text'

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()

/** Households whose name or any member's name contains `query`, with the member that matched (if not the name). */
export function matchHouseholds(
  households: PickableHousehold[],
  query: string,
): { household: PickableHousehold; via: string | null }[] {
  const q = fold(query)
  if (!q) return []
  const out: { household: PickableHousehold; via: string | null }[] = []
  for (const household of households) {
    if (fold(household.name).includes(q)) out.push({ household, via: null })
    else {
      const m = household.members.find((x) => fold(x.name).includes(q))
      if (m) out.push({ household, via: m.name })
    }
  }
  return out
}

export interface HouseholdSearchProps {
  households: PickableHousehold[]
  /** Households already on the list; they are not offered. */
  excludeIds?: Id[]
  /** "Add" on a match. */
  onAdd: (householdId: Id) => void
  /** The last row, `+ New household "Ro…"`. Leave out to hide it. */
  onCreate?: (name: string) => void
  placeholder?: string
  /** Greys out Add while a request is running. */
  busy?: boolean
  /** Most matches shown. Default 6. */
  limit?: number
}

/**
 * Add a household to a guest list: a search box whose matches (household name or any member name) drop down under it,
 * each with an Add button; the last row creates a new household named after what was typed. Clears after an add.
 */
export function HouseholdSearch({
  households,
  excludeIds = [],
  onAdd,
  onCreate,
  placeholder = 'Add a household',
  busy,
  limit = 6,
}: HouseholdSearchProps) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const matches = useMemo(
    () =>
      matchHouseholds(
        households.filter((h) => !excludeIds.includes(h.id)),
        q,
      ).slice(0, limit),
    [households, excludeIds, q, limit],
  )
  const typed = q.trim()
  const show = typed.length > 0 && (focused || matches.length > 0)
  const reset = () => setQ('')
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <Text color={colors.muted}>{'⌕'}</Text>
        <TextInput
          accessibilityLabel={placeholder}
          value={q}
          onChangeText={setQ}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
      {show ? (
        <View style={styles.drop} accessibilityRole="list">
          {matches.map(({ household: h, via }) => {
            const adults = h.members.filter((m) => !m.isChild).length
            const constraints = dedupe(h.members.flatMap((m) => m.constraints))
            return (
              <View key={h.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text variant="bodyStrong">{h.name}</Text>
                  <View style={styles.line}>
                    <Text variant="small">
                      {countsText({ adults, children: h.members.length - adults }) ||
                        'No members yet'}
                      {via ? ` · ${via} matches` : ''}
                    </Text>
                    {constraints.length ? (
                      <>
                        <Text variant="small">{' · '}</Text>
                        <ConstraintText constraints={constraints} />
                      </>
                    ) : null}
                  </View>
                </View>
                <Button
                  label="Add"
                  small
                  variant="soft"
                  disabled={busy}
                  accessibilityLabel={`Add ${h.name}`}
                  onPress={() => {
                    onAdd(h.id)
                    reset()
                  }}
                />
              </View>
            )
          })}
          {onCreate ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onCreate(typed)
                reset()
              }}
              style={[styles.row, styles.create]}
            >
              <Text color={colors.accent} style={{ fontFamily: fonts.bodySemiBold }}>
                {`+ New household “${typed}”`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function dedupe(all: ConstraintLabel[]): ConstraintLabel[] {
  const by = new Map<string, ConstraintLabel>()
  for (const c of all) {
    const prev = by.get(c.text)
    by.set(c.text, {
      text: c.text,
      strict: c.strict || !!prev?.strict,
      strictAllergy: c.strictAllergy || !!prev?.strictAllergy,
    })
  }
  return [...by.values()].sort((a, b) => Number(b.strictAllergy) - Number(a.strictAllergy))
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, zIndex: 10 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.touch,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
  },
  input: {
    flex: 1,
    minHeight: size.touch,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  drop: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: size.touch,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowMain: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  create: { borderBottomWidth: 0, backgroundColor: colors.subtle },
})
