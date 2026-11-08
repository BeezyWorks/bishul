# Plan redesign: shared contract

The rules are in the design notes and the mockup (`plan-concepts.html`); this file is what the shared layer gives the
four UI builders. Everything below exists and is tested. Do not rebuild any of it: no calendar logic, grouping, naming,
ordering, headcounts or constraint filtering in screens. The server sends finished shapes.

## 1. Routes

| URL | Screen | Notes |
| --- | --- | --- |
| `/` | Plan week (the Plan tab) | `?week=YYYY-MM-DD` any date in the week (default: today in the household's zone, from `useToday()`); `?view=month` for the Month toggle. |
| `/hosted/[key]` | Hosted page | `key` is `MealCard.hostedKey` or `RunSummary.key`. |
| `/print/[key]` | Fridge sheet | Same `key`. Put it at `src/app/print/[key].tsx` (outside `(app)` so it has no nav chrome). Reads `useHosted(key)`. |
| `/meal/[id]` | The wizard (existing) | Plans ONE meal. Optional `?step=guests\|menu\|check` (default `guests`). |

Keys: `run-YYYY-MM-DD` (date of the run's first holy day) or `meal-<mealId>` (a single hosted weekday meal). Opening
`meal-<id>` for a meal that belongs to a run returns the run's page, and `HostedPage.key` is then the `run-` key (replace
the URL with it). Helpers in `src/lib/plan.ts`: `planHref({ week?, view? })`, `hostedHref(key)`, `printHref(key)`,
`wizardHref(mealId, step?)`, `hostedKeyFor(meal)`, `parseHostedKey(key)`. Hrefs are plain strings: pass to
`Button href`/`ListRow href` or `router.push(href as Href)` (typed routes are on, so cast).

Never build the key yourself: use `meal.hostedKey` (every `MealCard` carries it, virtual or not).

## 2. Concepts the screens must respect

- **Holy day**: a Shabbat or Yom Tov day. It starts the evening before: Leil Shabbat belongs to Shabbat, Seder I to Pesach I.
  Labels come from the server (`Pesach I`, `Pesach II`, `Shabbat`, `Shvi'i shel Pesach`...). Yom Kippur is not a holy day (no meals).
- **Run**: consecutive holy days (Pesach I, Pesach II, Shabbat). A weekday between two holy days splits them. Israel vs diaspora is already applied.
- **Meal placement**: `MealCard.runKey != null` means the meal is in a run: show it in the run, never in a weekday cell. `WeekDay.meals` contains only weekday meals.
- **Eve days** (Friday, Erev Yom Tov): `WeekDay.eve` is set. Show the day's daytime cells as usual, but in place of a dinner slot show the link `Plan {eve.mealName} →`. If `eve.meal` is set open `hostedHref(eve.meal.hostedKey)`; else call `useEnsureRunMeal()` with `{ runKey: eve.runKey, holyDate: eve.holyDate, part: 'night' }`, then go to `wizardHref(mealId)`. Do not show a "+ Dinner" slot on an eve day.
- **Holy-day dates** (`WeekDay.holyDay != null`): the run tile is the content; there are no weekday cells for that date.
- **Virtual meals**: each holy day has default meals (night: Seder I/II, Leil Yom Tov, Leil Shabbat, slot `dinner`; day: Yom Tov day / Shabbat day, slot `lunch`). Ones not created yet come back as `MealCard` with `id: null`, `virtual: true`, `create: { date, slot, name }`, `planned: false`. To open one, call `useEnsureRunMeal()` (`part` is on the card) and use the returned `mealId`. A default meal the user deleted does not come back as a placeholder (use "+ Another meal" or the eve link to recreate it).
- **Hosted**: `MealCard.hosted` is the single truth (flag set, or in a run, or has a guest household). Shabbat/YT meals are always hosted. Inviting a guest household sets the flag and renames the meal while its name is automatic; removing every guest keeps it hosted. Everyday meal = not hosted: it lives in the day's dinner slot and never opens a page (`hostedKey` still works if you want it).
- **Names**: automatic names (Jewish holiday incl. Rosh Chodesh/Chanuka/Purim, then named civil holiday e.g. Thanksgiving, else `Tuesday dinner`; an unhosted meal is just `Dinner`/slot label) are chosen by the server. `nameEdited` tells you the user typed it. Renaming goes through `useUpdatePlanMeal`. **"Public holiday" (Christmas, Good Friday...) never appears**: the server removes it from `WeekDay.holidays` and from names; do not add any holiday text of your own.
- **Slots** (`DaySlot`): `breakfast, kiddush, brunch, lunch, seudah_shlishit, dinner, oneg`. They only order meals; the server returns meals already ordered (weekday: breakfast first; holy day: evening first). `PICKABLE_SLOTS` (in `src/lib/plan.ts`) is what the "Kind" picker offers; Seudah shlishit is the opt-in button on the hosted page header (`createPlanMeal({ date, slot: 'seudah_shlishit' })` on the Shabbat date).
- **Tile summary**: `MealCard.summary: string[]` is the main course's dishes in menu order (else first course with dishes). Empty means show "Not planned". Join with `, ` and truncate with `…` in the UI.
- **Headcount**: `headcount` counts present people only (absent members excluded). `headcountText` is `2 adults, 1 child`; `awayText` is `Jochanan away`.
- **Problems**: `MealCard.problems` = `{ allergies, gaps, other, total }` for tile badges ("1 allergy", "1 gap"). Details are on `HostedMeal.problemDetails.problems[]` (each names the dish via `dishTitle` + `itemIds` and the person via `personName`). `kind`: `allergy | exclusion | rule | meal | gap`. A `gap` has no dish (`itemIds` are the mains); offer "Find a {…} main" (open `RecipePicker` with `course="main"`). `aiNotes` are "passes only on AI-filled ingredient data, check the label". Always show the disclaimer (`HostedPage.disclaimer`, or `<Disclaimer />`) near allergy results.
- **Food notes** for the print sheet: `HostedMeal.foodNotes` (`"peanut-free meal"`). Never print names (`personName`, household names, `awayText`).
- **Time**: all dates are the household's zone. Use `useToday()` or `PlanView.today`/`WeekDay.isToday`, never `new Date()`.
- **Courses** in `HostedMeal.menu[]` are always `starter`, `main`, `dessert` (present even when empty) plus any custom course, in serving order; dishes in menu order. Recipe courses are folded in (soup/salad → starter, side → main). Add to a course by passing that course string.
- **Copy**: Israeli transliteration ("Shabbat", "chalav Yisrael"). Do not write "Shabbos" in UI text.

## 3. Data returned (client types in `src/lib/api/types.ts`, section "Plan tab")

`PlanView` (week/month): `{ today, from, to, location, parasha, days: WeekDay[], runs: RunSummary[] }`.
- `WeekDay`: `date, weekday (0=Sun), isToday, hebrew, parasha, holidays: {name, kind:'jewish'|'civil'}[], isShabbat, isYomTov, isCholHamoed, isErevShabbat, isErevYomTov, candleLighting: {minutes, text:'4:21'}|null, havdalah, holyDay: {runKey,label}|null, eve: {runKey, holyDate, mealName, holyDayLabel, meal: MealCard|null}|null, meals: MealCard[]`.
- `RunSummary`: `key, title ('Pesach · first days', 'Shabbat Toldot'), from, to, startsOn, holyDays: RunHolyDay[], mealCount, toPlan, problems:{allergies,gaps,total}`. `RunHolyDay`: `date, eveDate, label, isShabbat, isYomTov, isCholHamoed, meals: MealCard[]`. A run can start before or extend past the week you asked for (clip it by `holyDays[].date`, columns are the holy-day dates; the first night is on `eveDate`). `toPlan` counts virtual meals. Tile line "6 meals · 3 to plan" = `mealCount`, `toPlan`.
- `MealCard`: see the type (id, virtual, create, date, slot, slotLabel, name, nameEdited, time (minutes), timeText ("18:30"), status, kind, hosted, runKey, hostedKey, holyDate, part, summary, itemCount, planned, headcount, headcountText, awayText, guestHouseholds, hasGuests, problems).

`HostedPage` (`/hosted/[key]`, also the print view): `{ key, type:'run'|'meal', title, from, to, startsOn, today, location, paper:'letter'|'a4', days: HostedHolyDay[], totals:{meals,toPlan,withGuests,withProblems}, fixes, disclaimer }`.
- `HostedHolyDay`: `{ date, label, isShabbat, isYomTov, meals: HostedMeal[] }` (label is `''` for a single weekday meal; do not draw a holy-day heading then).
- `HostedMeal extends MealCard`: `menu: HostedCourse[]`, `households: GuestHousehold[]`, `problemDetails`, `foodNotes`, `disclaimer`. Virtual meals are included with an empty menu and `households: [host]` (so "Us" shows beside it); folded rows are meals with `planned === false`.
- `HostedCourse`: `{ course, label, items: HostedMenuItem[] }`. `HostedMenuItem`: `itemId, position, course, title, recipeId, versionId, versionTitle, kashrut, noRecipe, broughtBy, problems: MealProblem[]` (link a dish to `/recipes/${recipeId}` when `recipeId` is set; `problems` is non-empty for the flagged dish: color it, offer "Replace dish").
- `GuestHousehold`: `{ householdId, name, isHost, members: GuestMember[], counts, countsText, awayText, constraints: ConstraintLabel[], removable }`. `GuestMember`: `{ personId, name, isChild, present, constraints }`. `ConstraintLabel`: `{ text, strict, strictAllergy }`. Constraints are those active on that meal's day.
- `fixes`: every problem on the page with `mealId, mealName, dayLabel` for the "N things to fix" box. Filter bar (all / needs planning / has guests / has problems) is computed from card fields: `!planned`, `hasGuests`, `problems.total > 0`.
- Filters never hide a family-only planned meal that is unplanned... (only `planned === false` meals fold; planned family-only meals stay open).

`MealRecipeSearch`: `{ mealId, attendees, fits: MealRecipeHit[], excluded: MealRecipeHit[], total, disclaimer }`; `MealRecipeHit`: `recipeId, versionId, title, versionTitle, course, kashrut, note ('pareve · fits everyone'), why: string[], failsFor: {personId, personName}[], eatAround, aiWarnings`.

## 4. Client API (`src/lib/api/hooks.ts`, backed by `api.*` in `client.ts`)

Queries:
```ts
useWeek(date?: ISODate)                    // PlanView, Sunday-to-Saturday week containing date (default today)
usePlan(from: ISODate, to: ISODate, enabled?: boolean)   // PlanView for up to 62 days (month toggle)
useHosted(key: string)                     // HostedPage
useHostedMeal(mealId: Id | undefined)      // HostedMeal (one row)
useMealRecipes(mealId, { q?, course?, limit? }, enabled?)   // MealRecipeSearch (debounce q yourself, or use RecipePicker)
useGuestPool(): PickableHousehold[]        // your household + contacts, for HouseholdSearch
useHousehold(), useContacts(), useToday()  // existing
```
Mutations (all via `useApiMutation`, so `.mutateAsync(arg)` resolves with the server's result and the right queries are invalidated):
```ts
useCreatePlanMeal()         (input: NewMealInput) => HostedMeal       // {date, name?, slot?, time? "18:30", hosted?, householdIds?}
useEnsureRunMeal()          ({runKey, holyDate, part:'night'|'day'}) => {mealId, created, hostedKey}
useUpdatePlanMeal()         ({mealId, patch: MealPatch}) => HostedMeal // {name?, time? ("" clears), slot?, date?, hosted?}
useDeletePlanMeal()         (mealId) => void                          // soft delete; confirm on the page first
useAddMealHousehold()       ({mealId, householdId}) => HostedMeal
useRemoveMealHousehold()    ({mealId, householdId}) => HostedMeal
useSetMealPerson()          ({mealId, personId, present}) => HostedMeal   // a member chip
useAddMealDish()            ({mealId, dish: AddDishInput}) => HostedMeal  // {course, versionId? | description?, kashrut?, broughtBy?, servings?}
useRemoveMealDish()         ({mealId, itemId}) => HostedMeal
useMoveMealDish()           ({mealId, itemId, course, beforeItemId?}) => HostedMeal
useCreateContactHousehold() (name) => Household        // empty contact household; add members with api.addPerson({contactHouseholdId})
```
Query keys: `['plan', 'week'|'range', ...]`, `['hosted', key]`, `['hostedMeal', id]`, `['mealRecipes', ...]`. The existing wizard hooks (`useMeal`, `useSuggestions`, `stale.*`) are untouched; the Plan mutations also invalidate `['meal']`, `['calendar']`, `['upcoming']` (and shopping/prep/pantry for menu and guest changes). Existing `api.createMeal/setAttendees/addMenuItem` keep working.

Errors: `ApiError` from `src/lib/api/http.ts` (`.status`, `.code`, `.message`). 404 on a key or meal = it was deleted. A meal whose date has passed is settled: edits give 409.

Demo build (`EXPO_PUBLIC_USE_MOCK=1`): `src/lib/api/mock-plan.ts` implements the same calls in memory with two Shabbatot (Toldot, Vayetzei) and Pesach 2027 for New York. It has no constraint engine (no problems; recipe search returns nothing). Use the real worker for anything about allergies.

## 5. Components (`src/components`, exported from `index.ts`)

```tsx
<HouseholdGuests
  household={h /* GuestHousehold */}
  defaultOpen?={false}
  onTogglePerson={(personId, present) => ...}      // chip tapped; ticked = coming
  onRemove?={() => ...}                             // shows "Remove" only if household.removable
  disabled?={mutation.isPending}
/>
```
One household row: name, `2 adults, 1 child · Jochanan away`, combined constraint text (strict allergies in danger color), a `›`/`▾` toggle that reveals member chips. Chips are plain `checkbox` toggles (✓ when coming); a member's constraint is colored text inside the chip (`tree nuts · strict`), never a badge. No section headers.

```tsx
<HouseholdSearch
  households={useGuestPool()}                       // PickableHousehold[] {id, name, members:[{id,name,isChild,constraints}]}
  excludeIds?={ids already on the list}
  onAdd={(householdId) => ...}                      // the "Add" button on a match
  onCreate?={(name) => ...}                         // last row `+ New household "Ro…"`; omit to hide
  placeholder?="Add a household"  busy?  limit?={6}
/>
```
Matches household name or any member name (case/diacritic-insensitive; shows `Rochel Bernstein matches`) in a dropdown under the box. Clears after Add/create. Also exported: `matchHouseholds(households, query)`, `ConstraintText`.
Creating: `const h = await createHousehold.mutateAsync(name)` then add members with `api.addPerson`, then `onAdd(h.id)`. (A household with no members yet adds fine; the host adds people from the People tab.)

```tsx
<RecipePicker
  mealId={id}                                       // its attendees decide what fits
  course?="main"                                    // only that course (an empty search with a course lists the course)
  initialQuery?=""                                  // e.g. "vegetarian" for "Find a vegetarian main"
  onPick={(hit: MealRecipeHit) => addDish.mutate({ mealId, dish: { course, versionId: hit.versionId } })}
  onAddWithoutRecipe={(text) => addDish.mutate({ mealId, dish: { course, description: text } })}
  onClose?  autoFocus?  placeholder?
/>
```
Fits first (tappable, `pareve · fits everyone`), then recipes that do not fit, greyed with why (`meat · not vegetarian`), not tappable (an allergen is never overridden; a dish already on a menu is flagged by the page). Last row: `Add “veg…” as a dish without a recipe`. Shows `<Disclaimer />` when something is excluded. It is a plain View: place it inline where the course's "+ Add" was.

Use existing `Pill`, `Badge`, `Button`, `Card`, `Text`, `Disclaimer`, `Loading`, `Empty` for the rest; colors only from `src/theme/tokens.ts`.

## 6. REST endpoints (session `/api/*` and API-key `/v1/*`, same operations)

Reads: `GET /week?date=` · `GET /plan?from=&to=` · `GET /hosted/:key` · `GET /meals/:id/hosted` · `GET /meals/:id/recipes?q=&course=&limit=`.
Writes: `POST /meals` (now `name?`, `slot?`, `hosted?`, `householdIds?` besides date/time/kind/personIds/items) · `PATCH /meals/:id` (`name, date, slot, time, kind, hosted` plus the existing people/items fields) · `DELETE /meals/:id` · `POST /hosted/ensure-meal {runKey, holyDate, part}` · `POST /meals/:id/households {householdId}` · `DELETE /meals/:id/households/:householdId` · `PUT /meals/:id/people/:personId {present}` · `POST /meals/:id/dishes {course, versionId|description, ...}` · `DELETE /meals/:id/dishes/:itemId` · `POST /meals/:id/dishes/:itemId/move {course, beforeItemId?}` · `POST /contacts {name}`.
MCP (same services): `get_week`, `get_hosted`, `manage_meal_guests`, `manage_meal_dishes`, `search_recipes_for_meal`; `plan_meal`/`update_meal` take the new fields.

## 7. Data model (worker/db/schema.ts, migration `0008_worried_wasp.sql`)

`meals`: `slot` (default `dinner`; existing meals backfilled from their time), `hosted` (bool), `name_edited` (bool; existing meals are marked edited). `meals.kind` is unchanged: it is meat/dairy/parve, not the slot. New table `meal_households (meal_id, household_id)`: guest households on a meal (all members away still leaves the household listed); your own household is implicit. Who is coming stays in `meal_attendees` (a row = coming; removing a row = away, soft-deleted so toggling back revives it). `meal_items.course` carries the menu course. All rows keep ULIDs, `updated_at`, soft delete.

## 8. Core helpers (`@bishul/core`, `packages/core/src/planning/hosting.ts`, `menu.ts`; tested)

Worker-side only (the app does not import `@bishul/core`; the app-side mirrors are in `src/lib/plan.ts`).
`hostedRuns(from, to, loc)`, `runStartingOn(date, loc)`, `holyDateOfMeal({date, slot}, holyDates)`, `holyDatesOf(runs)`, `eveLinkOn(date, runs)`, `autoMealName(day, slot)`, `namingJewishHoliday`, `displayHolidays`, `visibleCivilHolidays`, `nameToStore`, `compareMealsInDay`, `compareMealsInHolyDay`, `DAY_SLOTS`, `SLOT_LABELS`, `slotFromTime`, `runKey/mealKey/parseHostedKey/hostedKeyFor`; `groupMenu`, `groupMenuWithDefaults`, `menuSummary`, `courseGroup`, `headcount`, `sumHeadcounts`, `countsText`, `awayText`, `constraintLabels`, `mealProblems` (allergy names the dish; gap = a guest with no main they can eat), `foodNotes`. The calendar comes from the engine through `calendarDays`; nothing here rebuilds it.

## 9. Things to know

- Mutations that return `HostedMeal` are enough to update a row; still let the invalidation refresh the page (`useHosted`) so totals, `fixes` and run tiles stay right.
- A strict **diet** (vegetarian) does not produce an "exclusion" per dish; it shows only as a `gap` when no main works for that guest. Allergy and dish-level kashrut exclusions do show, naming the dish.
- `time` in requests is 24-hour `HH:MM`; responses give minutes (`time`) and `HH:MM` (`timeText`). Use `timeLabel()` from `src/lib/plan.ts` for `6:30 pm`.
- Print: the food note rule and "no names" rule are enforced by what you render: use `foodNotes`, `countsText`, `timeText`, dish titles, course labels only. Paper size: `HostedPage.paper`.
- The wizard step 1 uses `HouseholdSearch` + one `HouseholdGuests` per `HostedMeal.households` (the host household first, no Remove). Step 2 uses `RecipePicker`; step 3 renders `problemDetails` and the disclaimer.
- `worker/test/kitchen.test.ts` was date-dependent (the eggs expired before the Friday it planned for); it now plans for two days from today.
