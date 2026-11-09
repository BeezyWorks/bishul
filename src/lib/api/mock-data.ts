/**
 * Fixtures for the mock API: the Levins, their guests, recipes, pantry and calendar facts.
 * Mock "today" is Tuesday 10 Nov 2026, so Shabbat Toldot (13-14 Nov) is "this Shabbat".
 */
import type {
  CalendarHoliday,
  Collection,
  Constraint,
  Cost,
  Course,
  Difficulty,
  Fit,
  Household,
  Id,
  IngredientLine,
  Kind,
  Meal,
  Person,
  Recipe,
  RecipeVersion,
  SkipImpact,
} from './types'

export const TODAY = '2026-11-10'
export const HOST_HOUSEHOLD = 'h-us'
export const OWNER_PERSON = 'p-ruth'

// ---- People ----

function c(
  personId: Id,
  tag: string,
  label: string,
  tagType: Constraint['tagType'],
  kind: Constraint['kind'],
  severity: Constraint['severity'],
  o: Partial<Pick<Constraint, 'activeWhen' | 'note' | 'source' | 'fromProfile'>> = {},
): Constraint {
  return {
    id: `c-${personId}-${tag}`,
    personId,
    tag,
    label,
    tagType,
    kind,
    severity,
    activeWhen: o.activeWhen ?? 'always',
    note: o.note,
    source: o.source ?? 'host',
    fromProfile: o.fromProfile ?? false,
  }
}

function person(p: Partial<Person> & Pick<Person, 'id' | 'name' | 'householdId'>): Person {
  return { constraints: [], notes: [], likes: [], dislikes: [], served: [], ...p }
}

export function buildHouseholds(): Household[] {
  return [
    {
      id: 'h-us',
      name: 'Us',
      isOwn: true,
      people: [
        person({
          id: 'p-ruth',
          name: 'Ruth',
          householdId: 'h-us',
          relation: 'You',
          constraints: [
            c('p-ruth', 'kitniyot', 'No kitniyot', 'kashrut-dish', 'religious', 'strict', {
              activeWhen: 'Pesach',
              source: 'self',
            }),
          ],
          likes: ['Sufganiyot', 'Brisket'],
        }),
        person({
          id: 'p-dan',
          name: 'Dan',
          householdId: 'h-us',
          relation: 'Husband',
          constraints: [
            c('p-dan', 'kitniyot', 'No kitniyot', 'kashrut-dish', 'religious', 'strict', {
              activeWhen: 'Pesach',
              source: 'self',
            }),
          ],
          likes: ['Cholent'],
        }),
        person({
          id: 'p-george',
          name: 'George',
          householdId: 'h-us',
          relation: 'Son',
          age: 10,
          constraints: [
            c(
              'p-george',
              'mushroom',
              'Dislikes mushrooms',
              'ingredient',
              'preference',
              'flexible',
              {
                note: 'Will eat around them.',
              },
            ),
          ],
          likes: ['Sweet potato kugel', 'Brownies', 'Sufganiyot'],
          dislikes: ['Cooked carrots'],
        }),
        person({
          id: 'p-noa',
          name: 'Noa',
          householdId: 'h-us',
          relation: 'Daughter',
          age: 7,
          constraints: [
            c('p-noa', 'sesame', 'Sesame allergy', 'allergen', 'medical', 'strict', {
              note: 'Carries an EpiPen. Tahini and sesame oil count too.',
              source: 'host',
            }),
          ],
          likes: ['Pasta bake', 'Sweet potato kugel'],
        }),
      ],
    },
    {
      id: 'h-savta',
      name: 'Savta Esther',
      isOwn: false,
      note: 'Ruth’s mother. Comes for Shabbat most weeks.',
      people: [
        person({
          id: 'p-savta',
          name: 'Savta Esther',
          householdId: 'h-savta',
          relation: 'Ruth’s mother',
          age: 79,
          constraints: [
            c(
              'p-savta',
              'chalav-yisrael',
              'Chalav Yisrael',
              'kashrut-sourcing',
              'religious',
              'strict',
            ),
            c(
              'p-savta',
              'no-fish-dairy',
              'No fish with dairy',
              'combination',
              'religious',
              'strict',
              {
                note: 'Family minhag.',
              },
            ),
          ],
          notes: [
            'Likes the cholent less salty.',
            'Brings her own honey cake on Rosh Hashanah.',
            'Sits near the door; no stairs.',
          ],
          likes: ['Cholent', 'Silan chicken', 'Chicken soup'],
          dislikes: ['Spicy food'],
        }),
      ],
    },
    {
      id: 'h-avi',
      name: 'Avi',
      isOwn: false,
      note: 'Friend from shul.',
      people: [
        person({
          id: 'p-avi',
          name: 'Avi',
          householdId: 'h-avi',
          relation: 'Friend',
          age: 38,
          link: { profileName: 'Avi Katz', mode: 'merge' },
          constraints: [
            c('p-avi', 'peanut', 'Peanut allergy', 'allergen', 'medical', 'strict', {
              source: 'self',
              fromProfile: true,
            }),
            c('p-avi', 'glatt', 'Glatt meat', 'kashrut-sourcing', 'religious', 'strict', {
              source: 'self',
              fromProfile: true,
            }),
            c('p-avi', 'cilantro', 'Dislikes cilantro', 'ingredient', 'preference', 'flexible', {
              note: 'Added by you.',
            }),
          ],
          notes: ['Vegetarian-leaning but eats Shabbat chicken.', 'Always brings wine.'],
          likes: ['Silan chicken', 'Brisket'],
          dislikes: [],
        }),
      ],
    },
  ]
}

// ---- Recipes ----

type IngSpec = [
  name: string,
  amount: number,
  unit: 'g' | 'ml' | 'pc',
  original: string,
  o?: {
    prep?: string
    skip?: SkipImpact
    allergens?: string[]
    flags?: string[]
    density?: number
    ai?: boolean
  },
]
type StepSpec = [text: string, timerMin: number, uses: string[]]

interface VSpec {
  id: Id
  tags?: string[]
  label: string
  parentId?: Id
  description: string
  servings: number
  kind: Kind
  difficulty?: Difficulty
  activeMin: number
  totalMin: number
  prePrep?: { text: string; leadHours: number; passive: boolean }[]
  serving?: RecipeVersion['serving']
  blech?: boolean
  easyToDeliver?: boolean
  equipment?: { name: string; designation: Kind | 'pesach' }[]
  flags?: string[]
  cost?: Cost
  fit?: [string, Fit][]
  source?: { label: string; url: string }
  pesach?: boolean
  ingredients: IngSpec[]
  steps: StepSpec[]
  reactions?: [
    personId: Id,
    name: string,
    kind: 'like' | 'dislike',
    note: string | undefined,
    date: string,
  ][]
  history?: [date: string, by: string, summary: string][]
}

