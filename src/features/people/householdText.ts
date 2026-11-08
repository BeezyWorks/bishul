import type { ConstraintLabel, Household, Person } from '@/lib/api/types'
import { countsText } from '@/lib/plan'

export const labelOf = (p: Person): ConstraintLabel[] =>
  p.constraints.map((c) => ({
    text: c.label,
    strict: c.severity === 'strict',
    strictAllergy: c.tagType === 'allergen' && c.severity === 'strict',
  }))

/** Everyone's constraints combined and deduplicated, strict allergies first. */
export function combinedConstraints(people: Person[]): ConstraintLabel[] {
  const seen = new Map<string, ConstraintLabel>()
  for (const p of people)
    for (const c of labelOf(p)) {
      const prev = seen.get(c.text)
      if (!prev || (c.strictAllergy && !prev.strictAllergy)) seen.set(c.text, c)
    }
  return [...seen.values()].sort((a, b) => Number(b.strictAllergy) - Number(a.strictAllergy))
}

export function householdCounts(h: Household): string {
  const children = h.people.filter((p) => p.isChild).length
  return countsText({ adults: h.people.length - children, children })
}

/** Household name, with your own shown as "Us". */
export const displayName = (h: Household) => (h.isOwn ? 'Us' : h.name)

/** Household name or any member name contains the query. */
export function matches(h: Household, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  return (
    displayName(h).toLowerCase().includes(n) ||
    h.name.toLowerCase().includes(n) ||
    h.people.some((p) => p.name.toLowerCase().includes(n))
  )
}
