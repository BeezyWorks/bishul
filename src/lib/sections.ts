// Recipes in several parts: ingredients and steps carry an optional section ("Cake", "Mousse > Meringue").

export const SECTION_SEP = ' > '

export interface SectionLine {
  text: string
  section?: string
}

/** The names from the top level down: "Mousse > Meringue" is ['Mousse', 'Meringue']. */
export const sectionPath = (section?: string): string[] =>
  (section ?? '')
    .split('>')
    .map((x) => x.trim())
    .filter(Boolean)

/** Consecutive items sharing a section, in order. A recipe with no sections is one untitled group. */
export function groupBySection<T extends { section?: string }>(items: T[]) {
  const groups: { section: string; path: string[]; items: T[] }[] = []
  for (const item of items) {
    const section = sectionPath(item.section).join(SECTION_SEP)
    const last = groups[groups.length - 1]
    if (last && last.section === section) last.items.push(item)
    else groups.push({ section, path: sectionPath(section), items: [item] })
  }
  return groups
}

/**
 * What to show as the heading of a group: the part of its path not already shown by the group before it.
 * "Mousse > Meringue" after "Mousse > Cream" shows only "Meringue"; after "Cake" it shows both.
 * Null when there is no section.
 */
export function headingFor(
  path: string[],
  previous: string[],
): { depth: number; title: string } | null {
  if (!path.length) return null
  let shared = 0
  while (shared < path.length && previous[shared] === path[shared]) shared++
  // Back out to a parent ("Mousse > Meringue", then "Mousse"): name it again so it reads as a new group.
  if (shared === path.length) return { depth: path.length - 1, title: path[path.length - 1] }
  return { depth: shared, title: path.slice(shared).join(SECTION_SEP) }
}

/** The editor's text: one line per item, with "## Name" lines (one more # per level) between the parts. */
export function toEditorText(items: SectionLine[]): string {
  const out: string[] = []
  let prev: string[] = []
  for (const g of groupBySection(items)) {
    const heading = headingFor(g.path, prev)
    if (heading) {
      for (let d = heading.depth; d < g.path.length; d++)
        out.push(`${'#'.repeat(d + 2)} ${g.path[d]}`)
    } else if (!g.path.length && prev.length) {
      out.push('## ')
    }
    prev = g.path
    out.push(...g.items.map((i) => i.text))
  }
  return out.join('\n')
}

/** The reverse of `toEditorText`; blank lines are dropped. */
export function fromEditorText(text: string): SectionLine[] {
  const out: SectionLine[] = []
  let stack: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const h = /^(#{2,6})\s*(.*)$/.exec(line)
    if (h) {
      const keep = stack.slice(0, h[1].length - 2)
      stack = h[2].trim() ? [...keep, h[2].trim()] : keep
      continue
    }
    out.push({ text: line, ...(stack.length && { section: stack.join(SECTION_SEP) }) })
  }
  return out
}

export const sameLines = (a: SectionLine[], b: SectionLine[]) =>
  a.length === b.length &&
  a.every((x, i) => x.text === b[i].text && (x.section ?? '') === (b[i].section ?? ''))
