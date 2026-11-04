import { roundToFraction } from '../units/display'
import type { IngredientLine } from '../units/types'

export type ScaleTarget = { factor: number } | { fromServings: number; toServings: number }

export interface ScaleOptions {
  /** The recipe uses a pan / baking dish whose size matters. A string names it ("9x13 pan"). */
  pan?: boolean | string
  /** Cook or bake time of the base recipe, in minutes. */
  cookTimeMinutes?: number
}

export type ScaleWarningCode =
  'leavening' | 'salt' | 'spice' | 'pan' | 'time' | 'piece-rounded' | 'piece-minimum'

export interface ScaleWarning {
  code: ScaleWarningCode
  message: string
  ingredientId?: string
}

export interface ScaledLine extends IngredientLine {
  /** Amount before scaling. */
  baseAmount: number | null
  /** True when the amount was rounded to a usable amount (whole/half pieces). */
  rounded: boolean
}

export interface ScaleResult {
  factor: number
  lines: ScaledLine[]
  warnings: ScaleWarning[]
}

/** Scaling more than this far from 1 triggers the soft warnings (spice, salt, pan, time). */
const SOFT_UP = 1.5
const SOFT_DOWN = 0.67
const EPS = 0.001

export function resolveFactor(target: ScaleTarget): number {
  const f = 'factor' in target ? target.factor : target.toServings / (target.fromServings as number)
  if (!Number.isFinite(f) || f <= 0) throw new RangeError('Scale factor must be a positive number')
  return f
}

function roundHalf(x: number): number {
  return Math.round(x * 2) / 2
}

function pieceText(n: number): string {
  return roundToFraction(n).text
}

/**
 * Scale ingredient lines by a factor or to a target serving count. Linear math, then pieces are rounded to the
 * nearest half. Warnings flag non-linear items (leavening, salt, strong spices, pan size, cook time), driven by
 * each line's `nonLinear` hint. Throws RangeError for a non-positive factor.
 */
export function scaleLines(
  lines: IngredientLine[],
  target: ScaleTarget,
  options: ScaleOptions = {},
): ScaleResult {
  const factor = resolveFactor(target)
  const changed = Math.abs(factor - 1) > EPS
  const warnings: ScaleWarning[] = []
  const soft = factor > SOFT_UP || factor < SOFT_DOWN

  const out = lines.map((line): ScaledLine => {
    if (line.amount === null || !Number.isFinite(line.amount)) {
      return { ...line, baseAmount: line.amount, rounded: false }
    }
    let amount = line.amount * factor
    let amountMax = line.amountMax !== undefined ? line.amountMax * factor : undefined
    let rounded = false
    let approx = line.approx
    if (line.unit === 'piece') {
      const r = roundHalf(amount)
      const min = r === 0 ? 0.5 : r
      if (r === 0) {
        warnings.push({
          code: 'piece-minimum',
          ingredientId: line.ingredientId,
          message: `${line.name}: scaled amount is under half a piece; use ½ as the minimum.`,
        })
      }
      if (Math.abs(min - amount) > EPS) {
        rounded = true
        if (r !== 0) {
          warnings.push({
            code: 'piece-rounded',
            ingredientId: line.ingredientId,
            message: `${line.name}: ${Number(amount.toFixed(2))} rounded to ${pieceText(min)}.`,
          })
        }
      }
      amount = min
      if (amountMax !== undefined) amountMax = Math.max(roundHalf(amountMax), amount)
    }
    if (changed && line.nonLinear) {
      if (line.nonLinear === 'leavening') {
        warnings.push({
          code: 'leavening',
          ingredientId: line.ingredientId,
          message: `${line.name}: leavening does not scale linearly; check the amount and the rise.`,
        })
      } else if (soft) {
        warnings.push({
          code: line.nonLinear,
          ingredientId: line.ingredientId,
          message: `${line.name}: ${line.nonLinear === 'salt' ? 'salt' : 'strong spices'} do not scale linearly; start with less and adjust to taste.`,
        })
      }
    }
    return {
      ...line,
      amount,
      ...(amountMax !== undefined && { amountMax }),
      ...(approx !== undefined && { approx }),
      baseAmount: line.amount,
      rounded,
    }
  })

  if (changed && options.pan && soft) {
    const name = typeof options.pan === 'string' ? ` (${options.pan})` : ''
    warnings.push({
      code: 'pan',
      message: `Pan size${name} may need to change: ${factor > 1 ? 'use a larger pan or several' : 'use a smaller pan'}, and depth affects baking.`,
    })
  }
  if (changed && Math.abs(factor - 1) > 0.1) {
    const base = options.cookTimeMinutes
    const hint =
      base !== undefined
        ? ` Base time is ${base} min; check for doneness early.`
        : ' Check for doneness rather than going by the original time.'
    warnings.push({ code: 'time', message: `Cook time does not scale with quantity.${hint}` })
  }
  return { factor, lines: out, warnings }
}
