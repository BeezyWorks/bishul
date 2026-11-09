/** Display-only unit conversion for the mock UI. The real conversion lives in @tavshil/core. */
import type { IngredientLine } from '@/lib/api/types'

export type UnitSystem = 'metric' | 'us'

const FRACTIONS: [number, string][] = [
  [0, ''],
  [0.125, '⅛'],
  [0.25, '¼'],
  [0.333, '⅓'],
  [0.5, '½'],
  [0.667, '⅔'],
  [0.75, '¾'],
]

export function fraction(n: number): string {
  if (n >= 10) return String(Math.round(n))
  const whole = Math.floor(n)
  const rest = n - whole
  let best = FRACTIONS[0]
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f
  if (Math.abs(1 - rest) < Math.abs(best[0] - rest)) return String(whole + 1)
  if (whole === 0 && best[1] === '') return '⅛'
  return `${whole || ''}${best[1]}`.trim() || '0'
}

function roundG(g: number): string {
  if (g >= 100) return String(Math.round(g / 5) * 5)
  return String(Math.round(g))
}

/**
 * What to show amounts as: `weight` (g, oz), `volume` (ml, cups) or `auto` (the usual kitchen choice: liquids by
 * volume; metric dry goods by weight; US dry goods in cups when a density is known, else ounces).
 */
export type Measure = 'auto' | 'weight' | 'volume'

function metricAmount(unit: 'g' | 'ml', a: number): string {
  if (unit === 'g') return a >= 1000 ? `${(a / 1000).toFixed(1)} kg` : `${roundG(a)} g`
  return a >= 1000 ? `${(a / 1000).toFixed(1)} l` : `${Math.round(a)} ml`
}

function usVolume(ml: number): string {
  if (ml >= 60) return `${fraction(ml / 240)} cup${ml / 240 > 1.05 ? 's' : ''}`
  if (ml >= 14) return `${fraction(ml / 15)} tbsp`
  return `${fraction(ml / 5)} tsp`
}

function usWeight(g: number): string {
  const oz = g / 28.35
  return oz >= 16 ? `${(oz / 16).toFixed(1)} lb` : `${fraction(oz)} oz`
}

/** Format one ingredient line for display. Returns text and whether it is approximate. */
export function formatAmount(
  line: Pick<IngredientLine, 'amount' | 'unit' | 'density'> &
    Partial<Pick<IngredientLine, 'unquantified' | 'original'>>,
  scale: number,
  system: UnitSystem,
  measure: Measure = 'auto',
): { text: string; approx: boolean } {
  if (line.unquantified) return { text: 'as needed', approx: false }
  const a = line.amount * scale
  if (line.unit === 'pc') return { text: fraction(a), approx: false }
  const d = line.density && line.density > 0 ? line.density : undefined

  // Pick the dimension to show, converting through density where that is possible.
  let unit: 'g' | 'ml' = line.unit
  if (measure === 'auto') {
    if (system === 'us' && line.unit === 'g' && d) unit = 'ml'
  } else {
    const want = measure === 'weight' ? 'g' : 'ml'
    if (want === line.unit || d) unit = want
  }
  let amount = a
  if (unit !== line.unit) amount = unit === 'ml' ? a / d! : a * d!
  const approx = unit !== line.unit

  if (system === 'metric') return { text: metricAmount(unit, amount), approx }
  return { text: unit === 'ml' ? usVolume(amount) : usWeight(amount), approx }
}

export const SHARES: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

/** A share of an ingredient: ½, ⅓, ¾ when it is a kitchen fraction, else a percentage. */
export function portionLabel(p: number): string {
  const hit = SHARES.find(([v]) => Math.abs(v - p) < 0.01)
  return hit ? hit[1] : `${Math.round(p * 100)}%`
}

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
