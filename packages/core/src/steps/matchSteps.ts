/**
 * Links each step of a pasted recipe to the ingredients it names. Plain text matching, no AI: the host checks the
 * result on the recipe page. A step only matches ingredients from its own part when both are in parts.
 */

export interface MatchIngredient {
  /** The parsed ingredient name ("all-purpose flour"). */
  name: string
  /** The line as written, to spot "divided". */
  original?: string
  section?: string | null
}

export interface MatchStep {
  text: string
  section?: string | null
}

/** Per step, the ingredients it uses: positions in the ingredient list, with a portion when it is shared. */
export type StepUses = { ingredient: number; portion?: number }[]

const norm = (x: string) =>
  ` ${x
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

const sectionKey = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Singular and plural spellings of a word. */
function wordForms(w: string): string[] {
  const out = new Set([w])
  if (w.endsWith('ies')) out.add(`${w.slice(0, -3)}y`)
  else if (w.endsWith('oes') || w.endsWith('shes') || w.endsWith('ches')) out.add(w.slice(0, -2))
  else if (w.endsWith('s') && !w.endsWith('ss')) out.add(w.slice(0, -1))
  if (w.endsWith('y') && !/[aeiou]y$/.test(w)) out.add(`${w.slice(0, -1)}ies`)
  else if (/(?:o|sh|ch|s|x)$/.test(w)) out.add(`${w}es`)
  else if (!w.endsWith('s')) out.add(`${w}s`)
  return [...out]
}

/** A phrase in all its forms, varying the last word. */
function phraseForms(phrase: string): string[] {
  const words = phrase.trim().split(' ').filter(Boolean)
  if (!words.length) return []
  const head = words.slice(0, -1).join(' ')
  return wordForms(words[words.length - 1]).map((w) => (head ? `${head} ${w}` : w))
}

const DIVIDED = /\bdivided\b|\bin (?:two|2|three|3) (?:parts|portions|additions)\b/i

export function matchStepsToIngredients(
  ingredients: MatchIngredient[],
  steps: MatchStep[],
): StepUses[] {
  const names = ingredients.map((i) => norm(i.name).trim())
  const hasIngSections = ingredients.some((i) => sectionKey(i.section))
  // Which steps mention each ingredient, in step order.
  const mentions = ingredients.map(() => [] as number[])

  steps.forEach((step, si) => {
    const sk = sectionKey(step.section)
    let scope = ingredients.map((_, i) => i)
    if (sk && hasIngSections) {
      const own = scope.filter((i) => sectionKey(ingredients[i].section) === sk)
      if (own.length) scope = own
    }
    let text = norm(step.text)
    const hit = new Set<number>()
    const claim = (terms: { i: number; term: string }[]) => {
      terms.sort((a, b) => b.term.length - a.term.length)
      // Lines with the same name all count as mentioned; which one the step gets is settled below.
      const found = new Set<string>()
      for (const { i, term } of terms) {
        if (found.has(term)) {
          hit.add(i)
          continue
        }
        const needle = ` ${term} `
        const at = text.indexOf(needle)
        if (at < 0) continue
        hit.add(i)
        found.add(term)
        // Mask the words so "sugar" does not also match inside "brown sugar".
        text = `${text.slice(0, at)} | ${text.slice(at + needle.length)}`
      }
    }
    // Pass 1: the full name, in any singular/plural form.
    claim(scope.flatMap((i) => phraseForms(names[i]).map((term) => ({ i, term }))))
    // Pass 2: the last word alone ("flour" for "all-purpose flour"), when no other ingredient in scope shares it.
    const heads = new Map<string, number[]>()
    for (const i of scope) {
      const words = names[i].split(' ')
      if (words.length < 2) continue
      const h = words[words.length - 1]
      if (h.length < 3) continue
      for (const f of wordForms(h)) heads.set(f, [...(heads.get(f) ?? []), i])
    }
    const single = scope.filter((i) => names[i].split(' ').length === 1)
    claim(
      [...heads]
        .filter(
          ([f, is]) => is.length === 1 && !hit.has(is[0]) && !single.some((s) => names[s] === f),
        )
        .map(([term, [i]]) => ({ i, term })),
    )
    for (const i of hit) mentions[i].push(si)
  })

  const uses: StepUses[] = steps.map(() => [])
  // Lines with the same name ("sugar" in the base and the frosting, with steps not in parts) take the steps that
  // mention them in turn.
  const sameName = new Map<string, number[]>()
  names.forEach((n, i) => sameName.set(n, [...(sameName.get(n) ?? []), i]))
  ingredients.forEach((ing, i) => {
    const m = mentions[i]
    if (!m.length) return
    if (DIVIDED.test(ing.original ?? '') && m.length > 1) {
      const share = Math.floor(1000 / m.length) / 1000
      for (const si of m) uses[si].push({ ingredient: i, portion: share })
      return
    }
    const twins = sameName.get(names[i]) ?? [i]
    const k = twins.indexOf(i)
    const si = twins.length > 1 ? m[Math.min(k, m.length - 1)] : m[0]
    uses[si].push({ ingredient: i })
  })
  for (const u of uses) u.sort((a, b) => a.ingredient - b.ingredient)
  return uses
}
