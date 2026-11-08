// zod schemas shared by the REST operations and the MCP tools. Inputs from a query string arrive as text, so the
// numeric and list helpers accept both forms.
import { z } from 'zod'

export const id = z.string().min(1).max(64)
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'a date like 2026-11-13')
  .describe('YYYY-MM-DD in the household time zone')
export const time = z
  .union([
    z.string().regex(/^\d{1,2}:\d{2}(\s*(am|pm))?$/i, 'a time like 18:30'),
    z.number().int().min(0).max(1800),
  ])
  .describe('24-hour "18:30" (or "6:30 pm"), or minutes since midnight')

/** Query strings: "true"/"false". */
export const bool = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean(),
)
/** Query strings: numbers as text. */
export const num = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z.number(),
)
export const int = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z.number().int(),
)
/** Query strings: comma-separated ids. */
export const ids = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : v,
  z.array(id),
)

export const kashrut = z.enum(['meat', 'dairy', 'parve'])
export const designation = z.enum(['meat', 'dairy', 'parve', 'pesach'])
export const difficulty = z.enum(['easy', 'average', 'a_pain'])
export const servingStyle = z.enum(['hot', 'room_temperature', 'cold'])
export const fit = z.enum(['fine', 'good', 'especially'])
export const source = z.enum(['seed', 'ai', 'user'])

export const location = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timeZone: z.string().describe('IANA zone, e.g. America/New_York or Asia/Jerusalem'),
  israel: z.boolean().describe('Israel holiday schedule (one day of Yom Tov)'),
  name: z.string().optional(),
})

// ---- people ----

export const activeWhen = z
  .union([
    z.literal('always'),
    z.string().describe('A period: pesach, aseret_yemei_teshuva or nine_days'),
    z.object({ from: date, to: date }).describe('A custom date range (inclusive)'),
  ])
  .describe('When it applies. Default always.')

export const constraintInput = z.object({
  tagType: z.enum(['allergen', 'ingredient', 'diet', 'kashrut_dish', 'kashrut_sourcing']),
  tag: z
    .string()
    .describe(
      'allergen: peanut, sesame…; ingredient: cilantro…; diet: vegetarian|vegan|pescatarian; kashrut_dish: kitniyot|gebrokts|chametz…; kashrut_sourcing: chalav_yisrael|pat_yisrael|yashan|glatt',
    ),
  kind: z.enum(['medical', 'religious', 'preference']).optional(),
  severity: z
    .enum(['strict', 'flexible'])
    .optional()
    .describe('strict: cannot be at the meal; flexible: can eat around it'),
  activeWhen: activeWhen.optional(),
  note: z.string().max(500).optional(),
  source: z.enum(['self', 'host', 'ai']).optional(),
})

// ---- recipes ----

export const ingredientMeta = z.object({
  category: z.enum(['meat', 'dairy', 'parve', 'fish']).optional(),
  aliases: z.array(z.string()).optional().describe('Other names and transliterations'),
  allergens: z
    .array(z.string())
    .optional()
    .describe('Allergens it contains (peanut, sesame, tree nut, egg, milk, wheat…)'),
  flags: z
    .union([z.array(z.string()), z.record(z.string(), z.boolean())])
    .optional()
    .describe('chametz, kitniyot, gebrokts, animal_derived, egg, honey, grain…'),
  densityGPerMl: z.number().positive().optional(),
  gramsPerPiece: z.number().positive().optional(),
})

export const sectionName = z
  .string()
  .max(200)
  .describe(
    'The part of the recipe this belongs to ("Cake", "Ganache"). Nest with " > " ("Chocolate Mousse > Meringue"). Omit for a one-part recipe. Ingredients and steps are grouped independently, so a step section can cover several ingredient sections.',
  )

export const stepInput = z.union([
  z.string(),
  z.object({
    text: z.string(),
    timerMinutes: z.number().optional(),
    section: sectionName.nullable().optional(),
    uses: z
      .array(
        z.union([
          z.string(),
          z.number().int().min(0),
          z.object({
            ingredient: z.union([z.string(), z.number().int().min(0)]),
            portion: z
              .number()
              .gt(0)
              .max(1)
              .optional()
              .describe(
                'The share of the ingredient this step uses, when it is divided between steps: 0.5 for half, 0.25 for a quarter. Omit for all of it. The shares across steps should add up to 1.',
              ),
          }),
        ]),
      )
      .optional()
      .describe(
        'The ingredients this step uses, so cooking mode shows them with the step. Each is an ingredient name as in the ingredients list ("dark chocolate"), its 0-based position in that list, or {ingredient, portion} when the amount is divided ("2 tbsp butter, divided": {ingredient: "butter", portion: 0.5} in two steps; uneven splits are fine, like 0.25 and 0.75). Send it on every step that adds or handles an ingredient. When you edit steps and leave `uses` out, the existing links of the matching step are kept; send [] to clear them.',
      ),
  }),
])

export const ingredientInput = z.object({
  text: z
    .string()
    .max(500)
    .optional()
    .describe('The line as written, e.g. "2 cups flour, sifted". Parsed if no name.'),
  name: z.string().max(200).optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  unit: z.string().optional(),
  prepNote: z.string().max(300).optional(),
  skipImpact: z
    .enum(['none', 'minor', 'ruins'])
    .optional()
    .describe('What skipping it does: none, minor or ruins the dish'),
  substitutions: z.array(z.object({ text: z.string(), note: z.string().optional() })).optional(),
  section: sectionName.nullable().optional(),
  ingredient: ingredientMeta.optional().describe('Catalog data if the ingredient is new'),
})