function version(recipeId: Id, s: VSpec): RecipeVersion {
  const ingredients: IngredientLine[] = s.ingredients.map(
    ([name, amount, unit, original, o], i) => ({
      id: `${s.id}-i${i}`,
      name,
      amount,
      unit,
      original,
      prep: o?.prep,
      skipImpact: o?.skip ?? 'ruins',
      allergens: o?.allergens ?? [],
      flags: o?.flags ?? [],
      density: o?.density,
      aiFilled: o?.ai,
    }),
  )
  return {
    id: s.id,
    recipeId,
    label: s.label,
    parentId: s.parentId,
    description: s.description,
    servings: s.servings,
    kind: s.kind,
    difficulty: s.difficulty ?? 'easy',
    activeMin: s.activeMin,
    totalMin: s.totalMin,
    prePrep: s.prePrep ?? [],
    serving: s.serving ?? 'hot',
    holdsOnBlech: s.blech ?? false,
    easyToDeliver: s.easyToDeliver ?? false,
    equipment: s.equipment ?? [],
    flags: s.flags ?? [],
    cost: s.cost ?? '$',
    occasionFit: (s.fit ?? []).map(([dimension, fit]) => ({ dimension, fit })),
    tags: s.tags ?? [],
    source: s.source,
    pesachFriendly: s.pesach ?? false,
    ingredients,
    steps: s.steps.map(([text, timerMin, uses], i) => ({
      id: `${s.id}-s${i}`,
      text,
      timerSec: timerMin ? timerMin * 60 : undefined,
      ingredientIds: uses
        .map((u) => ingredients.find((x) => x.name === u)?.id)
        .filter((x): x is string => !!x),
    })),
    reactions: (s.reactions ?? []).map(([personId, personName, kind, note, date]) => ({
      personId,
      personName,
      kind,
      note,
      recordedBy: 'Ruth',
      date,
    })),
    history: (s.history ?? [['2026-03-02', 'Ruth', 'Created']]).map(([date, by, summary]) => ({
      date,
      by,
      summary,
    })),
  }
}

function recipe(
  id: Id,
  title: string,
  course: Course,
  form: string,
  aliases: string[],
  versions: VSpec[],
): Recipe {
  return { id, title, aliases, course, form, versions: versions.map((v) => version(id, v)) }
}

const MEAT_POT = [{ name: 'Large pot', designation: 'meat' as const }]

