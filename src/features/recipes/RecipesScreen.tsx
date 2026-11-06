import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

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
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const recipes = useRecipes(query, filters)
  const collections = useCollections()
  const household = useHousehold()
  const contacts = useContacts()
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
        <Pill label="+ New" dashed onPress={() => setNaming(!naming)} />
      </View>

      {naming ? (
        <Card tone="subtle">
          <Text>Save the current filters as a collection.</Text>
          <View style={styles.wrapRow}>
            <TextField
              label="Collection name"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Sheva brachot"
            />
            <Button
              label="Save"
              disabled={!newName.trim()}
              loading={saveCollection.isPending}
              onPress={async () => {
                await saveCollection.mutateAsync(newName.trim())
                setNewName('')
                setNaming(false)
              }}
            />
          </View>
        </Card>
      ) : null}

      <View style={styles.wrapRow}>
        <Button
          label={showFilters ? 'Hide filters' : `Filters${activeCount ? ` (${activeCount})` : ''}`}
          variant="secondary"
          small
          onPress={() => setShowFilters(!showFilters)}
        />
        <Text variant="small">Sort</Text>
        {SORTS.map((s) => (
          <Pill
            key={s.value}
            label={s.label}
            selected={(filters.sort ?? 'relevance') === s.value}
            onPress={() => set({ sort: s.value })}
          />
        ))}
      </View>

      {showFilters ? (
        <Card>
          <FilterGroup label="Course">
            {COURSES.map((c: Course) => (
              <Pill
                key={c}
                label={COURSE_LABEL[c]}
                selected={filters.course === c}
                onPress={() => toggle('course', c)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Meat, dairy or parve">
            {KINDS.map((k) => (
              <Pill
                key={k}
                label={KIND_LABEL[k]}
                selected={filters.kind === k}
                onPress={() => toggle('kind', k)}
              />
            ))}
          </FilterGroup>
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
          <FilterGroup label="Difficulty">
            {DIFFS.map((d) => (
              <Pill
                key={d}
                label={d}
                selected={filters.difficulty === d}
                onPress={() => toggle('difficulty', d)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Cost">
            {COSTS.map((c) => (
              <Pill
                key={c}
                label={c}
                selected={filters.cost === c}
                onPress={() => toggle('cost', c)}
              />
            ))}
          </FilterGroup>
          <Button
            label="Clear filters"
            variant="ghost"
            small
            onPress={() => setFilters({ sort: filters.sort })}
          />
        </Card>
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
