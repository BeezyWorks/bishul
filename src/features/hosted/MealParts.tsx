import { useRouter, type Href } from 'expo-router'
import React, { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Button, HouseholdGuests, HouseholdSearch, RecipePicker, Text } from '@/components'
import {
  useAddMealDish,
  useAddMealHousehold,
  useCreateContactHousehold,
  useDeletePlanMeal,
  useEnsureRunMeal,
  useGuestPool,
  useRemoveMealDish,
  useRemoveMealHousehold,
  useSetMealPerson,
  useUpdatePlanMeal,
} from '@/lib/api/hooks'
import type { HostedCourse, HostedMeal, HostedMenuItem, Id } from '@/lib/api/types'
import { timeLabel, wizardHref } from '@/lib/plan'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

/** The id of a meal, creating a virtual default meal first. */
export function useMealId(meal: HostedMeal) {
  const ensure = useEnsureRunMeal()
  return async (): Promise<Id> => {
    if (meal.id) return meal.id
    if (!meal.runKey || !meal.holyDate || !meal.part) throw new Error('This meal cannot be created')
    return (
      await ensure.mutateAsync({ runKey: meal.runKey, holyDate: meal.holyDate, part: meal.part })
    ).mealId
  }
}

export function ActionLink({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={styles.link}
      hitSlop={6}
    >
      <Text variant="small" color={danger ? colors.danger : colors.accent} style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  )
}

// ---------------------------------------------------------------- heading

function timeToText(hhmm: string | null): string {
  return hhmm ?? ''
}