export const versionFields = {
  title: z.string().max(200).optional().describe('The version’s name ("fudgy", "pesach")'),
  description: z.string().max(2000).nullable().optional(),
  sourceLinks: z
    .array(z.object({ url: z.string().url(), label: z.string().optional() }))
    .optional(),
  servings: z.number().int().positive().nullable().optional(),
  course: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe('main, side, salad, soup, starter, challah, dessert…'),
  form: z.string().max(40).nullable().optional().describe('salad, soup, kugel…'),
  category: kashrut.nullable().optional(),
  difficulty: difficulty.nullable().optional(),
  activeMinutes: z.number().int().min(0).nullable().optional(),
  totalMinutes: z.number().int().min(0).nullable().optional(),
  servingStyle: servingStyle.nullable().optional(),
  holdsOnBlech: z.boolean().nullable().optional(),
  easyToDeliver: z.boolean().nullable().optional(),
  cost: z.number().int().min(1).max(3).nullable().optional().describe('1, 2 or 3 for $, $$, $$$'),
  nutrition: z
    .object({
      perServing: z.boolean().optional(),
      calories: z.number().optional(),
      proteinG: z.number().optional(),
      carbsG: z.number().optional(),
      fatG: z.number().optional(),
      fiberG: z.number().optional(),
      sugarG: z.number().optional(),
      sodiumMg: z.number().optional(),
      source: z.enum(['ai', 'user']).optional(),
    })
    .nullable()
    .optional(),
  prePrep: z
    .array(z.object({ step: z.string(), leadMinutes: z.number().int().min(0) }))
    .optional()
    .describe('Pre-prep steps with lead time ("marinate", 720 minutes)'),
  steps: z.array(stepInput).optional(),
  flags: z
    .record(z.string(), z.boolean())
    .optional()
    .describe('Hand-set flags: gebrokts, kitniyot, chametz…'),
  equipment: z
    .array(z.object({ item: z.string(), designation: designation.nullable().optional() }))
    .optional(),
  dimensions: z
    .array(z.object({ dimension: z.string().describe('A dimension name or id'), fit }))
    .optional()
    .describe('Occasion fit: dimension and fit (fine, good, especially)'),
  ingredients: z.array(ingredientInput).optional(),
}

export const saveRecipeInput = z.object({
  recipeTitle: z
    .string()
    .max(200)
    .optional()
    .describe('The dish ("Brownies"). Required to create a recipe.'),
  recipeId: id.optional().describe('Add a new version to this recipe'),
  versionId: id.optional().describe('Edit this version in place (history is kept)'),
  ...versionFields,
})

export const searchInput = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .describe(
      'Words to find (title, description, ingredients). Other spellings work: Shabbos, kitniyos.',
    ),
  course: z.string().optional(),
  kashrut: kashrut.optional(),
  safeFor: ids.optional().describe('Person ids; each result says who cannot have it and why'),
  onlySafe: bool.optional().describe('Hide dishes the safeFor people cannot have'),
  date: date
    .optional()
    .describe('Date the safety check is for (seasons such as Pesach). Default today.'),
  pesach: bool.optional().describe('Only Pesach-friendly (no chametz)'),
  maxMinutes: int.optional(),
  notServedWeeks: int.optional().describe('Not served in this many weeks'),
  difficulty: difficulty.optional(),
  maxCost: int.optional(),
  dimension: z.string().optional().describe('A dimension name or id'),
  minFit: fit.optional(),
  collectionId: id.optional(),
  sort: z.enum(['relevance', 'quickest', 'easiest', 'longest_unserved', 'a_z']).optional(),
  limit: int.optional(),
  offset: int.optional(),
})

// ---- meals ----

export const mealItem = z.object({
  versionId: id.optional().describe('A recipe version…'),
  scale: z.number().positive().optional(),
  servings: z.number().int().positive().optional(),
  brought: z
    .object({
      description: z.string().min(1).max(200),
      by: z.string().min(1).max(100),
      kashrut: kashrut.optional(),
      course: z.string().optional(),
    })
    .optional()
    .describe('…or a dish someone is bringing (counts for balance and kashrut, not shopping)'),
  course: z.string().optional(),
})

export const createMealInput = z.object({
  date,
  name: z.string().min(1).max(100),
  time: time.nullable().optional(),
  kind: kashrut.nullable().optional(),
  personIds: ids
    .optional()
    .describe('Extra guests (contacts’ person ids). The household is in by default.'),
  excludePersonIds: ids.optional().describe('Household members who are not coming'),
  items: z.array(mealItem).optional(),
})

export const updateMealInput = z.object({
  name: z.string().min(1).max(100).optional(),
  date: date.optional(),
  time: time.nullable().optional(),
  kind: kashrut.nullable().optional(),
  personIds: z.array(id).optional().describe('Replace the whole guest list'),
  addPersonIds: z.array(id).optional(),
  removePersonIds: z.array(id).optional().describe('Mark people as not coming'),
  addItems: z.array(mealItem).optional(),
  removeItemIds: z.array(id).optional(),
  updateItems: z
    .array(
      z.object({
        id,
        course: z.string().optional(),
        scale: z.number().positive().optional(),
        servings: z.number().int().positive().optional(),
        by: z.string().optional(),
        description: z.string().optional(),
        kashrut: kashrut.optional(),
        done: z.boolean().optional().describe('Checked off on the accepted menu'),
      }),
    )
    .optional(),
  order: z.array(id).optional().describe('Item ids in the order they should appear'),
})

export const coursePlan = z
  .array(z.object({ course: z.string(), count: z.number().int().positive().optional() }))
  .optional()
  .describe('Courses to fill, in serving order. Default: a main, two sides, a salad, a dessert.')
