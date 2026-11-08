import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button, Empty, Loading, Pill, Screen, Segmented, Text, useLayout } from '@/components'
import { useHosted } from '@/lib/api/hooks'
import type { HostedHolyDay, HostedMeal, HostedPage } from '@/lib/api/types'
import { hostedHref, printHref } from '@/lib/plan'
import { colors, radius, size, space } from '@/theme/tokens'

import { AddMealForm } from './AddMealForm'
import { dateRange } from './dates'
import { FoldedMeal, GuestsColumn, MealHeading, MenuColumn } from './MealParts'
import { ProblemsBox } from './ProblemsBox'

type Filter = 'all' | 'plan' | 'guests' | 'problems'

const matches = (m: HostedMeal, f: Filter): boolean =>
  f === 'all' ||
  (f === 'plan' && !m.planned) ||
  (f === 'guests' && m.hasGuests) ||
  (f === 'problems' && m.problems.total > 0)

export function HostedScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const router = useRouter()
  const { data, isLoading, error } = useHosted(key)

  // Opening meal-<id> for a meal in a run returns the run: show its key in the URL.
  useEffect(() => {
    if (data && data.key !== key) router.replace(hostedHref(data.key) as never)
  }, [data, key, router])

  const back = { label: 'Plan', href: '/' }
  if (isLoading) {
    return (
      <Screen back={back}>
        <Loading />
      </Screen>
    )
  }
  if (error || !data) {
    return (
      <Screen back={back}>
        <Empty>This meal is no longer here. It may have been removed.</Empty>
      </Screen>
    )
  }
  return <HostedBody page={data} />
}

function HostedBody({ page }: { page: HostedPage }) {
  const { phone } = useLayout()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const all = page.days.flatMap((d) => d.meals)
  const count = (f: Filter) => all.filter((m) => matches(m, f)).length
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `All ${all.length} ${all.length === 1 ? 'meal' : 'meals'}` },
    { value: 'plan', label: `Needs planning · ${count('plan')}` },
    { value: 'guests', label: `Has guests · ${count('guests')}` },
    { value: 'problems', label: `Has problems · ${count('problems')}` },
  ]

  return (
    <Screen
      back={{ label: 'Plan', href: '/' }}
      title={page.title}
      subtitle={`${dateRange(page.from, page.to)} · ${page.totals.meals} ${
        page.totals.meals === 1 ? 'meal' : 'meals'
      }`}
      actions={
        <View style={styles.actions}>
          <Button label="Print menu" variant="secondary" small href={printHref(page.key)} />
          <Button label="Shopping list" variant="secondary" small href="/shopping" />
          <Button label="Prep schedule" variant="secondary" small href="/prep" />
        </View>
      }
    >
      <View style={styles.filters} accessibilityRole="tablist">
        <Text variant="label">Show</Text>
        {filters.map((f) => (
          <Pill
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      {phone ? (
        <PhoneView page={page} filter={filter} selected={selected} onSelect={setSelected} />
      ) : (
        <WideView page={page} filter={filter} />
      )}

      <ProblemsBox page={page} />
    </Screen>
  )
}

// ---------------------------------------------------------------- wide

function WideView({ page, filter }: { page: HostedPage; filter: Filter }) {
  const days = page.days
    .map((d) => ({ ...d, shown: d.meals.filter((m) => matches(m, filter)) }))
    .filter((d) => filter === 'all' || d.shown.length > 0)
  if (!days.length) return <Empty>No meals match this filter.</Empty>
  return (
    <View style={{ gap: space.xl }}>
      <View style={styles.cols}>
        <Text variant="label" style={{ flex: 3 }}>
          Menu
        </Text>
        <Text variant="label" style={{ flex: 2 }}>
          Attending
        </Text>
      </View>
      {days.map((d) => (
        <View key={d.date} style={{ gap: space.md }}>
          {d.label ? (
            <Text variant="h2" accessibilityRole="header">
              {d.label}
            </Text>
          ) : null}
          {d.shown.map((m) =>
            m.planned ? (
              <MealRow key={m.id ?? m.hostedKey + m.slot} meal={m} />
            ) : (
              <FoldedMeal key={m.id ?? `${m.date}-${m.slot}`} meal={m} />
            ),
          )}
          {filter === 'all' ? <AddMealForm day={d as HostedHolyDay} /> : null}
        </View>
      ))}
    </View>
  )
}

function MealRow({ meal }: { meal: HostedMeal }) {
  return (
    <View style={styles.row}>
      <MealHeading meal={meal} />
      <View style={styles.rowBody}>
        <View style={{ flex: 3 }}>
          <MenuColumn meal={meal} />
        </View>
        <View style={{ flex: 2 }}>
          <GuestsColumn meal={meal} />
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------- phone

function PhoneView({
  page,
  filter,
  selected,
  onSelect,
}: {
  page: HostedPage
  filter: Filter
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [tab, setTab] = useState<'menu' | 'attending'>('menu')
  const [listOpen, setListOpen] = useState(false)
  const entries = page.days.flatMap((d) =>
    d.meals
      .filter((m) => matches(m, filter))
      .map((m) => ({ id: m.id ?? `${m.date}-${m.slot}`, meal: m, day: d })),
  )
  if (!entries.length) return <Empty>No meals match this filter.</Empty>
  const current = entries.find((e) => e.id === selected) ?? entries[0]
  const label = (e: (typeof entries)[number]) =>
    [e.meal.name, e.day.label].filter(Boolean).join(' · ')
  const m = current.meal
  return (
    <View style={{ gap: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a meal"
        accessibilityState={{ expanded: listOpen }}
        onPress={() => setListOpen((v) => !v)}
        style={styles.select}
      >
        <Text style={{ flex: 1 }}>
          {label(current)} · {m.headcount.adults + m.headcount.children}
        </Text>
        <Text color={colors.muted}>{listOpen ? '▴' : '▾'}</Text>
      </Pressable>
      {listOpen ? (
        <View style={styles.options}>
          {entries.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="menuitem"
              onPress={() => {
                onSelect(e.id)
                setListOpen(false)
              }}
              style={[styles.option, e.id === current.id && { backgroundColor: colors.accentSoft }]}
            >
              <Text>{label(e)}</Text>
              {!e.meal.planned ? <Text variant="small">not planned</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {m.planned ? (
        <>
          <MealHeading meal={m} />
          <Segmented
            options={[
              { value: 'menu', label: 'Menu' },
              { value: 'attending', label: 'Attending' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'menu' ? <MenuColumn meal={m} /> : <GuestsColumn meal={m} />}
        </>
      ) : (
        <FoldedMeal meal={m} />
      )}
      {filter === 'all' ? <AddMealForm day={current.day} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  cols: { flexDirection: 'row', gap: space.xl, paddingHorizontal: space.lg },
  row: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rowBody: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  options: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: space.md },
})
