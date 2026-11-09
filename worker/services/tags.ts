import { canonicalWord } from './translit'
import { invalid } from './ctx'

export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 30

/** Tag as shown: trimmed, inner whitespace collapsed to one space, case kept as typed. */
export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Folded form used to match and count tags: lower case, no diacritics, punctuation and hyphens read as spaces, other
 * spellings folded (Shabbos = Shabbat). "One-Pot" and "one pot" share a key.
 */
export function tagKey(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(canonicalWord)
    .join(' ')
}

/** Cleans a list of typed tags: drops blanks and duplicates (by key, first spelling wins), checks the limits. */
export function normalizeTags(raw: string[]): { tag: string; key: string }[] {
  const seen = new Map<string, string>()
  for (const r of raw) {
    const tag = cleanTag(r)
    if (!tag) continue
    if (tag.length > MAX_TAG_LENGTH)
      throw invalid(`A tag is at most ${MAX_TAG_LENGTH} characters: "${tag.slice(0, 40)}…"`)
    const key = tagKey(tag)
    if (!key) throw invalid(`"${tag}" has no letters or digits, so it can't be a tag`)
    if (!seen.has(key)) seen.set(key, tag)
  }
  if (seen.size > MAX_TAGS) throw invalid(`A recipe has at most ${MAX_TAGS} tags`)
  return [...seen].map(([key, tag]) => ({ tag, key }))
}
