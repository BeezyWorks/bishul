import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Badge, Text } from '@/components'
import { useEnsureRunMeal } from '@/lib/api/hooks'
import type { DaySlot, Id, MealCard, WeekDay } from '@/lib/api/types'
import { addDays, dayNum, weekdayName } from '@/lib/dates'
import { hostedHref, SLOT_LABEL, wizardHref } from '@/lib/plan'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { DayActions } from './DayActions'
import { MealEditor } from './MealEditor'
import { HostedSlot, MealSlot } from './Slots'

type Editing = { slot: DaySlot; meal?: MealCard; createdId?: Id }

/** One weekday: its date, the dinner slot (or the eve link), other meals, and the ⋯ menu. */
export function DayCell({
  day,
  today,
  grow = true,
}: {
  day: WeekDay
  today?: string
  /** Wide strip: share the row evenly. */
  grow?: boolean
}) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const tomorrow = today ? addDays(today, 1) === day.date : false
  const holidays = day.holidays.slice(0, 2)
  const hasDinner = day.meals.some((m) => m.slot === 'dinner')

  return (
    <View
      style={[styles.cell, grow && { flex: 1 }, day.isToday && styles.today]}
      accessibilityLabel={`${weekdayName(day.date)} ${dayNum(day.date)}`}
    >
      <View style={styles.head}>
        <View style={styles.name}>
          <Text style={styles.dname}>{`${weekdayName(day.date, true)} ${dayNum(day.date)}`}</Text>
          {day.isToday ? <Badge tone="accent" label="Today" /> : null}
          {tomorrow ? <Text variant="small">Tomorrow</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${weekdayName(day.date)} ${dayNum(day.date)}`}
          onPress={() => setMenu(true)}
          style={styles.more}
        >
          <Text color={colors.muted} style={{ fontSize: fontSize.lg }}>
            {'⋯'}
          </Text>
        </Pressable>
      </View>
      <Text variant="small" numberOfLines={1}>
        {day.hebrew}
      </Text>
      {holidays.map((h) => (
        <Text
          key={h.name}
          variant="small"
          numberOfLines={1}
          color={h.kind === 'civil' ? colors.info : colors.warn}
          style={h.kind === 'civil' ? { fontStyle: 'italic' } : undefined}
        >
          {h.name}
        </Text>
      ))}
      {day.candleLighting && day.eve ? (
        <Text variant="small">{`Candles ${day.candleLighting.text}`}</Text>
      ) : null}

      <View style={styles.slots}>
        {day.meals.map((m) =>
          m.hosted ? (
            <HostedSlot key={m.id ?? m.name} meal={m} />
          ) : (
            <MealSlot
              key={m.id ?? m.name}
              meal={m}
              label={m.slot === 'dinner' ? 'Dinner' : m.slotLabel || SLOT_LABEL[m.slot]}
              onOpen={() => setEditing({ slot: m.slot, meal: m })}
            />
          ),
        )}
        {day.eve ? (
          <EveLink eve={day.eve} />
        ) : hasDinner ? null : (
          <MealSlot label="Dinner" onOpen={() => setEditing({ slot: 'dinner' })} />
        )}
      </View>

      {menu ? (
        <DayActions
          date={day.date}
          onClose={() => setMenu(false)}
          onAdded={(id, slot) => {
            setMenu(false)
            setEditing({ slot, createdId: id })
          }}
        />
      ) : null}
      {editing ? (
        <MealEditor
          date={day.date}
          slot={editing.slot}
          meal={editing.meal}
          createdId={editing.createdId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  )
}

/** In place of a dinner slot on Friday / Erev Yom Tov: the evening meal belongs to the holy day. */
function EveLink({ eve }: { eve: NonNullable<WeekDay['eve']> }) {
  const router = useRouter()
  const ensure = useEnsureRunMeal()
  const go = async () => {
    if (eve.meal) return router.push(hostedHref(eve.meal.hostedKey) as Href)
    const r = await ensure.mutateAsync({
      runKey: eve.runKey,
      holyDate: eve.holyDate,
      part: 'night',
    })
    router.push(wizardHref(r.mealId) as Href)
  }
  return (
    <Pressable accessibilityRole="link" disabled={ensure.isPending} onPress={go} style={styles.eve}>
      <Text style={styles.eveText}>{`Plan ${eve.mealName} →`}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: 10,
    gap: 6,
    minWidth: 0,
    minHeight: 150,
  },
  today: { borderColor: colors.accent, borderWidth: 2, padding: 9 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  name: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4, flexShrink: 1 },
  dname: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  more: {
    minWidth: size.touch - 12,
    minHeight: size.touch - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slots: { gap: 6, marginTop: space.xs },
  eve: { minHeight: size.touch - 8, justifyContent: 'center' },
  eveText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, color: colors.accent },
})
