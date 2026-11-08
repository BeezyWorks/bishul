import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import type { ConstraintLabel, GuestHousehold, GuestMember, Id } from '@/lib/api/types'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'

/** Constraint text colored by severity: a strict allergy in the danger color, the rest muted. Never a badge. */
export function ConstraintText({
  constraints,
  strictSuffix,
}: {
  constraints: ConstraintLabel[]
  /** Append " · strict" to strict allergies (inside a member chip). */
  strictSuffix?: boolean
}) {
  if (!constraints.length) return null
  return (
    <>
      {constraints.map((c, i) => (
        <Text
          key={c.text}
          variant="small"
          color={c.strictAllergy ? colors.danger : colors.muted}
          style={c.strictAllergy ? styles.strict : undefined}
        >
          {i > 0 ? ', ' : ''}
          {c.text}
          {strictSuffix && c.strictAllergy ? ' · strict' : ''}
        </Text>
      ))}
    </>
  )
}

function MemberChip({
  member,
  disabled,
  onToggle,
}: {
  member: GuestMember
  disabled?: boolean
  onToggle: (present: boolean) => void
}) {
  const label = [member.name, ...member.constraints.map((c) => c.text)].join(', ')
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: member.present, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onToggle(!member.present)}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chip,
        member.present ? styles.chipOn : styles.chipOff,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={{
          fontFamily: member.present ? fonts.bodySemiBold : fonts.bodyMedium,
          fontSize: fontSize.sm,
          color: member.present ? colors.accent : colors.muted,
        }}
      >
        {member.present ? '✓ ' : ''}
        {member.name}
      </Text>
      {member.constraints.length ? (
        <View style={styles.chipConstraints}>
          <Text variant="small" color={colors.muted}>
            {' · '}
          </Text>
          <ConstraintText constraints={member.constraints} strictSuffix />
        </View>
      ) : null}
    </Pressable>
  )
}

export interface HouseholdGuestsProps {
  household: GuestHousehold
  /** Start expanded. Default: collapsed. */
  defaultOpen?: boolean
  /** A member chip was ticked or unticked. */
  onTogglePerson: (personId: Id, present: boolean) => void
  /** Shows "Remove" on the row. Only for a household with `removable` true; ignored otherwise. */
  onRemove?: () => void
  /** Greys out the chips and the remove action while a request is running. */
  disabled?: boolean
}

/**
 * One household on a guest list: name, "2 adults, 1 child", the combined constraints (strict allergies in the danger
 * color) and, expanded, one plain toggle chip per member (ticked = coming). Used by the wizard and the hosted page.
 */
export function HouseholdGuests({
  household: h,
  defaultOpen,
  onTogglePerson,
  onRemove,
  disabled,
}: HouseholdGuestsProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  const counts = [h.countsText, h.awayText].filter(Boolean).join(' · ')
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${h.name}, ${counts}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={styles.headMain}
        >
          <Text color={colors.muted} style={styles.chevron}>
            {open ? '▾' : '›'}
          </Text>
          <View style={styles.titles}>
            <Text variant="bodyStrong">{h.isHost ? 'Us' : h.name}</Text>
            <View style={styles.line}>
              <Text variant="small">{counts || 'Nobody coming'}</Text>
              {h.constraints.length ? (
                <>
                  <Text variant="small">{' · '}</Text>
                  <ConstraintText constraints={h.constraints} />
                </>
              ) : null}
            </View>
          </View>
        </Pressable>
        {h.removable && onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${h.name}`}
            disabled={disabled}
            onPress={onRemove}
            style={styles.remove}
          >
            <Text variant="small" color={colors.danger}>
              Remove
            </Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View style={styles.chips}>
          {h.members.map((m) => (
            <MemberChip
              key={m.personId}
              member={m}
              disabled={disabled}
              onToggle={(present) => onTogglePerson(m.personId, present)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingVertical: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.touch,
  },
  chevron: { width: 16, textAlign: 'center' },
  titles: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  strict: { fontFamily: fonts.bodySemiBold },
  remove: { minHeight: size.touch, paddingHorizontal: space.md, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingLeft: 24 },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    minHeight: size.touch,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignContent: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.line },
  chipConstraints: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
})
