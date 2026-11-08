import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Card, Text, useLayout } from '@/components'
import { usePlan } from '@/lib/api/hooks'
import type { ISODate, MealCard, PlanView, WeekDay } from '@/lib/api/types'
import { addDays, weekdayName } from '@/lib/dates'
import { hostedHref, summaryLine } from '@/lib/plan'
import { colors, space } from '@/theme/tokens'

import { plural } from './model'

interface Info {
  /** Meal name when it adds something (hosted, holy day). */
  name?: string
  /** The dishes, or why there are none. */
  line: string
  muted?: boolean
  sub?: string
  href?: string
}

const people = (m: MealCard) =>
  [
    m.headcount.total
      ? m.hosted
        ? plural(m.headcount.total, 'person', 'people')
        : `Us · ${m.headcount.total}`
      : '',
    m.awayText ? `(${m.awayText})` : '',
  ]
    .filter(Boolean)
    .join(' ')

const ofMeal = (m: MealCard, name?: string): Info => ({
  name: name ?? (m.hosted ? m.name : undefined),
  line: m.summary.length ? summaryLine(m.summary) : 'Not planned',
  muted: !m.summary.length,
  sub: people(m) || undefined,
  href: m.hosted ? hostedHref(m.hostedKey) : undefined,
})

/** The dinner of a civil evening, as the strip would show it. */
function dinnerOf(day?: WeekDay): Info | null {
  if (!day) return null
  if (day.eve)
    return day.eve.meal
      ? ofMeal(day.eve.meal, day.eve.mealName)
      : { name: day.eve.mealName, line: 'Not planned', muted: true }
  const m = day.meals.find((x) => x.slot === 'dinner')
  if (m) return ofMeal(m)
  if (day.holyDay)
    return { name: day.holyDay.label, line: 'Open the meals', href: hostedHref(day.holyDay.runKey) }
  return { line: 'Nothing planned', muted: true }
}

/** The first hosted meal from today on: a weekday one or a meal inside a run. */
function nextHosted(view: PlanView): { meal: MealCard; runTitle?: string } | null {
  let best: { meal: MealCard; runTitle?: string } | null = null
  const consider = (meal: MealCard, runTitle?: string) => {
    if (meal.date < view.today) return
    if (!best || meal.date < best.meal.date) best = { meal, runTitle }
  }
  for (const d of view.days) for (const m of d.meals) if (m.hosted) consider(m)
  for (const r of view.runs)
    for (const h of r.holyDays) for (const m of h.meals) consider(m, r.title)
  return best
}

/** Tonight, tomorrow night and the next hosted meal. Looks three weeks ahead, whichever week is on screen. */
export function UpNext({ today }: { today: ISODate }) {
  const { wide } = useLayout()
  const router = useRouter()
  const q = usePlan(today, addDays(today, 21))
  const byDate = new Map((q.data?.days ?? []).map((d) => [d.date, d]))
  const next = q.data ? nextHosted(q.data) : null
  const nextInfo: Info | null = next
    ? {
        name: `${next.meal.name}, ${weekdayName(next.meal.date, true)}`,
        line: [people(next.meal) || null, next.meal.planned ? 'menu planned' : 'menu not planned']
          .filter(Boolean)
          .join(' · '),
        muted: false,
        href: hostedHref(next.meal.hostedKey),
      }
    : null

  const cards: { eyebrow: string; info: Info | null }[] = [
    { eyebrow: 'Tonight', info: dinnerOf(byDate.get(today)) },
    { eyebrow: 'Tomorrow night', info: dinnerOf(byDate.get(addDays(today, 1))) },
    {
      eyebrow: 'Next hosted meal',
      info: nextInfo ?? (q.data ? { line: 'Nothing hosted coming up', muted: true } : null),
    },
  ]
  return (
    <View style={[styles.row, !wide && styles.col]}>
      {cards.map((c) => (
        <Pressable
          key={c.eyebrow}
          accessibilityRole={c.info?.href ? 'link' : undefined}
          disabled={!c.info?.href}
          onPress={() => c.info?.href && router.push(c.info.href as Href)}
          style={styles.item}
        >
          <Card>
            <Text variant="label">{c.eyebrow}</Text>
            {c.info ? (
              <>
                {c.info.name && c.eyebrow !== 'Next hosted meal' ? (
                  <Text variant="small" color={colors.info}>
                    {c.info.name}
                  </Text>
                ) : null}
                <Text
                  variant="h3"
                  numberOfLines={2}
                  color={c.info.muted ? colors.muted : undefined}
                  style={c.info.muted ? { fontStyle: 'italic' } : undefined}
                >
                  {c.eyebrow === 'Next hosted meal' && c.info.name ? c.info.name : c.info.line}
                </Text>
                {c.eyebrow === 'Next hosted meal' ? (
                  <Text variant="small">{c.info.line}</Text>
                ) : c.info.sub ? (
                  <Text variant="small">{c.info.sub}</Text>
                ) : null}
              </>
            ) : (
              <Text variant="small">Loading...</Text>
            )}
          </Card>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  col: { flexDirection: 'column' },
  item: { flex: 1 },
})