export function buildRecipes(): Recipe[] {
  return [
    recipe(
      'r-brownies',
      'Brownies',
      'dessert',
      'bars',
      ['brownie'],
      [
        {
          id: 'v-brownies-fudgy',
          label: 'Fudgy (dairy)',
          description: 'Dense, glossy, melted-chocolate brownies. Best the next day.',
          servings: 16,
          kind: 'dairy',
          activeMin: 15,
          totalMin: 50,
          serving: 'room temperature',
          easyToDeliver: true,
          cost: '$$',
          fit: [
            ['Shabbat day', 'good'],
            ['Chanukah', 'fine'],
            ['Kids love it', 'especially suited'],
          ],
          source: { label: 'Adapted from Smitten Kitchen', url: 'https://smittenkitchen.com' },
          equipment: [{ name: 'Square pan 20 cm', designation: 'dairy' }],
          ingredients: [
            ['Butter', 170, 'g', '¾ cup (170 g) butter', { flags: ['dairy'], density: 0.95 }],
            [
              'Dark chocolate',
              200,
              'g',
              '200 g dark chocolate',
              { prep: 'chopped', flags: ['dairy'] },
            ],
            ['Sugar', 200, 'g', '1 cup sugar', { density: 0.85 }],
            ['Eggs', 3, 'pc', '3 eggs', { allergens: ['egg'] }],
            ['Flour', 90, 'g', '¾ cup flour', { flags: ['chametz'], density: 0.5 }],
            ['Cocoa', 30, 'g', '¼ cup cocoa', { skip: 'minor', ai: true, density: 0.4 }],
            [
              'Walnuts',
              80,
              'g',
              '⅔ cup walnuts',
              { skip: 'none', allergens: ['tree nut'], prep: 'chopped' },
            ],
            ['Salt', 2, 'g', 'a pinch of salt', { skip: 'minor' }],
          ],
          steps: [
            ['Heat the oven to 175°C. Line the pan with baking paper.', 0, []],
            [
              'Melt the butter and chocolate together over low heat, stirring until glossy.',
              5,
              ['Butter', 'Dark chocolate'],
            ],
            ['Whisk in the sugar, then the eggs one at a time.', 0, ['Sugar', 'Eggs']],
            [
              'Fold in the flour, cocoa and salt until just combined. Add the walnuts.',
              0,
              ['Flour', 'Cocoa', 'Salt', 'Walnuts'],
            ],
            ['Bake until the centre is just set.', 28, []],
            ['Cool completely in the pan before cutting.', 0, []],
          ],
          reactions: [
            ['p-george', 'George', 'like', 'Wanted seconds.', '2026-09-12'],
            ['p-dan', 'Dan', 'like', undefined, '2026-09-12'],
          ],
          history: [
            ['2026-02-10', 'Ruth', 'Created'],
            ['2026-06-01', 'Dan', 'Baking time 25 to 28 minutes'],
          ],
        },
        {
          id: 'v-brownies-cakey',
          label: 'Cakey (parve)',
          parentId: 'v-brownies-fudgy',
          description: 'Lighter, cake-like, with margarine so it works after a meat meal.',
          servings: 16,
          kind: 'parve',
          activeMin: 15,
          totalMin: 45,
          serving: 'room temperature',
          easyToDeliver: true,
          fit: [
            ['Shabbat night', 'good'],
            ['Shabbat day', 'good'],
            ['Weekday', 'fine'],
            ['Kids love it', 'good'],
          ],
          equipment: [{ name: 'Square pan 20 cm', designation: 'parve' }],
          ingredients: [
            ['Margarine', 150, 'g', '⅔ cup margarine', { density: 0.95 }],
            ['Sugar', 220, 'g', '1 cup plus 2 tbsp sugar', { density: 0.85 }],
            ['Eggs', 3, 'pc', '3 eggs', { allergens: ['egg'] }],
            ['Flour', 130, 'g', '1 cup flour', { flags: ['chametz'], density: 0.5 }],
            ['Cocoa', 45, 'g', '½ cup cocoa', { ai: true, density: 0.4 }],
            ['Baking powder', 5, 'g', '1 tsp baking powder', { skip: 'ruins' }],
            ['Vanilla', 5, 'ml', '1 tsp vanilla', { skip: 'minor' }],
          ],
          steps: [
            ['Heat the oven to 175°C and line the pan.', 0, []],
            [
              'Beat the margarine with the sugar, then add the eggs and vanilla.',
              0,
              ['Margarine', 'Sugar', 'Eggs', 'Vanilla'],
            ],
            ['Fold in the flour, cocoa and baking powder.', 0, ['Flour', 'Cocoa', 'Baking powder']],
            ['Bake until a toothpick comes out with a few crumbs.', 25, []],
          ],
          reactions: [['p-noa', 'Noa', 'like', 'Asked for the cakey ones.', '2026-10-17']],
          history: [['2026-03-20', 'Ruth', 'Saved as a variation of Fudgy']],
        },
        {
          id: 'v-brownies-pesach',
          label: 'Pesach (potato starch)',
          parentId: 'v-brownies-cakey',
          description: 'No flour, no kitniyot. Dense and fudgy.',
          servings: 16,
          kind: 'parve',
          activeMin: 15,
          totalMin: 45,
          pesach: true,
          serving: 'room temperature',
          flags: [],
          fit: [
            ['Pesach', 'especially suited'],
            ['Shabbat day', 'good'],
          ],
          equipment: [{ name: 'Square pan 20 cm', designation: 'pesach' }],
          ingredients: [
            ['Margarine', 150, 'g', '⅔ cup Pesach margarine', {}],
            ['Sugar', 200, 'g', '1 cup sugar', { density: 0.85 }],
            ['Eggs', 4, 'pc', '4 eggs', { allergens: ['egg'] }],
            ['Cocoa', 50, 'g', '½ cup cocoa', { ai: true, density: 0.4 }],
            ['Potato starch', 60, 'g', '½ cup potato starch', { density: 0.6 }],
          ],
          steps: [
            ['Heat the oven to 175°C.', 0, []],
            [
              'Beat everything together until smooth.',
              0,
              ['Margarine', 'Sugar', 'Eggs', 'Cocoa', 'Potato starch'],
            ],
            ['Bake in the pesach pan.', 30, []],
          ],
          history: [['2026-03-28', 'Ruth', 'Created for Pesach']],
        },
      ],
    ),

    recipe(
      'r-silan-chicken',
      'Silan chicken',
      'main',
      'roast chicken',
      ['date honey chicken', 'chicken with silan'],
      [
        {
          id: 'v-silan',
          label: 'Classic',
          description: 'Pargiyot roasted in silan, orange and garlic until sticky.',
          servings: 8,
          kind: 'meat',
          activeMin: 20,
          totalMin: 80,
          serving: 'hot',
          blech: true,
          cost: '$$',
          prePrep: [
            { text: 'Marinate the pargiyot in the silan mixture', leadHours: 12, passive: true },
          ],
          pesach: true,
          fit: [
            ['Shabbat night', 'especially suited'],
            ['Shabbat day', 'good'],
            ['Thanksgiving', 'fine'],
          ],
          equipment: [{ name: 'Roasting tray', designation: 'meat' }],
          source: { label: 'Savta’s recipe card', url: 'https://example.com/savta-silan' },
          ingredients: [
            ['Pargiyot', 1500, 'g', '1.5 kg pargiyot (chicken thighs)', { flags: ['meat'] }],
            ['Silan', 90, 'ml', '6 tbsp silan', { ai: true }],
            ['Orange juice', 120, 'ml', '½ cup orange juice', { skip: 'minor' }],
            ['Garlic', 4, 'pc', '4 cloves garlic', { skip: 'minor', prep: 'crushed' }],
            ['Olive oil', 45, 'ml', '3 tbsp olive oil'],
            ['Paprika', 5, 'g', '1 tsp paprika', { skip: 'none' }],
            ['Salt', 8, 'g', '1½ tsp salt', { skip: 'ruins' }],
          ],
          steps: [
            [
              'Mix the silan, orange juice, garlic, oil, paprika and salt. Pour over the pargiyot and marinate overnight.',
              0,
              ['Silan', 'Orange juice', 'Garlic', 'Olive oil', 'Paprika', 'Salt', 'Pargiyot'],
            ],
            ['Heat the oven to 200°C. Lay the pargiyot skin-side up in the tray.', 0, ['Pargiyot']],
            ['Roast, basting twice with the marinade.', 45, []],
            ['Raise to 220°C and roast until the skin is deep golden.', 15, []],
          ],
          reactions: [
            ['p-avi', 'Avi', 'like', 'Asked for the recipe.', '2026-10-24'],
            ['p-savta', 'Savta Esther', 'like', 'Just right.', '2026-10-24'],
          ],
          history: [
            ['2026-01-14', 'Ruth', 'Created'],
            ['2026-05-02', 'Ruth', 'Marinate 12 h, not 4'],
          ],
        },
      ],
    ),

    recipe(
      'r-chicken-soup',
      'Chicken soup',
      'soup',
      'clear soup',
      ['marak of', 'jewish penicillin'],
      [
        {
          id: 'v-soup',
          label: 'Friday-night',
          description: 'Clear golden soup with plenty of dill.',
          servings: 10,
          kind: 'meat',
          activeMin: 25,
          totalMin: 150,
          blech: true,
          cost: '$',
          pesach: true,
          fit: [
            ['Shabbat night', 'especially suited'],
            ['Weekday', 'fine'],
          ],
          equipment: MEAT_POT,
          ingredients: [
            ['Chicken pieces', 1000, 'g', '1 kg chicken pieces', { flags: ['meat'] }],
            ['Carrots', 4, 'pc', '4 carrots', { prep: 'peeled' }],
            ['Celery', 3, 'pc', '3 stalks celery'],
            ['Onions', 2, 'pc', '2 onions', { prep: 'halved' }],
            ['Parsnip', 2, 'pc', '2 parsnips'],
            ['Dill', 20, 'g', 'a bunch of dill', { skip: 'minor' }],
            ['Water', 3000, 'ml', '3 litres water'],
            ['Salt', 15, 'g', '1 tbsp salt', { skip: 'ruins' }],
          ],
          steps: [
            [
              'Cover the chicken with the water, bring to the boil and skim well.',
              15,
              ['Chicken pieces', 'Water'],
            ],
            [
              'Add the vegetables and salt. Simmer gently, covered.',
              120,
              ['Carrots', 'Celery', 'Onions', 'Parsnip', 'Salt'],
            ],
            [
              'Add the dill for the last ten minutes. Strain, or serve with the vegetables.',
              10,
              ['Dill'],
            ],
          ],
          reactions: [['p-savta', 'Savta Esther', 'like', undefined, '2026-10-24']],
        },
      ],
    ),

    recipe(
      'r-sweet-kugel',
      'Sweet potato kugel',
      'side',
      'kugel',
      ['batata kugel'],
      [
        {
          id: 'v-sweet-kugel',
          label: 'Classic',
          description: 'Sweet, soft, with a crisp top. The one George asks for.',
          servings: 10,
          kind: 'parve',
          activeMin: 20,
          totalMin: 80,
          blech: true,
          easyToDeliver: true,
          pesach: true,
          fit: [
            ['Shabbat day', 'especially suited'],
            ['Shabbat night', 'good'],
            ['Thanksgiving', 'good'],
            ['Kids love it', 'especially suited'],
          ],
          equipment: [{ name: '23 cm baking dish', designation: 'parve' }],
          ingredients: [
            ['Sweet potatoes', 1000, 'g', '1 kg sweet potatoes', { prep: 'peeled and grated' }],
            ['Eggs', 3, 'pc', '3 eggs', { allergens: ['egg'] }],
            ['Oil', 80, 'ml', '⅓ cup oil'],
            ['Brown sugar', 75, 'g', '⅓ cup brown sugar', { skip: 'minor', density: 0.9 }],
            ['Cinnamon', 3, 'g', '1 tsp cinnamon', { skip: 'none' }],
            ['Potato starch', 30, 'g', '¼ cup potato starch', { density: 0.6 }],
            ['Salt', 3, 'g', '½ tsp salt', { skip: 'minor' }],
          ],
          steps: [
            ['Heat the oven to 190°C and oil the dish.', 0, []],
            [
              'Mix everything in a big bowl.',
              0,
              ['Sweet potatoes', 'Eggs', 'Oil', 'Brown sugar', 'Cinnamon', 'Potato starch', 'Salt'],
            ],
            ['Pour into the dish and bake until set and browned at the edges.', 50, []],
          ],
          reactions: [
            ['p-george', 'George', 'like', 'His favourite.', '2026-10-31'],
            ['p-noa', 'Noa', 'like', undefined, '2026-10-31'],
          ],
          history: [
            ['2026-04-01', 'Ruth', 'Created'],
            ['2026-10-05', 'Ruth', 'Less sugar'],
          ],
        },
      ],
    ),

    recipe(
      'r-potato-kugel',
      'Potato kugel',
      'side',
      'kugel',
      ['kartoffel kugel'],
      [
        {
          id: 'v-potato-kugel',
          label: 'Classic',
          description: 'Crisp edges, soft middle, plenty of pepper.',
          servings: 10,
          kind: 'parve',
          activeMin: 25,
          totalMin: 90,
          blech: true,
          easyToDeliver: true,
          fit: [
            ['Shabbat night', 'good'],
            ['Shabbat day', 'especially suited'],
          ],
          equipment: [{ name: '23 cm baking dish', designation: 'parve' }],
          ingredients: [
            ['Potatoes', 1500, 'g', '1.5 kg potatoes', { prep: 'peeled and grated' }],
            ['Onions', 2, 'pc', '2 onions', { prep: 'grated' }],
            ['Eggs', 4, 'pc', '4 eggs', { allergens: ['egg'] }],
            ['Oil', 120, 'ml', '½ cup oil'],
            ['Flour', 30, 'g', '¼ cup flour', { flags: ['chametz'], density: 0.5, skip: 'minor' }],
            ['Salt', 12, 'g', '2 tsp salt'],
            ['Pepper', 3, 'g', '1 tsp pepper', { skip: 'minor' }],
          ],
          steps: [
            ['Heat the oven to 200°C and heat the oiled dish in it.', 0, ['Oil']],
            [
              'Mix the potatoes, onions, eggs, flour, salt and pepper.',
              0,
              ['Potatoes', 'Onions', 'Eggs', 'Flour', 'Salt', 'Pepper'],
            ],
            ['Pour into the hot dish. Bake until deep brown.', 70, []],
          ],
          reactions: [['p-dan', 'Dan', 'like', undefined, '2026-09-05']],
        },
        {
          id: 'v-potato-kugel-pesach',
          label: 'Pesach (potato starch)',
          parentId: 'v-potato-kugel',
          description: 'Same kugel, no flour.',
          servings: 10,
          kind: 'parve',
          activeMin: 25,
          totalMin: 90,
          blech: true,
          pesach: true,
          fit: [['Pesach', 'good']],
          ingredients: [
            ['Potatoes', 1500, 'g', '1.5 kg potatoes', {}],
            ['Onions', 2, 'pc', '2 onions', {}],
            ['Eggs', 4, 'pc', '4 eggs', { allergens: ['egg'] }],
            ['Oil', 120, 'ml', '½ cup oil', {}],
            ['Potato starch', 30, 'g', '¼ cup potato starch', { density: 0.6 }],
            ['Salt', 12, 'g', '2 tsp salt', {}],
          ],
          steps: [['Mix, pour into a hot oiled dish and bake until deep brown.', 70, []]],
        },
      ],
    ),

    recipe(
      'r-cholent',
      'Cholent',
      'main',
      'stew',
      ['chamin', 'hamin'],
      [
        {
          id: 'v-cholent',
          label: 'Overnight',
          description: 'Beef, beans and barley. Goes on before Shabbat, comes off for lunch.',
          servings: 12,
          kind: 'meat',
          difficulty: 'easy',
          activeMin: 30,
          totalMin: 780,
          blech: true,
          cost: '$$',
          prePrep: [{ text: 'Soak the beans overnight', leadHours: 10, passive: true }],
          fit: [
            ['Shabbat day', 'especially suited'],
            ['Weekday', 'fine'],
          ],
          equipment: [{ name: 'Slow cooker', designation: 'meat' }],
          ingredients: [
            ['Flanken', 800, 'g', '800 g flanken', { flags: ['meat'] }],
            ['Potatoes', 1000, 'g', '1 kg potatoes', { prep: 'quartered' }],
            ['Beans', 300, 'g', '1½ cups mixed beans', { flags: ['kitniyot'], prep: 'soaked' }],
            ['Barley', 150, 'g', '¾ cup pearl barley', { flags: ['chametz'], density: 0.7 }],
            ['Onions', 2, 'pc', '2 onions', { prep: 'sliced' }],
            ['Honey', 60, 'ml', '3 tbsp honey', { skip: 'minor' }],
            ['Paprika', 10, 'g', '2 tsp paprika', { skip: 'none' }],
            ['Salt', 15, 'g', '1 tbsp salt', {}],
          ],
          steps: [
            ['Brown the flanken and the onions in the pot.', 10, ['Flanken', 'Onions']],
            [
              'Layer in the beans, barley and potatoes. Add honey, paprika and salt.',
              0,
              ['Beans', 'Barley', 'Potatoes', 'Honey', 'Paprika', 'Salt'],
            ],
            [
              'Cover with water and bring to a simmer, then set to low and leave until lunch.',
              0,
              [],
            ],
          ],
          reactions: [
            ['p-dan', 'Dan', 'like', undefined, '2026-10-24'],
            ['p-george', 'George', 'dislike', 'Picks out the beans.', '2026-10-24'],
            ['p-savta', 'Savta Esther', 'like', 'Less salt next time.', '2026-10-24'],
          ],
        },
      ],
    ),

    recipe(
      'r-israeli-salad',
      'Israeli salad',
      'salad',
      'chopped salad',
      ['salat katzutz'],
      [
        {
          id: 'v-israeli-salad',
          label: 'Classic',
          description: 'Cucumber, tomato and parsley cut small, with lemon and olive oil.',
          servings: 6,
          kind: 'parve',
          activeMin: 15,
          totalMin: 15,
          serving: 'cold',
          easyToDeliver: true,
          pesach: true,
          fit: [
            ['Weekday', 'especially suited'],
            ['Shabbat day', 'good'],
            ['Shabbat night', 'fine'],
          ],
          ingredients: [
            ['Cucumbers', 4, 'pc', '4 cucumbers', { prep: 'diced small' }],
            ['Tomatoes', 4, 'pc', '4 tomatoes', { prep: 'diced small' }],
            ['Red onion', 1, 'pc', '½ red onion', { skip: 'minor', prep: 'diced' }],
            ['Parsley', 30, 'g', '1 handful parsley', { skip: 'minor' }],
            ['Lemon juice', 45, 'ml', '3 tbsp lemon juice'],
            ['Olive oil', 45, 'ml', '3 tbsp olive oil'],
            ['Salt', 4, 'g', '¾ tsp salt', {}],
          ],
          steps: [
            [
              'Dice the cucumbers, tomatoes and onion as small as you have patience for.',
              0,
              ['Cucumbers', 'Tomatoes', 'Red onion'],
            ],
            [
              'Toss with the parsley, lemon juice, oil and salt just before serving.',
              0,
              ['Parsley', 'Lemon juice', 'Olive oil', 'Salt'],
            ],
          ],
        },
      ],
    ),

    recipe(
      'r-rice',
      'Sesame-scallion rice',
      'side',
      'rice',
      ['rice with scallions'],
      [
        {
          id: 'v-rice',
          label: 'Classic',
          description: 'Fluffy rice with toasted sesame oil and scallions.',
          servings: 8,
          kind: 'parve',
          activeMin: 10,
          totalMin: 30,
          flags: ['kitniyot'],
          fit: [
            ['Weekday', 'good'],
            ['Shabbat day', 'fine'],
          ],
          ingredients: [
            ['Rice', 400, 'g', '2 cups basmati rice', { flags: ['kitniyot'], density: 0.8 }],
            ['Scallions', 6, 'pc', '6 scallions', { prep: 'sliced' }],
            [
              'Sesame oil',
              30,
              'ml',
              '2 tbsp toasted sesame oil',
              { allergens: ['sesame'], skip: 'ruins' },
            ],
            [
              'Sesame seeds',
              20,
              'g',
              '2 tbsp sesame seeds',
              { allergens: ['sesame'], skip: 'none' },
            ],
            ['Salt', 6, 'g', '1 tsp salt', {}],
          ],
          steps: [
            ['Rinse the rice, then cook it in 1½ times its volume of water.', 18, ['Rice', 'Salt']],
            [
              'Fold in the sesame oil and scallions. Top with sesame seeds.',
              0,
              ['Sesame oil', 'Scallions', 'Sesame seeds'],
            ],
          ],
        },
      ],
    ),

    recipe(
      'r-pasta-bake',
      'Pasta bake',
      'main',
      'baked pasta',
      ['baked ziti'],
      [
        {
          id: 'v-pasta-bake',
          label: 'Classic',
          description: 'Penne in tomato sauce with mozzarella and ricotta.',
          servings: 8,
          kind: 'dairy',
          activeMin: 20,
          totalMin: 55,
          fit: [
            ['Weekday', 'especially suited'],
            ['Kids love it', 'especially suited'],
          ],
          equipment: [{ name: 'Baking dish', designation: 'dairy' }],
          ingredients: [
            ['Pasta', 500, 'g', '500 g penne', { flags: ['chametz'] }],
            ['Tomato sauce', 600, 'ml', '600 ml tomato sauce'],
            ['Mozzarella', 250, 'g', '250 g mozzarella', { flags: ['dairy'], skip: 'ruins' }],
            ['Ricotta', 250, 'g', '250 g ricotta', { flags: ['dairy'], skip: 'minor' }],
            ['Mushrooms', 200, 'g', '200 g mushrooms', { skip: 'none', prep: 'sliced' }],
            ['Basil', 10, 'g', 'a few basil leaves', { skip: 'none' }],
          ],
          steps: [
            ['Boil the pasta until almost done.', 9, ['Pasta']],
            [
              'Mix with the sauce, ricotta and mushrooms. Tip into the dish and cover with mozzarella.',
              0,
              ['Tomato sauce', 'Ricotta', 'Mushrooms', 'Mozzarella'],
            ],
            ['Bake until bubbling. Top with basil.', 25, ['Basil']],
          ],
          reactions: [
            ['p-noa', 'Noa', 'like', undefined, '2026-10-20'],
            ['p-george', 'George', 'like', 'Without mushrooms.', '2026-10-20'],
          ],
        },
      ],
    ),

    recipe(
      'r-lentil-soup',
      'Red lentil soup',
      'soup',
      'puréed soup',
      ['adashim soup', 'marak adashim'],
      [
        {
          id: 'v-lentil-soup',
          label: 'Classic',
          description: 'Silky, lemony, ready in forty minutes.',
          servings: 6,
          kind: 'parve',
          activeMin: 10,
          totalMin: 40,
          flags: ['kitniyot'],
          fit: [['Weekday', 'especially suited']],
          ingredients: [
            ['Red lentils', 300, 'g', '1½ cups red lentils', { flags: ['kitniyot'], density: 0.8 }],
            ['Carrots', 2, 'pc', '2 carrots'],
            ['Onions', 1, 'pc', '1 onion'],
            ['Cumin', 5, 'g', '1 tsp cumin', { skip: 'minor' }],
            ['Turmeric', 3, 'g', '½ tsp turmeric', { skip: 'none' }],
            ['Lemon juice', 30, 'ml', '2 tbsp lemon juice', { skip: 'minor' }],
            ['Water', 1500, 'ml', '1.5 litres water'],
          ],
          steps: [
            [
              'Sauté the onion and carrots with the spices.',
              8,
              ['Onions', 'Carrots', 'Cumin', 'Turmeric'],
            ],
            [
              'Add the lentils and water. Simmer until soft, then blend.',
              25,
              ['Red lentils', 'Water'],
            ],
            ['Finish with lemon juice.', 0, ['Lemon juice']],
          ],
        },
      ],
    ),

    recipe(
      'r-brisket',
      'Brisket',
      'main',
      'braised beef',
      ['brust'],
      [
        {
          id: 'v-brisket',
          label: 'Red wine',
          description: 'Slow-braised with onions, carrots and red wine. Better the next day.',
          servings: 10,
          kind: 'meat',
          difficulty: 'average',
          activeMin: 25,
          totalMin: 240,
          blech: true,
          cost: '$$$',
          pesach: true,
          prePrep: [
            { text: 'Rub the brisket and rest it in the fridge', leadHours: 12, passive: true },
          ],
          fit: [
            ['Shabbat night', 'good'],
            ['Shabbat day', 'especially suited'],
            ['Pesach', 'good'],
          ],
          equipment: MEAT_POT,
          ingredients: [
            ['Brisket', 2000, 'g', '2 kg brisket', { flags: ['meat'] }],
            ['Onions', 4, 'pc', '4 onions', { prep: 'sliced' }],
            ['Carrots', 3, 'pc', '3 carrots'],
            ['Garlic', 6, 'pc', '6 cloves garlic', { skip: 'minor' }],
            ['Red wine', 250, 'ml', '1 cup red wine', { skip: 'minor' }],
            ['Tomato paste', 60, 'g', '4 tbsp tomato paste', { skip: 'minor' }],
            ['Brown sugar', 50, 'g', '¼ cup brown sugar', { skip: 'none', density: 0.9 }],
          ],
          steps: [
            ['Brown the brisket on all sides, then set aside.', 12, ['Brisket']],
            [
              'Soften the onions, garlic and carrots. Stir in the tomato paste.',
              10,
              ['Onions', 'Garlic', 'Carrots', 'Tomato paste'],
            ],
            [
              'Return the brisket, add the wine and sugar, cover tightly and braise at 160°C.',
              180,
              ['Red wine', 'Brown sugar'],
            ],
            ['Rest, slice against the grain and return to the sauce.', 0, []],
          ],
          reactions: [['p-avi', 'Avi', 'like', undefined, '2026-10-03']],
        },
      ],
    ),

    recipe(
      'r-turkey',
      'Roast turkey',
      'main',
      'roast',
      ['thanksgiving turkey'],
      [
        {
          id: 'v-turkey',
          label: 'Herb butter-free',
          description: 'A 5 kg turkey roasted with onions, celery and herbs. Oil, not butter.',
          servings: 12,
          kind: 'meat',
          difficulty: 'average',
          activeMin: 30,
          totalMin: 240,
          cost: '$$$',
          fit: [
            ['Thanksgiving', 'especially suited'],
            ['Shabbat day', 'fine'],
          ],
          equipment: [{ name: 'Roasting pan', designation: 'meat' }],
          ingredients: [
            ['Turkey', 5000, 'g', '5 kg turkey', { flags: ['meat'] }],
            ['Onions', 3, 'pc', '3 onions', { prep: 'quartered' }],
            ['Celery', 3, 'pc', '3 stalks celery'],
            ['Olive oil', 90, 'ml', '6 tbsp olive oil'],
            ['Sage', 10, 'g', 'a few sage leaves', { skip: 'minor' }],
            ['Thyme', 8, 'g', 'a few sprigs thyme', { skip: 'none' }],
            ['Salt', 20, 'g', '1 tbsp plus 1 tsp salt', {}],
          ],
          steps: [
            [
              'Rub the turkey with the oil, salt and herbs. Stuff the cavity with the onions and celery.',
              0,
              ['Turkey', 'Olive oil', 'Sage', 'Thyme', 'Salt', 'Onions', 'Celery'],
            ],
            ['Roast at 180°C, basting every 45 minutes.', 180, []],
            ['Rest for 30 minutes before carving.', 30, []],
          ],
        },
      ],
    ),

    recipe(
      'r-cheesecake',
      'Cheesecake',
      'dessert',
      'cake',
      ['jewish cheesecake'],
      [
        {
          id: 'v-cheesecake',
          label: 'Classic',
          description: 'Creamy baked cheesecake on a biscuit base. Make a day ahead.',
          servings: 12,
          kind: 'dairy',
          difficulty: 'average',
          activeMin: 25,
          totalMin: 480,
          serving: 'cold',
          cost: '$$',
          prePrep: [{ text: 'Chill the cheesecake overnight', leadHours: 12, passive: true }],
          fit: [
            ['Chanukah', 'good'],
            ['Shavuot', 'especially suited'],
          ],
          ingredients: [
            ['Cream cheese', 750, 'g', '750 g cream cheese', { flags: ['dairy'] }],
            ['Sour cream', 250, 'ml', '1 cup sour cream', { flags: ['dairy'], skip: 'minor' }],
            ['Eggs', 4, 'pc', '4 eggs', { allergens: ['egg'] }],
            ['Sugar', 200, 'g', '1 cup sugar', { density: 0.85 }],
            ['Biscuits', 200, 'g', '200 g biscuits', { flags: ['chametz'] }],
            ['Butter', 80, 'g', '⅓ cup butter', { flags: ['dairy'], density: 0.95 }],
            ['Vanilla', 5, 'ml', '1 tsp vanilla', { skip: 'minor' }],
          ],
          steps: [
            [
              'Crush the biscuits, mix with the melted butter and press into a lined tin.',
              0,
              ['Biscuits', 'Butter'],
            ],
            [
              'Beat the cream cheese with the sugar, then the eggs, sour cream and vanilla.',
              0,
              ['Cream cheese', 'Sugar', 'Eggs', 'Sour cream', 'Vanilla'],
            ],
            ['Bake at 160°C until set with a gentle wobble.', 55, []],
            ['Cool in the oven with the door ajar, then chill overnight.', 0, []],
          ],
        },
      ],
    ),

    recipe(
      'r-coleslaw',
      'Coleslaw',
      'salad',
      'slaw',
      ['cole slaw'],
      [
        {
          id: 'v-coleslaw',
          label: 'Classic',
          description: 'Crunchy cabbage and carrot with a tangy mayo dressing.',
          servings: 10,
          kind: 'parve',
          activeMin: 20,
          totalMin: 20,
          serving: 'cold',
          easyToDeliver: true,
          fit: [
            ['Thanksgiving', 'good'],
            ['Shabbat day', 'good'],
            ['Weekday', 'fine'],
          ],
          ingredients: [
            ['Cabbage', 600, 'g', '600 g cabbage', { prep: 'shredded' }],
            ['Carrots', 2, 'pc', '2 carrots', { prep: 'grated' }],
            ['Mayonnaise', 120, 'g', '½ cup mayonnaise', { allergens: ['egg'] }],
            ['Vinegar', 30, 'ml', '2 tbsp vinegar', { skip: 'minor' }],
            ['Sugar', 15, 'g', '1 tbsp sugar', { skip: 'none', density: 0.85 }],
            ['Cilantro', 15, 'g', 'a handful of cilantro', { skip: 'minor' }],
          ],
          steps: [
            ['Shred the cabbage and carrots.', 0, ['Cabbage', 'Carrots']],
            [
              'Whisk the mayonnaise, vinegar and sugar. Toss with the cabbage and cilantro.',
              0,
              ['Mayonnaise', 'Vinegar', 'Sugar', 'Cilantro'],
            ],
          ],
        },
      ],
    ),

    recipe(
      'r-sufganiyot',
      'Sufganiyot',
      'dessert',
      'doughnuts',
      ['jelly doughnuts', 'donuts'],
      [
        {
          id: 'v-sufganiyot',
          label: 'Classic',
          description: 'Yeasted doughnuts, fried and filled with jam.',
          servings: 16,
          kind: 'parve',
          difficulty: 'a pain',
          activeMin: 60,
          totalMin: 150,
          serving: 'room temperature',
          cost: '$$',
          prePrep: [{ text: 'Make the dough and let it rise', leadHours: 2, passive: true }],
          fit: [
            ['Chanukah', 'especially suited'],
            ['Kids love it', 'good'],
          ],
          equipment: [{ name: 'Deep fryer', designation: 'parve' }],
          ingredients: [
            ['Flour', 500, 'g', '4 cups flour', { flags: ['chametz'], density: 0.5 }],
            ['Yeast', 10, 'g', '1 packet dry yeast', { skip: 'ruins' }],
            ['Sugar', 80, 'g', '⅓ cup sugar', { density: 0.85 }],
            ['Eggs', 2, 'pc', '2 eggs', { allergens: ['egg'] }],
            ['Oil for frying', 1000, 'ml', '1 litre oil'],
            ['Jam', 200, 'g', '1 cup jam', { skip: 'none', ai: true }],
          ],
          steps: [
            [
              'Knead the flour, yeast, sugar, eggs and warm water into a soft dough. Let rise.',
              60,
              ['Flour', 'Yeast', 'Sugar', 'Eggs'],
            ],
            ['Roll out, cut rounds and let them puff.', 30, []],
            [
              'Fry in medium-hot oil until golden, about two minutes a side.',
              20,
              ['Oil for frying'],
            ],
            ['Fill with jam and dust with sugar.', 0, ['Jam']],
          ],
          reactions: [
            ['p-george', 'George', 'like', undefined, '2025-12-20'],
            ['p-noa', 'Noa', 'like', undefined, '2025-12-20'],
          ],
        },
      ],
    ),

    recipe(
      'r-challah',
      'Challah',
      'challah',
      'bread',
      ['hallah'],
      [
        {
          id: 'v-challah',
          label: 'Plain',
          description: 'Soft, egg-glazed, no seeds.',
          servings: 12,
          kind: 'parve',
          difficulty: 'average',
          activeMin: 40,
          totalMin: 240,
          serving: 'room temperature',
          fit: [
            ['Shabbat night', 'especially suited'],
            ['Shabbat day', 'especially suited'],
          ],
          ingredients: [
            ['Flour', 1000, 'g', '8 cups flour', { flags: ['chametz'], density: 0.5 }],
            ['Yeast', 14, 'g', '2 tsp dry yeast'],
            ['Sugar', 100, 'g', '½ cup sugar', { density: 0.85 }],
            ['Eggs', 3, 'pc', '3 eggs', { allergens: ['egg'] }],
            ['Oil', 120, 'ml', '½ cup oil'],
            ['Water', 450, 'ml', '2 cups warm water'],
          ],
          steps: [
            [
              'Mix and knead into a smooth dough. Separate challah with a bracha. Let rise.',
              90,
              ['Flour', 'Yeast', 'Sugar', 'Eggs', 'Oil', 'Water'],
            ],
            ['Braid, glaze with egg and let rise again.', 40, []],
            ['Bake at 180°C until deep golden.', 35, []],
          ],
        },
      ],
    ),

    recipe(
      'r-matbucha',
      'Matbucha',
      'starter',
      'cooked salad',
      ['matbuha'],
      [
        {
          id: 'v-matbucha',
          label: 'Classic',
          description: 'Slow-cooked tomato and pepper salad. Better after a day.',
          servings: 10,
          kind: 'parve',
          activeMin: 20,
          totalMin: 90,
          serving: 'room temperature',
          easyToDeliver: true,
          pesach: true,
          fit: [
            ['Shabbat night', 'good'],
            ['Shabbat day', 'good'],
          ],
          ingredients: [
            ['Tomatoes', 1000, 'g', '1 kg tomatoes', { prep: 'diced' }],
            ['Red peppers', 3, 'pc', '3 red peppers', { prep: 'roasted and chopped' }],
            ['Garlic', 6, 'pc', '6 cloves garlic'],
            ['Olive oil', 90, 'ml', '6 tbsp olive oil'],
            ['Paprika', 10, 'g', '2 tsp sweet paprika', { skip: 'minor' }],
            ['Salt', 8, 'g', '1½ tsp salt', {}],
          ],
          steps: [
            [
              'Cook the tomatoes with the oil and garlic, uncovered, until thick.',
              60,
              ['Tomatoes', 'Olive oil', 'Garlic'],
            ],
            [
              'Add the peppers, paprika and salt and cook ten minutes more.',
              10,
              ['Red peppers', 'Paprika', 'Salt'],
            ],
          ],
        },
      ],
    ),
  ]
}

