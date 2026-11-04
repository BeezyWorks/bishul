// Builders shared by the planning tests.
import type {
  ActiveWhen,
  Constraint,
  ConstraintTag,
  DishIngredient,
  DishVersion,
  EquipmentUse,
  MeatDairy,
  Person,
  Severity,
  ConstraintKind,
} from './types'

export function ing(name: string, o: Partial<DishIngredient> = {}): DishIngredient {
  return {
    name,
    category: 'parve',
    allergens: [],
    flags: [],
    dataSource: 'seed',
    skipImpact: 'none',
    ...o,
  }
}

export function dish(
  id: string,
  title: string,
  kashrut: MeatDairy,
  ingredients: DishIngredient[],
  o: Partial<DishVersion> = {},
): DishVersion {
  return { id, title, kashrut, ingredients, ...o }
}

export function constraint(
  tag: ConstraintTag,
  o: { severity?: Severity; kind?: ConstraintKind; activeWhen?: ActiveWhen } = {},
): Constraint {
  return {
    tag,
    kind: o.kind ?? 'medical',
    severity: o.severity ?? 'strict',
    activeWhen: o.activeWhen ?? { always: true },
    source: 'self',
  }
}

export function person(id: string, name: string, constraints: Constraint[] = []): Person {
  return { id, name, constraints }
}

export const dairyPot: EquipmentUse = { name: 'dairy pot', designation: 'dairy' }
