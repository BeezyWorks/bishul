// Israeli-style transliteration is canonical (Shabbat, kitniyot, chalav Yisrael); other spellings are accepted
// everywhere through these aliases (BRIEF §10). Keys are lower-case, one word or a phrase.

/** spelling -> canonical spelling, for search and for tags. */
const CANON: Record<string, string> = {
  shabbos: 'shabbat',
  shabbes: 'shabbat',
  shabat: 'shabbat',
  shabbath: 'shabbat',
  kitniyos: 'kitniyot',
  kitniot: 'kitniyot',
  chanukah: 'chanukah',
  hanukkah: 'chanukah',
  hanukah: 'chanukah',
  chanuka: 'chanukah',
  purim: 'purim',
  pesach: 'pesach',
  passover: 'pesach',
  pesakh: 'pesach',
  shavuos: 'shavuot',
  succos: 'sukkot',
  sukkos: 'sukkot',
  sukkah: 'sukkot',
  challah: 'challah',
  chala: 'challah',
  hallah: 'challah',
  cholent: 'cholent',
  chulent: 'cholent',
  tzimmes: 'tzimmes',
  tsimmes: 'tzimmes',
  kugel: 'kugel',
  gefilte: 'gefilte',
  chummus: 'hummus',
  humus: 'hummus',
  hummus: 'hummus',
  tahini: 'tahini',
  techina: 'tahini',
  tehina: 'tahini',
  tahina: 'tahini',
  shnitzel: 'schnitzel',
  schnitzel: 'schnitzel',
  matzo: 'matzah',
  matza: 'matzah',
  matzoh: 'matzah',
  matzah: 'matzah',
  brisket: 'brisket',
  cilantro: 'cilantro',
  coriander: 'cilantro',
  eggplant: 'eggplant',
  aubergine: 'eggplant',
  zucchini: 'zucchini',
  courgette: 'zucchini',
  arugula: 'arugula',
  rocket: 'arugula',
  scallion: 'scallion',
  'spring onion': 'scallion',
  'green onion': 'scallion',
}

/** All spellings that stand for the same word (for search expansion). */
const GROUPS: string[][] = [
  ['shabbat', 'shabbos', 'shabbes', 'shabat', 'shabbath'],
  ['kitniyot', 'kitniyos', 'kitniot'],
  ['chanukah', 'hanukkah', 'hanukah', 'chanuka'],
  ['pesach', 'passover'],
  ['shavuot', 'shavuos'],
  ['sukkot', 'succos', 'sukkos'],
  ['challah', 'chala', 'hallah'],
  ['cholent', 'chulent'],
  ['tzimmes', 'tsimmes'],
  ['hummus', 'chummus', 'humus'],
  ['tahini', 'techina', 'tehina', 'tahina'],
  ['schnitzel', 'shnitzel'],
  ['matzah', 'matzo', 'matza', 'matzoh'],
  ['cilantro', 'coriander'],
  ['eggplant', 'aubergine'],
  ['zucchini', 'courgette'],
  ['arugula', 'rocket'],
]

/** Spellings of a search word, including itself. */
export function wordVariants(word: string): string[] {
  const w = word.toLowerCase()
  const group = GROUPS.find((g) => g.includes(w))
  return group ?? [w]
}

const TAG_ALIASES: Record<string, string> = {
  'chalav yisrael': 'chalav_yisrael',
  'cholov yisroel': 'chalav_yisrael',
  'chalav yisroel': 'chalav_yisrael',
  'cholov yisrael': 'chalav_yisrael',
  'pat yisrael': 'pat_yisrael',
  'pas yisroel': 'pat_yisrael',
  'pas yisrael': 'pat_yisrael',
  'pat yisroel': 'pat_yisrael',
  yashan: 'yashan',
  'glatt kosher': 'glatt',
  glatt: 'glatt',
  kitniyos: 'kitniyot',
  kitniot: 'kitniyot',
  legumes: 'kitniyot',
  gebrokts: 'gebrokts',
  gebrochts: 'gebrokts',
  "gebrokt's": 'gebrokts',
  'no gebrokts': 'gebrokts',
  chametz: 'chametz',
  chometz: 'chametz',
  hametz: 'chametz',
}

/** Canonical tag for a typed one: kashrut and diet tags become snake_case; allergens and ingredients stay words. */
export function normalizeTag(tagType: string, raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (tagType === 'kashrut_dish' || tagType === 'kashrut_sourcing' || tagType === 'diet') {
    return TAG_ALIASES[t] ?? t.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  }
  return t
}

/** Canonical ingredient name for matching ("coriander" and "cilantro" are one thing). */
export function canonicalWord(word: string): string {
  return CANON[word.toLowerCase()] ?? word.toLowerCase()
}

export const PERIOD_ALIASES: Record<string, string> = {
  pesach: 'pesach',
  passover: 'pesach',
  'aseret yemei teshuva': 'aseret_yemei_teshuva',
  'aseres yemei teshuva': 'aseret_yemei_teshuva',
  'ten days of repentance': 'aseret_yemei_teshuva',
  'nine days': 'nine_days',
  'the nine days': 'nine_days',
  sefirah: 'sefirah',
  sefira: 'sefirah',
  'omer': 'sefirah',
}
