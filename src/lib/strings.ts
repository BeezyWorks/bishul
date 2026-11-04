/** UI strings in one place so other languages can be added later. */
export const DISCLAIMER =
  'Bishul helps you check, but it can’t guarantee a dish is safe. Confirm allergies with your guests.'

export const KIND_LABEL = { meat: 'Meat', dairy: 'Dairy', parve: 'Parve' } as const

export const COURSE_LABEL: Record<string, string> = {
  main: 'Main',
  side: 'Side',
  salad: 'Salad',
  soup: 'Soup',
  starter: 'Starter',
  challah: 'Challah',
  dessert: 'Dessert',
  other: 'Other',
}

export const NAV = [
  { href: '/', label: 'Plan' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/shopping', label: 'Shopping' },
  { href: '/prep', label: 'Prep' },
  { href: '/people', label: 'People' },
  { href: '/pantry', label: 'Pantry' },
] as const
