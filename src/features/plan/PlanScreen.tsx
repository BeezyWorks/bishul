import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React from 'react'

import { Screen } from '@/components'
import type { ISODate } from '@/lib/api/types'
import { planHref } from '@/lib/plan'

import { MonthView } from './MonthView'
import { WeekView } from './WeekView'

const isDate = (s?: string): s is ISODate => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** The Plan tab: this week as a strip of days, with a Month toggle. URL: `/?week=YYYY-MM-DD&view=month`. */
export function PlanScreen() {
  const params = useLocalSearchParams<{ week?: string; view?: string }>()
  const router = useRouter()
  const week = isDate(params.week) ? params.week : undefined
  const go = (o: { week?: ISODate; view?: 'week' | 'month' }) => router.replace(planHref(o) as Href)
  return (
    <Screen>
      {params.view === 'month' ? (
        <MonthView anchor={week} go={go} />
      ) : (
        <WeekView week={week} go={go} />
      )}
    </Screen>
  )
}