// ---- Collections ----

export const DEFAULT_COLLECTIONS: Collection[] = [
  { id: 'col-shabbat', name: 'Shabbat staples', filters: { dimension: 'Shabbat' } },
  { id: 'col-weeknight', name: 'Weeknight', filters: { dimension: 'Weekday' } },
  { id: 'col-pesach', name: 'Pesach', filters: { pesachFriendly: true } },
  { id: 'col-thanksgiving', name: 'Thanksgiving', filters: { dimension: 'Thanksgiving' } },
  { id: 'col-kids', name: 'Kids love it', filters: { dimension: 'Kids love it' } },
]

// ---- Calendar facts (stand-in for @beitecha/engine) ----

const PARASHOT: Record<string, string> = {
  '2026-10-31': 'Vayera',
  '2026-11-07': 'Chayei Sarah',
  '2026-11-14': 'Toldot',
  '2026-11-21': 'Vayetzei',
  '2026-11-28': 'Vayishlach',
  '2026-12-05': 'Vayeshev',
  '2026-12-12': 'Miketz',
  '2026-12-19': 'Vayigash',
  '2026-12-26': 'Vayechi',
  '2026-10-24': 'Lech Lecha',
  '2026-10-17': 'Noach',
  '2026-10-10': 'Bereshit',
  '2027-01-02': 'Shemot',
}

