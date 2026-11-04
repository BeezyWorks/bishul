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

/** Version names that mean "the only one": not worth repeating next to the dish name. */
const PLAIN_VERSION = new Set(['', 'classic', 'original', 'default'])

/**
 * A dish with its version, without nesting parentheses: "Brownies (Fudgy)", but
 * "Potato kugel: Pesach (potato starch)" when the version name already has brackets.
 */
export function dishName(title: string, version?: string | null): string {
  const v = (version ?? '').trim()
  if (PLAIN_VERSION.has(v.toLowerCase()) || v.toLowerCase() === title.trim().toLowerCase())
    return title
  return v.includes('(') ? `${title}: ${v}` : `${title} (${v})`
}

export const NAV = [
  { href: '/', label: 'Plan' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/shopping', label: 'Shopping' },
  { href: '/prep', label: 'Prep' },
  { href: '/people', label: 'People' },
  { href: '/pantry', label: 'Pantry' },
  { href: '/settings', label: 'Settings' },
] as const
