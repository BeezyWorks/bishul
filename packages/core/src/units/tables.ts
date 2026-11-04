import type { UnitDef } from './types'

const ML_TSP = 4.92892159375
const defs: UnitDef[] = [
  { id: 'tsp', dimension: 'volume', factor: ML_TSP, system: 'us' },
  { id: 'tbsp', dimension: 'volume', factor: ML_TSP * 3, system: 'us' },
  { id: 'fl oz', dimension: 'volume', factor: ML_TSP * 6, system: 'us' },
  { id: 'cup', dimension: 'volume', factor: ML_TSP * 48, system: 'us' },
  { id: 'pint', dimension: 'volume', factor: ML_TSP * 96, system: 'us' },
  { id: 'quart', dimension: 'volume', factor: ML_TSP * 192, system: 'us' },
  { id: 'gallon', dimension: 'volume', factor: ML_TSP * 768, system: 'us' },
  { id: 'ml', dimension: 'volume', factor: 1, system: 'metric' },
  { id: 'l', dimension: 'volume', factor: 1000, system: 'metric' },
  { id: 'oz', dimension: 'weight', factor: 28.349523125, system: 'us' },
  { id: 'lb', dimension: 'weight', factor: 453.59237, system: 'us' },
  { id: 'g', dimension: 'weight', factor: 1, system: 'metric' },
  { id: 'kg', dimension: 'weight', factor: 1000, system: 'metric' },
  { id: 'piece', dimension: 'count', factor: 1, system: 'both' },
]

export const UNITS: Record<string, UnitDef> = Object.fromEntries(defs.map((d) => [d.id, d]))

const aliasList: Record<string, string[]> = {
  tsp: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons'],
  'fl oz': ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'],
  cup: ['cup', 'cups', 'c'],
  pint: ['pint', 'pints', 'pt'],
  quart: ['quart', 'quarts', 'qt'],
  gallon: ['gallon', 'gallons', 'gal'],
  ml: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  oz: ['oz', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  g: ['g', 'gram', 'grams', 'gr'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms'],
  piece: [
    'piece',
    'pieces',
    'pc',
    'pcs',
    'clove',
    'cloves',
    'slice',
    'slices',
    'stalk',
    'stalks',
    'sprig',
    'sprigs',
    'bunch',
    'bunches',
    'head',
    'heads',
    'can',
    'cans',
    'package',
    'packages',
    'pkg',
  ],
}

const aliasMap = new Map<string, string>()
for (const [id, list] of Object.entries(aliasList)) for (const a of list) aliasMap.set(a, id)

/** Look up a unit by any spelling ("Tablespoons", "tbsp."). */
export function findUnit(name: string): UnitDef | undefined {
  const key = name.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ')
  const id = aliasMap.get(key)
  return id ? UNITS[id] : undefined
}

/** Approximate size of a pinch / dash in ml. */
export const PINCH_ML = ML_TSP / 16
export const DASH_ML = ML_TSP / 8
export const ML_PER_TSP = ML_TSP
