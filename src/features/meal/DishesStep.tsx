import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Disclaimer,
  Empty,
  KindLabel,
  Loading,
  Pill,
  SectionHeader,
  Segmented,
  Text,
  TextField,
} from '@/components'
import { api } from '@/lib/api/client'
import { stale, useApiMutation, useSuggestions } from '@/lib/api/hooks'
import { COURSES, type Course, type Kind, type MealDetail, type Reason } from '@/lib/api/types'
import { formatMinutes } from '@/lib/units'
import { COURSE_LABEL, dishName } from '@/lib/strings'
import { colors, space, type Tone } from '@/theme/tokens'

import { MenuList } from './MenuList'

const REASON_TONE: Record<Reason['tone'], Tone> = {
  good: 'accent',
  info: 'info',
  warn: 'warn',
  muted: 'muted',
}

type Adding = null | 'choose' | { course: Course }

export function DishesStep({ detail }: { detail: MealDetail }) {
  const { meal } = detail
  const [adding, setAdding] = useState<Adding>(null)
  const remove = useApiMutation((id: string) => api.removeMenuItem(meal.id, id), stale.menu)
  const suggest = useApiMutation(() => api.suggestMenu(meal.id), stale.menu)

  return (
    <View style={styles.wrap}>
      <Card>
        <SectionHeader
          title="Menu"
          hint={
            meal.items.length
              ? undefined
              : 'The menu starts empty. Add what you want, or let Bishul suggest a menu.'
          }
        />
        {meal.items.length === 0 ? (
          <Empty>Nothing on the menu yet.</Empty>
        ) : (
          <MenuList items={meal.items} onRemove={(id) => remove.mutate(id)} />
        )}
        {suggest.error ? (
          <Text color={colors.danger}>{(suggest.error as Error).message}</Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="+ Add item" onPress={() => setAdding('choose')} />
          <Button
            label="Suggest a menu"
            variant="secondary"
            loading={suggest.isPending}
            onPress={() => suggest.mutate(undefined)}
          />
        </View>
      </Card>

      {adding === 'choose' ? (
        <Card tone="subtle">
          <SectionHeader title="What is it?" />
          <View style={styles.pills}>
            {COURSES.map((c) => (
              <Pill key={c} label={COURSE_LABEL[c]} onPress={() => setAdding({ course: c })} />
            ))}
          </View>
          <Button label="Cancel" variant="ghost" small onPress={() => setAdding(null)} />
        </Card>
      ) : null}

      {adding && adding !== 'choose' ? (
        <Picker
          detail={detail}
          course={adding.course}
          onDone={() => setAdding(null)}
          onBack={() => setAdding('choose')}
        />
      ) : null}
    </View>
  )
}

function Picker({
  detail,
  course,
  onDone,
  onBack,
}: {
  detail: MealDetail
  course: Course
  onDone: () => void
  onBack: () => void
}) {
  const { meal } = detail
  const { data, isLoading } = useSuggestions(meal.id, course)
  const add = useApiMutation(
    (versionId: string) => api.addMenuItem(meal.id, course, { versionId }),
    stale.menu,
  )
  const [showHidden, setShowHidden] = useState(false)
  const [bringing, setBringing] = useState(false)

  return (
    <Card tone="subtle">
      <SectionHeader
        title={`Pick a ${COURSE_LABEL[course].toLowerCase()}`}
        hint="Only dishes that fit the guests and the meal type are shown."
        right={<Button label="Change course" variant="ghost" small onPress={onBack} />}
      />
      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          {data.fits.length === 0 ? (
            <Empty>Nothing fits yet. Try someone bringing it.</Empty>
          ) : null}
          {data.fits.map((s) => (
            <Card key={s.versionId}>
              <View style={styles.sHead}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="h3">{dishName(s.title, s.versionLabel)}</Text>
                  <View style={styles.pills}>
                    <KindLabel kind={s.kind} />
                    <Badge label={`${formatMinutes(s.activeMin)} hands-on`} tone="muted" />
                    <Badge label={`${formatMinutes(s.totalMin)} total`} tone="muted" />
                  </View>
                </View>
                <Button
                  label="Add"
                  accessibilityLabel={`Add ${s.title}`}
                  loading={add.isPending && add.variables === s.versionId}
                  onPress={async () => {
                    await add.mutateAsync(s.versionId)
                    onDone()
                  }}
                />
              </View>
              <View style={styles.pills}>
                {s.reasons.map((r) => (
                  <Badge key={r.text} label={r.text} tone={REASON_TONE[r.tone]} />
                ))}
              </View>
              {s.adjustment ? (
                <Text variant="small" color={colors.warn}>
                  Adjustment: {s.adjustment}
                </Text>
              ) : null}
            </Card>
          ))}

          <View style={styles.actions}>
            <Button
              label="Someone’s bringing it"
              variant="secondary"
              onPress={() => setBringing(!bringing)}
            />
            <Button label="Cancel" variant="ghost" onPress={onDone} />
          </View>
          {bringing ? <Brought detail={detail} course={course} onDone={onDone} /> : null}

          <View style={styles.hidden}>
            <Button
              label={`Hidden for these guests (${data.hidden.length})`}
              variant="ghost"
              small
              onPress={() => setShowHidden(!showHidden)}
            />
            {showHidden ? (
              data.hidden.length === 0 ? (
                <Text color={colors.muted}>Nothing is hidden.</Text>
              ) : (
                data.hidden.map((h) => (
                  <View key={h.recipeId} style={styles.hiddenRow}>
                    <Text variant="bodyStrong">{h.title}</Text>
                    <Text variant="small">{h.why}</Text>
                  </View>
                ))
              )
            ) : null}
          </View>
          {data.hasAllergyChecks ? <Disclaimer /> : null}
        </>
      )}
    </Card>
  )
}

function Brought({
  detail,
  course,
  onDone,
}: {
  detail: MealDetail
  course: Course
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [by, setBy] = useState('')
  const [kind, setKind] = useState<Kind>(detail.meal.kind)
  const add = useApiMutation(
    () =>
      api.addMenuItem(detail.meal.id, course, {
        brought: { name: name.trim(), by: by.trim(), kind },
      }),
    stale.menu,
  )
  return (
    <Card>
      <Text variant="h3">Someone’s bringing it</Text>
      <Text variant="small">
        It counts for balance and kashrut, but stays out of shopping, the pantry and cooking.
      </Text>
      <TextField label="Dish" value={name} onChangeText={setName} placeholder="e.g. Potatoes" />
      <TextField
        label="Who is bringing it"
        value={by}
        onChangeText={setBy}
        placeholder="e.g. Ruth"
      />
      <View style={styles.pills}>
        {detail.people
          .filter((p) => p.coming)
          .map((p) => (
            <Pill
              key={p.person.id}
              label={p.person.name}
              selected={by === p.person.name}
              onPress={() => setBy(p.person.name)}
            />
          ))}
      </View>
      <Segmented
        options={[
          { value: 'meat', label: 'Meat' },
          { value: 'dairy', label: 'Dairy' },
          { value: 'parve', label: 'Parve' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Button
        label="Add brought dish"
        disabled={!name.trim() || !by.trim()}
        loading={add.isPending}
        onPress={async () => {
          await add.mutateAsync(undefined)
          onDone()
        }}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  sHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', flexWrap: 'wrap' },
  hidden: { gap: space.sm },
  hiddenRow: { gap: 2, paddingVertical: space.xs },
})