export function MealHeading({ meal }: { meal: HostedMeal }) {
  const update = useUpdatePlanMeal()
  const del = useDeletePlanMeal()
  const getId = useMealId(meal)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(meal.name)
  const [time, setTime] = useState(timeToText(meal.timeText))
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeOk = time.trim() === '' || /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim())
  const save = async () => {
    if (!name.trim() || !timeOk) return
    try {
      const mealId = await getId()
      const patch: { name?: string; time?: string } = {}
      if (name.trim() !== meal.name) patch.name = name.trim()
      if (time.trim() !== (meal.timeText ?? '')) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
        patch.time = m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
      }
      if (Object.keys(patch).length) await update.mutateAsync({ mealId, patch })
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const guests = meal.households.filter((h) => !h.isHost).length
  const things = [
    meal.itemCount ? `${meal.itemCount} ${meal.itemCount === 1 ? 'dish' : 'dishes'}` : null,
    guests ? `${guests} guest ${guests === 1 ? 'household' : 'households'}` : null,
  ].filter(Boolean)

  return (
    <View style={styles.headWrap}>
      <View style={styles.head}>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              accessibilityLabel="Meal name"
              value={name}
              onChangeText={setName}
              style={[styles.input, { flexGrow: 1, minWidth: 160 }]}
              autoFocus
              onSubmitEditing={save}
            />
            <TextInput
              accessibilityLabel="Time, 24-hour like 18:30"
              placeholder="18:30"
              placeholderTextColor={colors.muted}
              value={time}
              onChangeText={setTime}
              style={[styles.input, { width: 90 }, !timeOk && { borderColor: colors.danger }]}
              onSubmitEditing={save}
            />
            <Button label="Save" small onPress={save} loading={update.isPending} />
            <Button
              label="Cancel"
              small
              variant="ghost"
              onPress={() => {
                setEditing(false)
                setName(meal.name)
                setTime(timeToText(meal.timeText))
              }}
            />
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text variant="h3" accessibilityRole="header">
              {meal.name}
            </Text>
            {meal.timeText ? <Text variant="small">{timeLabel(meal.timeText)}</Text> : null}
            <ActionLink label="Edit" onPress={() => setEditing(true)} />
          </View>
        )}
        {meal.id && !confirm ? (
          <ActionLink label="Remove meal" danger onPress={() => setConfirm(true)} />
        ) : null}
      </View>
      {error ? (
        <Text variant="small" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      {confirm && meal.id ? (
        <View style={styles.confirm}>
          <Text variant="small" color={colors.ink} style={{ flexShrink: 1, flexGrow: 1 }}>
            Remove {meal.name}?
            {things.length ? ` Its ${things.join(' and ')} go with it, and ` : ' '}
            {things.length ? 'it comes' : 'It comes'} off the shopping list.
          </Text>
          <Button label="Keep it" small variant="secondary" onPress={() => setConfirm(false)} />
          <Button
            label="Remove meal"
            small
            variant="danger"
            loading={del.isPending}
            onPress={() => del.mutate(meal.id as Id)}
          />
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------- menu

function flagLabel(item: HostedMenuItem): string {
  const p = item.problems[0]
  if (!p) return ''
  const what =
    p.kind === 'allergy' || p.kind === 'exclusion'
      ? p.text.length <= 28
        ? p.text
        : p.kind === 'allergy'
          ? 'Allergy'
          : 'Excluded'
      : 'Check'
  return p.personName ? `${what} · ${p.personName}` : what
}

function Dish({
  item,
  onRemove,
  onReplace,
  busy,
}: {
  item: HostedMenuItem
  onRemove: () => void
  onReplace: () => void
  busy: boolean
}) {
  const router = useRouter()
  const flagged = item.problems.length > 0
  const color = flagged ? colors.danger : colors.ink
  return (
    <View style={styles.dish}>
      <View style={styles.dishMain}>
        {item.recipeId ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/recipes/${item.recipeId}` as Href)}
          >
            <Text color={color} style={{ textDecorationLine: 'underline' }}>
              {item.title}
            </Text>
          </Pressable>
        ) : (
          <Text color={color}>{item.title}</Text>
        )}
        {item.broughtBy ? <Text variant="small">brought by {item.broughtBy}</Text> : null}
        {flagged ? (
          <View style={styles.flag}>
            <Text variant="small" color={colors.danger} style={styles.flagText}>
              {flagLabel(item)}
            </Text>
          </View>
        ) : null}
      </View>
      {flagged ? <ActionLink label="Replace" onPress={onReplace} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title}`}
        disabled={busy}
        onPress={onRemove}
        hitSlop={8}
        style={styles.x}
      >
        <Text color={colors.muted}>{'×'}</Text>
      </Pressable>
    </View>
  )
}

export function MenuColumn({ meal }: { meal: HostedMeal }) {
  const add = useAddMealDish()
  const remove = useRemoveMealDish()
  const [open, setOpen] = useState<{ course: string; replace?: string } | null>(null)

  const pick = async (course: string, dish: { versionId?: Id; description?: string }) => {
    if (!meal.id) return
    await add.mutateAsync({ mealId: meal.id, dish: { course, ...dish } })
    if (open?.replace) await remove.mutateAsync({ mealId: meal.id, itemId: open.replace })
    setOpen(null)
  }

  const visible: HostedCourse[] = meal.menu
  return (
    <View style={styles.menu}>
      {visible.map((c) => (
        <View key={c.course} style={styles.course}>
          <Text variant="label" style={styles.courseName}>
            {c.label}
          </Text>
          <View style={styles.dishes}>
            {c.items.map((it) => (
              <Dish
                key={it.itemId}
                item={it}
                busy={remove.isPending}
                onRemove={() => meal.id && remove.mutate({ mealId: meal.id, itemId: it.itemId })}
                onReplace={() => setOpen({ course: c.course, replace: it.itemId })}
              />
            ))}
            {open?.course === c.course && meal.id ? (
              <RecipePicker
                mealId={meal.id}
                course={c.course}
                onPick={(hit) => pick(c.course, { versionId: hit.versionId })}
                onAddWithoutRecipe={(text) => pick(c.course, { description: text })}
                onClose={() => setOpen(null)}
              />
            ) : (
              <ActionLink
                label={`+ Add to ${c.label.toLowerCase()}`}
                onPress={() => setOpen({ course: c.course })}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- guests

export function GuestsColumn({ meal }: { meal: HostedMeal }) {
  const getId = useMealId(meal)
  const addH = useAddMealHousehold()
  const removeH = useRemoveMealHousehold()
  const setPerson = useSetMealPerson()
  const createH = useCreateContactHousehold()
  const pool = useGuestPool()
  const [inviting, setInviting] = useState(false)
  const busy = addH.isPending || removeH.isPending || setPerson.isPending

  const invite = async (householdId: Id) => {
    const mealId = await getId()
    await addH.mutateAsync({ mealId, householdId })
    setInviting(false)
  }
  return (
    <View style={styles.guests}>
      {meal.households.map((h) => (
        <HouseholdGuests
          key={h.householdId}
          household={h}
          disabled={busy}
          onTogglePerson={(personId, present) =>
            meal.id && setPerson.mutate({ mealId: meal.id, personId, present })
          }
          onRemove={
            meal.id
              ? () => removeH.mutate({ mealId: meal.id as Id, householdId: h.householdId })
              : undefined
          }
        />
      ))}
      {inviting ? (
        <View style={{ gap: space.xs }}>
          <HouseholdSearch
            households={pool}
            excludeIds={meal.households.map((h) => h.householdId)}
            busy={addH.isPending}
            onAdd={invite}
            onCreate={async (name) => invite((await createH.mutateAsync(name)).id)}
          />
          <ActionLink label="Cancel" onPress={() => setInviting(false)} />
        </View>
      ) : (
        <ActionLink label="+ Invite a household" onPress={() => setInviting(true)} />
      )}
      <Total meal={meal} />
    </View>
  )
}

function Total({ meal }: { meal: HostedMeal }) {
  const n = meal.headcount.adults + meal.headcount.children
  const away = meal.households.map((h) => h.awayText).filter(Boolean)
  const parts = [meal.headcountText, ...away]
  return (
    <View style={styles.total}>
      <Text variant="h3">{n}</Text>
      <Text variant="small" style={{ flexShrink: 1 }}>
        {parts.join(' · ')}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- folded

export function FoldedMeal({ meal }: { meal: HostedMeal }) {
  const router = useRouter()
  const getId = useMealId(meal)
  const addH = useAddMealHousehold()
  const createH = useCreateContactHousehold()
  const pool = useGuestPool()
  const [inviting, setInviting] = useState(false)
  const n = meal.headcount.adults + meal.headcount.children
  const who = meal.households.map((h) => (h.isHost ? 'Us' : h.name)).join(', ')
  const invite = async (householdId: Id) => {
    const mealId = await getId()
    await addH.mutateAsync({ mealId, householdId })
    setInviting(false)
  }
  return (
    <View style={styles.folded}>
      <View style={styles.foldedRow}>
        <View style={styles.foldedSide}>
          <Text variant="bodyStrong">{meal.name}</Text>
          <Text variant="small">
            {meal.timeText ? `${timeLabel(meal.timeText)} · ` : ''}not planned
          </Text>
          <ActionLink
            label="Plan the menu"
            onPress={async () => router.push(wizardHref(await getId(), 'menu') as Href)}
          />
        </View>
        <View style={styles.foldedSide}>
          <Text variant="small" style={{ flexShrink: 1 }}>
            {who} · {n}
          </Text>
          <ActionLink label="+ Invite" onPress={() => setInviting(true)} />
        </View>
      </View>
      {inviting ? (
        <View style={{ gap: space.xs, maxWidth: 420 }}>
          <HouseholdSearch
            households={pool}
            excludeIds={meal.households.map((h) => h.householdId)}
            busy={addH.isPending}
            onAdd={invite}
            onCreate={async (name) => invite((await createH.mutateAsync(name)).id)}
          />
          <ActionLink label="Cancel" onPress={() => setInviting(false)} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  link: { minHeight: 28, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: fonts.bodySemiBold },
  headWrap: { gap: space.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', flex: 1 },
  input: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.input,
    backgroundColor: colors.dangerSoft,
  },
  menu: { gap: space.md, flex: 1 },
  course: { flexDirection: 'row', gap: space.md },
  courseName: { width: 72, paddingTop: 2 },
  dishes: { flex: 1, gap: space.xs },
  dish: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dishMain: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  flag: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  flagText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.xs },
  x: { paddingHorizontal: space.xs, minWidth: 24, alignItems: 'center' },
  guests: { gap: space.sm, flex: 1 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingTop: space.xs },
  folded: {
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.subtle,
  },
  foldedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
  },
  foldedSide: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
})
