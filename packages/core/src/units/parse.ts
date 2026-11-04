import { toCanonical } from './convert'
import { DASH_ML, PINCH_ML, findUnit } from './tables'
import type { ParsedQuantity } from './types'

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
}

/** Replace unicode vulgar fractions with ASCII ("1½" -> "1 1/2"). */
export function normalizeFractions(s: string): string {
  return s.replace(/(\d)?\s*([¼½¾⅐-⅞])/g, (_m, d: string | undefined, f: string) =>
    d ? `${d} ${UNICODE_FRACTIONS[f]}` : UNICODE_FRACTIONS[f]!,
  )
}

const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+`

function evalNumber(s: string): number {
  const t = s.trim()
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  return Number(t)
}

const RANGE_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?`, 'i')

function matchUnit(s: string): { name: string; rest: string } | null {
  const t = s.replace(/^\s*/, '')
  const fl = /^(fl\.?\s*oz\.?|fluid\s+ounces?)(?![a-z])/i.exec(t)
  if (fl) return { name: 'fl oz', rest: t.slice(fl[0].length) }
  const w = /^([a-zA-Z]+)\.?(?![a-zA-Z])/.exec(t)
  if (!w || !findUnit(w[1]!)) return null
  return { name: w[1]!, rest: t.slice(w[0].length) }
}

function cleanRest(s: string): string {
  return s
    .trim()
    .replace(/^of\s+/i, '')
    .trim()
}

/**
 * Parse a quantity as written: "1 1/2 cups", "½ tsp", "200g", "2-3 cloves", "a pinch", "3 large eggs".
 * Returns canonical metric amounts. Ranges set `amountMax` and `approx`; pinches/dashes are approximate.
 * Returns null when no quantity can be read.
 */
export function parseQuantity(input: string): ParsedQuantity | null {
  const original = input
  const text = normalizeFractions(input.trim())
  if (!text) return null

  const pd = /^(?:an?\s+|one\s+)?(pinch|dash|smidgen)(?:es)?(?![a-z])\s*(?:of\s+)?(.*)$/i.exec(text)
  if (pd) {
    const word = pd[1]!.toLowerCase()
    return {
      amount: word === 'dash' ? DASH_ML : PINCH_ML,
      unit: 'ml',
      approx: true,
      original,
      unitText: word,
      rest: pd[2]!.trim(),
    }
  }

  let amount: number
  let amountMax: number | undefined
  let after: string
  const m = RANGE_RE.exec(text)
  if (m) {
    amount = evalNumber(m[1]!)
    if (m[2]) {
      const hi = evalNumber(m[2])
      amountMax = Math.max(amount, hi)
      amount = Math.min(amount, hi)
    }
    after = text.slice(m[0].length)
  } else {
    const art = /^(?:an?|one)\s+(?=\S)/i.exec(text)
    if (!art) return null
    amount = 1
    after = text.slice(art[0].length)
  }
  if (!Number.isFinite(amount)) return null

  const u = matchUnit(after)
  const approx = amountMax !== undefined
  if (!u) {
    return {
      amount,
      ...(amountMax !== undefined && { amountMax }),
      unit: 'piece',
      approx,
      original,
      rest: cleanRest(after),
    }
  }
  const lo = toCanonical(amount, u.name)!
  const hi = amountMax !== undefined ? toCanonical(amountMax, u.name)! : undefined
  return {
    amount: lo.amount,
    ...(hi && { amountMax: hi.amount }),
    unit: lo.unit,
    approx,
    original,
    unitText: u.name,
    rest: cleanRest(u.rest),
  }
}