const HOLIDAYS: Record<string, CalendarHoliday[]> = {
  '2026-11-11': [{ name: 'Rosh Chodesh Kislev', type: 'rosh-chodesh' }],
  '2026-11-26': [{ name: 'Thanksgiving', type: 'civil' }],
  '2026-12-04': [{ name: 'Chanukah: first candle', type: 'jewish' }],
  '2026-12-05': [{ name: 'Chanukah: day 1', type: 'jewish' }],
  '2026-12-06': [{ name: 'Chanukah: day 2', type: 'jewish' }],
  '2026-12-07': [{ name: 'Chanukah: day 3', type: 'jewish' }],
  '2026-12-08': [{ name: 'Chanukah: day 4', type: 'jewish' }],
  '2026-12-09': [{ name: 'Chanukah: day 5', type: 'jewish' }],
  '2026-12-10': [
    { name: 'Chanukah: day 6', type: 'jewish' },
    { name: 'Rosh Chodesh Tevet', type: 'rosh-chodesh' },
  ],
  '2026-12-11': [
    { name: 'Chanukah: day 7', type: 'jewish' },
    { name: 'Rosh Chodesh Tevet', type: 'rosh-chodesh' },
  ],
  '2026-12-12': [{ name: 'Chanukah: day 8', type: 'jewish' }],
  '2026-12-25': [{ name: 'Christmas Day', type: 'civil' }],
  '2026-12-29': [{ name: 'Asara B’Tevet', type: 'jewish' }],
}

