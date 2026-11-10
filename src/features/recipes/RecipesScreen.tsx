import type { NutritionGoal } from '@tavshil/core/src/nutrition'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Disclaimer,
  Empty,
  ListRow,
  Loading,
  Pill,
  Screen,
  SearchField,
  Segmented,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import {
  stale,
  useApiMutation,
  useCollections,
  useContacts,
  useHousehold,
  useRecipes,
  useTags,
  useToday,
} from '@/lib/api/hooks'
import {
  COURSES,
  type Cost,
  type Course,
  type Difficulty,
  type Kind,
  type RecipeFilters,
  type RecipeSort,
} from '@/lib/api/types'
import { diffDays, shortDate } from '@/lib/dates'
import { COURSE_LABEL, KIND_LABEL } from '@/lib/strings'
import { formatMinutes } from '@/lib/units'
import { colors, space } from '@/theme/tokens'

const SORTS: { value: RecipeSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'quickest', label: 'Quickest' },
  { value: 'easiest', label: 'Easiest' },
  { value: 'longest-unserved', label: 'Longest unserved' },
  { value: 'a-z', label: 'A to Z' },
  { value: 'protein', label: 'Most protein' },
  { value: 'fiber', label: 'Most fiber' },
]
const GOALS: { value: NutritionGoal; label: string }[] = [
  { value: 'high_protein', label: 'High protein' },
  { value: 'high_fiber', label: 'High fiber' },
  { value: 'low_calorie', label: 'Low calorie' },
  { value: 'low_carb', label: 'Low carb' },
]
const DIFFS: Difficulty[] = ['easy', 'average', 'a pain']
const COSTS: Cost[] = ['$', '$$', '$$$']
const KINDS: Kind[] = ['meat', 'dairy', 'parve']

const same = (a: RecipeFilters, b: RecipeFilters) =>
  JSON.stringify(strip(a)) === JSON.stringify(strip(b))
const strip = (f: RecipeFilters) => {
  const { sort: _s, ...rest } = f
  return Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)),
  )
}

