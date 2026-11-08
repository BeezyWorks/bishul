import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, HouseholdGuests, HouseholdSearch, Text } from '@/components'
import {
  useAddMealHousehold,
  useCreateContactHousehold,
  useGuestPool,
  useRemoveMealHousehold,
  useSetMealPerson,
} from '@/lib/api/hooks'
import type { HostedMeal } from '@/lib/api/types'
import { countsText } from '@/lib/plan'
import { colors, space } from '@/theme/tokens'

/** Step 1: search households to add, then the list of who's coming (your own household first). */
export function GuestsStep({ meal, onNext }: { meal: HostedMeal; onNext: () => void }) {
  const pool = useGuestPool()
  const add = useAddMealHousehold()
  const remove = useRemoveMealHousehold()
  const setPerson = useSetMealPerson()
  const create = useCreateContactHousehold()
  const mealId = meal.id!
  const busy = add.isPending || remove.isPending || setPerson.isPending || create.isPending

  const totals = meal.households.reduce(
    (t, h) => ({
      adults: t.adults + h.counts.adults,
      children: t.children + h.counts.children,
      total: t.total + h.counts.total,
    }),
    { adults: 0, children: 0, total: 0 },
  )
  const error = add.error ?? remove.error ?? setPerson.error ?? create.error

  return (
    <View style={styles.wrap}>
      <HouseholdSearch
        households={pool}
        excludeIds={meal.households.map((h) => h.householdId)}
        busy={create.isPending || add.isPending}
        onAdd={(householdId) => add.mutate({ mealId, householdId })}
        onCreate={async (name) => {
          const h = await create.mutateAsync(name)
          add.mutate({ mealId, householdId: h.id })
        }}
      />
      <Card>
        {meal.households.map((h) => (
          <HouseholdGuests
            key={h.householdId}
            household={h}
            disabled={busy}
            onTogglePerson={(personId, present) => setPerson.mutate({ mealId, personId, present })}
            onRemove={() => remove.mutate({ mealId, householdId: h.householdId })}
          />
        ))}
      </Card>
      {error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(error as Error).message}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <View style={styles.total}>
          <Text variant="display">{totals.total}</Text>
          <Text color={colors.muted}>{countsText(totals)}</Text>
        </View>
        <Button label="Next: menu" onPress={onNext} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
})
