// @tavshil/core: pure domain logic (units, scaling, constraint evaluation). No platform dependencies.
export const VERSION = '0.1.0'

export * from './units'
export * from './scaling'
export * from './shopping'
export * from './pantry'
export * from './planning'
export * from './steps'
export * from './cook'
// Both modules define a pantry item; the pantry module's is the canonical one, ranking's is renamed.
export type { PantryItem } from './pantry'
export type { PantryItem as RankPantryItem } from './planning'
