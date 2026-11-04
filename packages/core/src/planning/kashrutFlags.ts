import type { DishIngredient } from './types'

/**
 * Chametz, kitniyot and gebrokts inferred from an ingredient's name, for when the catalog row has no explicit flag
 * (a new ingredient the AI or a user created without filling it in, or an old row). Like `ALLERGEN_NAMES` this is a
 * safety net under the catalog's own flags, never a replacement: an explicit `false` on the catalog row (carried as
 * `DishIngredient.flagsOff`) always wins.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function phraseIn(haystack: string, needle: string): boolean {
  const h = ` ${haystack} `
  const n = norm(needle)
  return n !== '' && (h.includes(` ${n} `) || h.includes(` ${n}s `) || h.includes(` ${n}es `))
}

const anyIn = (h: string, needles: string[]) => needles.some((n) => phraseIn(h, n))

/** Ground matzah products: gebrokts (they get wet), and not chametz. */
const GEBROKTS = [
  'matzah meal',
  'matza meal',
  'matzo meal',
  'matzoh meal',
  'matzah flour',
  'matza flour',
  'matzo flour',
  'cake meal',
  'matzah farfel',
  'matza farfel',
  'matzo farfel',
  'matzah crumb',
  'matzo crumb',
]
const MATZAH = ['matzah', 'matza', 'matzo', 'matzoh', 'matzot']

/** Marked as made for Passover: leave chametz and kitniyot alone, the product says so. */
const PESACH_LABEL = ['passover', 'pesach', 'pesadik']

const CHAMETZ = [
  'wheat',
  'flour',
  'barley',
  'rye',
  'oat',
  'oatmeal',
  'spelt',
  'kamut',
  'farro',
  'freekeh',
  'bulgur',
  'couscous',
  'semolina',
  'durum',
  'farina',
  'seitan',
  'bread',
  'breadcrumb',
  'panko',
  'challah',
  'pita',
  'bagel',
  'baguette',
  'brioche',
  'croissant',
  'cracker',
  'pretzel',
  'pasta',
  'noodle',
  'spaghetti',
  'macaroni',
  'penne',
  'fusilli',
  'linguine',
  'fettuccine',
  'lasagna',
  'orzo',
  'ravioli',
  'gnocchi',
  'beer',
  'ale',
  'lager',
  'stout',
  'malt',
  'whisky',
  'whiskey',
]

/** Flours, noodles and "ale"s that are not wheat (rice and chickpea ones are caught as kitniyot instead). */
const NOT_CHAMETZ = [
  'almond',
  'coconut',
  'potato',
  'tapioca',
  'cassava',
  'arrowroot',
  'hazelnut',
  'banana',
  'rice',
  'corn',
  'chickpea',
  'soy',
  'buckwheat',
  'millet',
  'glass',
  'kelp',
  'ginger ale',
  'ginger beer',
  'root beer',
]

// Kitniyot per common Ashkenazi practice. Sesame, peanut and mustard are debated (many Ashkenazi households avoid
// them, some authorities permit them); we flag them, because a false "fine for Pesach" is the worse mistake.
// Quinoa and green beans are widely permitted and left out.
const KITNIYOT = [
  'rice',
  'corn',
  'cornstarch',
  'cornflour',
  'cornmeal',
  'polenta',
  'popcorn',
  'hominy',
  'masa',
  'bean',
  'lentil',
  'chickpea',
  'chick pea',
  'garbanzo',
  'hummus',
  'hummous',
  'falafel',
  'pea',
  'soy',
  'soya',
  'soybean',
  'tofu',
  'edamame',
  'miso',
  'tempeh',
  'tamari',
  'lupin',
  'buckwheat',
  'kasha',
  'millet',
  'sorghum',
  'amaranth',
  // Debated:
  'sesame',
  'tahini',
  'tahina',
  'halva',
  'halvah',
  'mustard',
  'peanut',
]

/** Beans and peas that are not dried legumes, or the green-pod kind. */
const NOT_KITNIYOT = [
  'green bean',
  'string bean',
  'french bean',
  'vanilla bean',
  'vanilla',
  'coffee bean',
  'cocoa bean',
  'cacao bean',
  'jelly bean',
  'castor bean',
  'bean sprout',
  'peppercorn',
  'sweet pea',
  'snow pea',
  'sugar snap',
  'pea shoot',
  'pea sprout',
]

/** The flags the names (an ingredient's name and aliases) give away. */
export function inferKashrutFlags(names: string[]): string[] {
  const flags = new Set<string>()
  for (const raw of names) {
    const h = norm(raw)
    if (!h || anyIn(h, PESACH_LABEL)) continue
    const gebrokts = anyIn(h, GEBROKTS)
    if (gebrokts) flags.add('gebrokts')
    // Matzah, whole or ground, is not chametz in itself: "whole wheat matzah" must not trip on "wheat".
    if (!gebrokts && !anyIn(h, MATZAH) && anyIn(h, CHAMETZ) && !anyIn(h, NOT_CHAMETZ))
      flags.add('chametz')
    if (anyIn(h, KITNIYOT) && !anyIn(h, NOT_KITNIYOT)) flags.add('kitniyot')
  }
  return [...flags]
}

/** An ingredient's flags: what the catalog says, plus what its name gives away, minus anything explicitly cleared. */
export function effectiveFlags(i: DishIngredient): string[] {
  const off = new Set(i.flagsOff ?? [])
  const inferred = inferKashrutFlags([i.name, ...(i.aliases ?? [])]).filter((f) => !off.has(f))
  return [...new Set([...i.flags, ...inferred])]
}

/** Chametz and kitniyot lines of a dish, for a Pesach check. */
export function pesachProblems(ingredients: DishIngredient[]): {
  chametz: string[]
  kitniyot: string[]
} {
  const chametz: string[] = []
  const kitniyot: string[] = []
  for (const i of ingredients) {
    const f = effectiveFlags(i)
    if (f.includes('chametz')) chametz.push(i.name)
    if (f.includes('kitniyot')) kitniyot.push(i.name)
  }
  return { chametz: [...new Set(chametz)], kitniyot: [...new Set(kitniyot)] }
}
