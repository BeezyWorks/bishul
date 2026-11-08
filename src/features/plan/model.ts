import type { RunSummary, WeekDay } from '@/lib/api/types'

/** What the week strip draws: a plain day cell, or one tile for a run of Shabbat / Yom Tov days. */
export type Segment =
  { kind: 'day'; day: WeekDay } | { kind: 'run'; run: RunSummary; days: WeekDay[] }

/** Group consecutive holy-day dates of the same run into one tile (clipped to the days we have). */
export function buildSegments(days: WeekDay[], runs: RunSummary[]): Segment[] {
  const out: Segment[] = []
  for (const day of days) {
    const run = day.holyDay ? runs.find((r) => r.key === day.holyDay!.runKey) : undefined
    if (!day.holyDay || !run) {
      out.push({ kind: 'day', day })
      continue
    }
    const last = out[out.length - 1]
    if (last && last.kind === 'run' && last.run.key === run.key) last.days.push(day)
    else out.push({ kind: 'run', run, days: [day] })
  }
  return out
}

/** `Sun 8`-style short pieces the cells share. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