export function parashaOn(date: string): string | undefined {
  return PARASHOT[date]
}
export function holidaysOn(date: string): CalendarHoliday[] {
  return HOLIDAYS[date] ?? []
}

// ---- Initial meals ----

export function buildMeals(): Meal[] {
  const item = (
    id: string,
    course: Course,
    recipeId: string,
    versionId: string,
    title: string,
    versionLabel: string,
    kind: Kind,
    activeMin: number,
    servings = 10,
    scale = 1,
  ) => ({
    id,
    course,
    recipeId,
    versionId,
    title,
    versionLabel,
    kind,
    activeMin,
    servings,
    scale,
    adjustments: [],
  })
  return [
    {
      id: 'm-thu',
      date: '2026-11-12',
      name: 'Thursday supper',
      kind: 'dairy',
      status: 'accepted',
      time: '18:30',
      notComing: [],
      guestIds: ['p-savta'],
      items: [
        item(
          'mi-thu-1',
          'main',
          'r-pasta-bake',
          'v-pasta-bake',
          'Pasta bake',
          'Classic',
          'dairy',
          20,
          8,
        ),
        item(
          'mi-thu-2',
          'salad',
          'r-israeli-salad',
          'v-israeli-salad',
          'Israeli salad',
          'Classic',
          'parve',
          15,
          6,
        ),
      ],
    },
    {
      id: 'm-leil',
      date: '2026-11-13',
      name: 'Leil Shabbat',
      kind: 'meat',
      status: 'accepted',
      time: '17:30',
      notComing: [],
      guestIds: ['p-savta', 'p-avi'],
      items: [
        item('mi-leil-1', 'challah', 'r-challah', 'v-challah', 'Challah', 'Plain', 'parve', 40, 12),
        item(
          'mi-leil-2',
          'soup',
          'r-chicken-soup',
          'v-soup',
          'Chicken soup',
          'Friday-night',
          'meat',
          25,
          10,
        ),
        item(
          'mi-leil-3',
          'main',
          'r-silan-chicken',
          'v-silan',
          'Silan chicken',
          'Classic',
          'meat',
          20,
          8,
          1.25,
        ),
        item(
          'mi-leil-4',
          'side',
          'r-potato-kugel',
          'v-potato-kugel',
          'Potato kugel',
          'Classic',
          'parve',
          25,
          10,
        ),
        item(
          'mi-leil-5',
          'salad',
          'r-israeli-salad',
          'v-israeli-salad',
          'Israeli salad',
          'Classic',
          'parve',
          15,
          6,
        ),
        item(
          'mi-leil-6',
          'dessert',
          'r-brownies',
          'v-brownies-cakey',
          'Brownies',
          'Cakey (parve)',
          'parve',
          15,
          16,
        ),
      ],
    },
    {
      id: 'm-lunch',
      date: '2026-11-14',
      name: 'Shabbat lunch',
      kind: 'meat',
      status: 'draft',
      time: '12:30',
      notComing: [],
      guestIds: ['p-savta'],
      items: [
        item(
          'mi-lunch-1',
          'main',
          'r-cholent',
          'v-cholent',
          'Cholent',
          'Overnight',
          'meat',
          30,
          12,
        ),
        item(
          'mi-lunch-2',
          'side',
          'r-sweet-kugel',
          'v-sweet-kugel',
          'Sweet potato kugel',
          'Classic',
          'parve',
          20,
          10,
        ),
      ],
    },
    {
      id: 'm-thanks',
      date: '2026-11-26',
      name: 'Thanksgiving dinner',
      kind: 'meat',
      status: 'draft',
      time: '17:00',
      notComing: [],
      guestIds: ['p-savta', 'p-avi'],
      items: [
        item(
          'mi-thanks-1',
          'main',
          'r-turkey',
          'v-turkey',
          'Roast turkey',
          'Herb butter-free',
          'meat',
          30,
          12,
        ),
        item(
          'mi-thanks-2',
          'salad',
          'r-coleslaw',
          'v-coleslaw',
          'Coleslaw',
          'Classic',
          'parve',
          20,
          10,
        ),
      ],
    },
  ]
}

export interface PantryRow {
  id: Id
  name: string
  amount: number
  unit: 'g' | 'ml' | 'pc'
  /** Use-by date. */
  expires: string
  heldFor?: string
}

/** The Levins' use-soon list: perishables to use up, not a cupboard inventory. */
export function buildPantry(): PantryRow[] {
  return [
    { id: 'pa-1', name: 'Pargiyot', amount: 1200, unit: 'g', expires: '2026-11-13' },
    { id: 'pa-2', name: 'Sweet potatoes', amount: 3, unit: 'pc', expires: '2026-11-16' },
    { id: 'pa-3', name: 'Carrots', amount: 4, unit: 'pc', expires: '2026-11-14' },
    { id: 'pa-5', name: 'Eggs', amount: 8, unit: 'pc', expires: '2026-11-20' },
    { id: 'pa-9', name: 'Margarine', amount: 250, unit: 'g', expires: '2026-12-15' },
    { id: 'pa-14', name: 'Sour cream', amount: 150, unit: 'ml', expires: '2026-11-06' },
    { id: 'pa-16', name: 'Fresh dill', amount: 1, unit: 'pc', expires: '2026-11-09' },
  ]
}
