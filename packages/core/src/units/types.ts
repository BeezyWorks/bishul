/** Canonical storage units: grams, millilitres, and counted pieces. */
export type CanonicalUnit = 'g' | 'ml' | 'piece'
export type Dimension = 'weight' | 'volume' | 'count'
export type UnitSystem = 'us' | 'metric'

/** An amount in canonical units. `approx` is true when density or an approximate source was involved. */
export interface Quantity {
  amount: number
  unit: CanonicalUnit
  approx: boolean
}

export interface UnitDef {
  /** Canonical id, e.g. "tbsp". */
  id: string
  dimension: Dimension
  /** Size of one of this unit in the canonical unit (g, ml or piece). */
  factor: number
  system: UnitSystem | 'both'
}

/** Result of parsing a quantity as written. `amount` is canonical; for ranges it is the low end. */
export interface ParsedQuantity {
  amount: number
  /** High end of a range such as "2-3 cloves". */
  amountMax?: number
  unit: CanonicalUnit
  approx: boolean
  /** The text exactly as given. */
  original: string
  /** The unit word as written ("cups"), if any. */
  unitText?: string
  /** Whatever followed the quantity ("large eggs", "garlic, minced"). */
  rest: string
}

/** A per-category override of the display preference. */
export interface CategoryDisplayPref {
  system?: UnitSystem
  /** Force the amount to be shown by weight or by volume (needs a density to convert). */
  dimension?: 'weight' | 'volume'
}

export interface DisplayPrefs {
  system: UnitSystem
  /** Keyed by ingredient category, e.g. { flour: { system: 'metric', dimension: 'weight' } }. */
  overrides?: Record<string, CategoryDisplayPref>
}

export interface FormattedQuantity {
  /** Ready to show, e.g. "~1½ cups". */
  text: string
  /** The number shown (already rounded). */
  amount: number
  /** The unit label shown ("cup", "g", ""). */
  unit: string
  approx: boolean
}

/** What kind of non-linear behaviour an ingredient has when scaled. */
export type NonLinearKind = 'leavening' | 'salt' | 'spice'

/** An ingredient line of a recipe version, as plain data. */
export interface IngredientLine {
  ingredientId: string
  name: string
  /** Canonical amount; null for "to taste" lines. */
  amount: number | null
  /** High end of a range (canonical). */
  amountMax?: number
  unit: CanonicalUnit
  approx?: boolean
  original?: string
  prepNote?: string
  skipImpact?: 'none' | 'minor' | 'ruins'
  /** Ingredient category (flour, liquid...), used for display overrides. */
  category?: string
  /** Density in g/ml, from the ingredient catalog. */
  density?: number | null
  /** Hint for scaling warnings, from the ingredient catalog. */
  nonLinear?: NonLinearKind
}
