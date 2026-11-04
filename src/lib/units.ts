/** Display-only unit conversion for the mock UI. The real conversion lives in @bishul/core. */
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

/** Format one ingredient line for display. Returns text and whether it is approximate. */
export function formatAmount(
  line: Pick<IngredientLine, 'amount' | 'unit' | 'density'>,
  scale: number,
  system: UnitSystem,
): { text: string; approx: boolean } {
  const a = line.amount * scale
  if (line.unit === 'pc') return { text: fraction(a), approx: false }
  if (system === 'metric') {
    if (line.unit === 'g')
      return a >= 1000
        ? { text: `${(a / 1000).toFixed(1)} kg`, approx: false }
        : { text: `${roundG(a)} g`, approx: false }
    return a >= 1000
      ? { text: `${(a / 1000).toFixed(1)} l`, approx: false }
      : { text: `${Math.round(a)} ml`, approx: false }
  }
  const ml = line.unit === 'ml' ? a : line.density ? a / line.density : undefined
  if (ml !== undefined) {
    const approx = line.unit === 'g'
    if (ml >= 60) return { text: `${fraction(ml / 240)} cup${ml / 240 > 1.05 ? 's' : ''}`, approx }
    if (ml >= 14) return { text: `${fraction(ml / 15)} tbsp`, approx }
    return { text: `${fraction(ml / 5)} tsp`, approx }
  }
  const oz = a / 28.35
  return oz >= 16
    ? { text: `${(oz / 16).toFixed(1)} lb`, approx: true }
    : { text: `${fraction(oz)} oz`, approx: true }
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