export function RecipesScreen() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<RecipeFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [newName, setNewName] = useState('')
  const recipes = useRecipes(query, filters)
  const collections = useCollections()
  const household = useHousehold()
  const contacts = useContacts()
  const tags = useTags()
  const today = useToday()
  const saveCollection = useApiMutation(
    (name: string) => api.saveCollection(name, { ...filters, sort: undefined }),
    stale.collections,
  )

  const set = (patch: Partial<RecipeFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const toggle = <K extends keyof RecipeFilters>(k: K, v: RecipeFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: f[k] === v ? undefined : v }))
  const people = [
    ...(household.data?.people ?? []),
    ...(contacts.data ?? []).flatMap((h) => h.people),
  ]
  const safeFor = filters.safeFor ?? []
  const activeCount = Object.keys(strip(filters)).length

  return (
    <Screen
      title="Recipes"
      subtitle="Your household library. Search in any spelling: Shabbos or Shabbat, it finds both."
      actions={<Button label="Import a recipe" href="/recipes/import" variant="soft" />}
    >
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search recipes, ingredients, versions"
      />

      <View style={styles.wrapRow}>
        <Pill label="All" selected={activeCount === 0} onPress={() => setFilters({})} />
        {(collections.data ?? []).map((c) => (
          <Pill
            key={c.id}
            label={c.name}
            selected={activeCount > 0 && same(filters, c.filters)}
            onPress={() => setFilters({ ...c.filters })}
          />
        ))}
      </View>

      <View style={styles.toolbar}>
        <Pill
          label={`Filters${activeCount ? ` (${activeCount})` : ''}  ${showFilters ? '▴' : '▾'}`}
          selected={activeCount > 0}
          onPress={() => setShowFilters(!showFilters)}
        />
        <View style={styles.sortRow}>
          <Text variant="small">Sort by</Text>
          <Segmented
            options={SORTS}
            value={filters.sort ?? 'relevance'}
            onChange={(v) => set({ sort: v })}
          />
        </View>
      </View>

      {showFilters ? (
        <Reveal>
          <Card>
            <FilterGroup label="Course">
              <Single
                value={filters.course}
                options={COURSES.map((c) => ({ value: c, label: COURSE_LABEL[c] }))}
                onChange={(v) => set({ course: v })}
              />
            </FilterGroup>
            <FilterGroup label="Meat, dairy or parve">
              <Single
                value={filters.kind}
                options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                onChange={(v) => set({ kind: v })}
              />
            </FilterGroup>
            {tags.data?.length ? (
              <FilterGroup label="Tags">
                {tags.data.slice(0, 30).map((t) => {
                  const on = !!filters.tags?.some((x) => x.toLowerCase() === t.tag.toLowerCase())
                  return (
                    <Pill
                      key={t.tag}
                      label={`${t.tag} (${t.recipes})`}
                      selected={on}
                      onPress={() => {
                        const cur = filters.tags ?? []
                        set({
                          tags: on
                            ? cur.filter((x) => x.toLowerCase() !== t.tag.toLowerCase())
                            : [...cur, t.tag],
                        })
                      }}
                    />
                  )
                })}
              </FilterGroup>
            ) : null}
            <FilterGroup label="Safe for">
              {people.map((p) => (
                <Pill
                  key={p.id}
                  label={p.name}
                  selected={safeFor.includes(p.id)}
                  onPress={() =>
                    set({
                      safeFor: safeFor.includes(p.id)
                        ? safeFor.filter((x) => x !== p.id)
                        : [...safeFor, p.id],
                    })
                  }
                />
              ))}
            </FilterGroup>
            <FilterGroup label="More">
              <Pill
                label="Pesach-friendly"
                selected={!!filters.pesachFriendly}
                onPress={() => toggle('pesachFriendly', true)}
              />
              <Pill
                label="Under 45 min"
                selected={filters.underMinutes === 45}
                onPress={() => toggle('underMinutes', 45)}
              />
              <Pill
                label="Not served in 4 weeks"
                selected={filters.notServedWeeks === 4}
                onPress={() => toggle('notServedWeeks', 4)}
              />
            </FilterGroup>
            <FilterGroup label="Nutrition, per serving">
              {GOALS.map((g) => (
                <Pill
                  key={g.value}
                  label={g.label}
                  selected={!!filters.nutrition?.includes(g.value)}
                  onPress={() => {
                    const cur = filters.nutrition ?? []
                    set({
                      nutrition: cur.includes(g.value)
                        ? cur.filter((x) => x !== g.value)
                        : [...cur, g.value],
                    })
                  }}
                />
              ))}
              <TextField
                label="Protein at least (g)"
                value={filters.minProteinG ? String(filters.minProteinG) : ''}
                keyboardType="numeric"
                onChangeText={(t) => {
                  const n = Number(t)
                  set({ minProteinG: t.trim() && n > 0 ? n : undefined })
                }}
              />
            </FilterGroup>
            <FilterGroup label="Difficulty">
              <Single
                value={filters.difficulty}
                options={DIFFS.map((d) => ({ value: d, label: d }))}
                onChange={(v) => set({ difficulty: v })}
              />
            </FilterGroup>
            <FilterGroup label="Cost">
              <Single
                value={filters.cost}
                options={COSTS.map((c) => ({ value: c, label: c }))}
                onChange={(v) => set({ cost: v })}
              />
            </FilterGroup>
            <Button
              label="Clear filters"
              variant="ghost"
              small
              onPress={() => setFilters({ sort: filters.sort })}
            />
            {activeCount > 0 ? (
              <FilterGroup label="Save these filters as a collection">
                <TextField
                  label="Collection name"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Sheva brachot"
                />
                <Button
                  label="Save collection"
                  variant="secondary"
                  disabled={!newName.trim()}
                  loading={saveCollection.isPending}
                  onPress={async () => {
                    await saveCollection.mutateAsync(newName.trim())
                    setNewName('')
                  }}
                />
              </FilterGroup>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {recipes.isLoading || !recipes.data ? (
        <Loading />
      ) : recipes.data.length === 0 && activeCount === 0 && !query.trim() ? (
        <FirstRun />
      ) : recipes.data.length === 0 ? (
        <Empty>No recipes match. Loosen a filter.</Empty>
      ) : (
        <Card>
          <Text variant="small">
            {recipes.data.length} recipe{recipes.data.length === 1 ? '' : 's'}
          </Text>
          {recipes.data.map((r, i) => (
            <ListRow
              key={r.id}
              title={r.title}
              subtitle={[
                COURSE_LABEL[r.course],
                r.form,
                `${r.versionCount} version${r.versionCount === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              href={`/recipes/${r.id}`}
              last={i === recipes.data.length - 1}
            >
              <View style={styles.badges}>
                {r.kinds.map((k) => (
                  <Badge key={k} label={KIND_LABEL[k]} />
                ))}
                <Badge label={formatMinutes(r.totalMin)} tone="muted" />
                <Badge label={r.difficulty} tone="muted" />
                <Badge label={r.cost} tone="muted" />
                {r.nutrition?.proteinG !== undefined || r.nutrition?.fiberG !== undefined ? (
                  <Badge
                    label={[
                      r.nutrition.proteinG !== undefined
                        ? `${Math.round(r.nutrition.proteinG)} g protein`
                        : '',
                      r.nutrition.fiberG !== undefined
                        ? `${Math.round(r.nutrition.fiberG)} g fiber`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    tone="info"
                  />
                ) : null}
                {r.pesachFriendly ? (
                  <Badge
                    label={r.pesachKitniyot ? 'Pesach, with kitniyot' : 'Pesach-friendly'}
                    tone="info"
                  />
                ) : null}
                <Badge
                  label={
                    r.lastServed
                      ? `Served ${shortDate(r.lastServed)}${today ? ` (${Math.round(diffDays(r.lastServed, today) / 7)} wk ago)` : ''}`
                      : 'Never served'
                  }
                  tone="muted"
                />
              </View>
              {r.unsafeFor.map((u) => (
                <Text key={u.personId} variant="small" color={colors.warn}>
                  {u.personName}: {u.reason}
                </Text>
              ))}
            </ListRow>
          ))}
        </Card>
      )}
      {safeFor.length ? <Disclaimer /> : null}
    </Screen>
  )
}

/** A new household has no recipes: point at the two ways to get some. */
function FirstRun() {
  return (
    <Card tone="subtle">
      <Text variant="h2" accessibilityRole="header">
        No recipes yet
      </Text>
      <Text>
        Paste one in, or let your AI do the typing: ask it to add your recipes, and it will
        structure them for you.
      </Text>
      <View style={styles.wrapRow}>
        <Button label="Import a recipe" href="/recipes/import" />
        <Button label="Connect your AI" href="/settings" variant="secondary" />
      </View>
    </Card>
  )
}

/** Fades and slides its content in, so an opening panel reads as a response to the tap. */
function Reveal({ children }: { children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [t])
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  )
}

/** Pick one, or "Any" for no restriction. Multi-select groups stay as toggle chips. */
function Single<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T | undefined) => void
}) {
  return (
    <Segmented<T | 'any'>
      options={[{ value: 'any', label: 'Any' }, ...options]}
      value={value ?? 'any'}
      onChange={(v) => onChange(v === 'any' ? undefined : v)}
    />
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <View style={styles.wrapRow}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
  toolbar: { gap: space.sm },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
