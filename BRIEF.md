# Tavshil — Project Brief (draft 3)

`tavshil.baderech.app` — recipe, household and meal-planning app for kosher families.
The core job: **"plan Shabbat for these guests."** Everything else serves that.
Primary interface is the user's own AI, through the MCP server or a skill + REST API. The web UI covers browsing, editing, the menu, the shopping list and cooking mode. Users are expected to create and edit data mostly through their AI, not forms.

## 1. Principles
- **AI for judgment, code for facts.** Constraint matching, scaling, unit conversion, calendar logic and shopping-list math are deterministic server code. The AI chooses dishes, balances menus, structures pasted recipes and handles fuzzy requests.
- **One service layer** behind web UI, REST (API keys) and MCP. No feature exists in only one of them.
- **Households are the unit.** You plan for households, but constraints live on individuals.
- **It's on the host.** Tavshil helps you avoid serving the wrong thing; it is not a guarantee. A disclaimer says so wherever allergy results are shown.
- **Own identity.** Tavshil does not use `@beezyworks/design`. It keeps the other conventions: pnpm, conventional commits, semantic-release, web-first on Cloudflare, EAS later.
- **Sync-friendly from day one.** Mobile apps will hold a local copy of the database for offline use. Use client-generatable IDs (ULID/UUID), `updated_at` on every row, soft deletes and an edit log, so sync can be added without a schema rewrite.

## 2. Stack
| Layer | Choice | Notes |
|---|---|---|
| Client | Expo / React Native Web, Expo Router | Web first, same code to iOS/Android later. Web caches opened recipes so a reload in the kitchen doesn't need the network. |
| API | Cloudflare Workers + Hono | REST + MCP + OpenAPI |
| DB | D1 (SQLite) + Drizzle | See §11 |
| Files | none | No photos (§6). |
| Auth | BeezyWorks Accounts (`auth.baderech.app`) | The shared Better Auth server. Already has `@better-auth/mcp` for MCP OAuth (OAuth 2.1 + dynamic client registration). Tavshil adds per-user API keys. |
| Calendar | `@beitecha/engine` (on `@hebcal/core`) | Reuse the shared engine for location, Israel vs diaspora, holidays, zmanim and occasions. Don't rebuild it. |
| Search | D1 FTS5 | Recipe text search, with transliteration aliases (§10). |

## 3. People model
- **User**: a login account (from BeezyWorks Accounts).
- **Person**: a profile with constraints. Kids and other non-users are plain Persons. You have a Person for yourself too, used for your own planning as well as for sharing.
- **Household**: a set of Persons with an **owner** (the household manager). **Your family is your household.** Every user always has a household; a new user starts as a household of one.
- **Ownership**:
  - **Recipes belong to the user who created them.** The household has full read/write access to every member's recipes.
  - **Everything else belongs to the household owner**: the use-soon list, equipment, plans, contacts and notes. Members (a spouse) get full read/write access to all of it, notes included. Ownership is transferable.
- **Leaving a household**: the leaver gets a new household of their own and takes **their own recipes**. Recipes other members wrote stay behind; to keep one, the leaver asks its author to share it (§10). The use-soon list, equipment, plans and contacts stay with the household.
- **Location**: each household has a location, used by the calendar engine (Israel vs diaspora, zmanim, holiday dates).

### Contacts (ghosts)
- **Everyone in your circle is a ghost.** A contact is a household *you* create, with Persons you fill in. It is visible only to your household and is never shared or discoverable.
- **Linking**: you can link a ghost Person to a real user's profile. You choose to **merge** (keep what you entered, add theirs) or **overwrite** (replace with theirs). After that it is a **live link**: their self-entered constraints flow through as they change them.
- **Your additions stay yours.** Anything you add on top — notes, extra constraints, likes/dislikes (§5) — is a private layer on your side. The real person never sees what you wrote about them. A ghost cannot be "claimed"; only you can link it.
- **When a linked user deletes their account**, the link breaks and everything they entered about themselves is erased from your contact (required under GDPR-style erasure rules). Your own layer — notes, constraints you entered, likes/dislikes, serving history — stays, and the contact goes back to being a plain ghost. BeezyWorks Accounts must notify Tavshil of account deletions so this runs.
- **Profiles are shared by link** (unlisted; no search or directory). There is no private setting: a profile exists to be shared. Each Person, kids included, is shared individually.
- **Invites**: inviting a member into your own household is in scope. When you invite guests to a meal, you can drop individual Persons who won't be there (§9).

## 4. Constraints
`Constraint { person, tag, kind, severity, active_when, note, source }`

- **kind**: `medical` (allergy, intolerance), `religious` (kashrut, minhag), `preference` (dislikes an ingredient). Kind controls how it's shown: medical and religious appear as warnings, preferences as hints.
- **severity**: `strict` (can't be at the meal) or `flexible` (can eat around it / skip it). Applies to every kind.
- **active_when**: `always`, a named period (Pesach, Aseret Yemei Teshuva, the Nine Days…), or a custom date range, resolved by the calendar engine for the household's location.
- **source**: who entered it (the person themselves, the host, or the AI). See §6 for AI-filled ingredient data.
- **Likes and dislikes of dishes are not constraints.** They go on versions (§5).

### Tag types
- **allergen** (peanut, sesame…)
- **ingredient** (cilantro)
- **diet** (vegetarian, vegan, pescatarian)
- **Kashrut — dish-level**: checked against a dish's ingredients and can exclude it. Kitniyot (`active_when: Pesach`), gebrokts (`active_when: Pesach`), and the combination and equipment rules below.
- **Kashrut — sourcing standards**: chalav Yisrael, pat Yisrael (e.g. `active_when: Aseret Yemei Teshuva`), yashan, glatt. These **never exclude a dish**. They add a sourcing note to the meal and the shopping list ("buy chalav Yisrael butter"), and **only when a guest's standard is stricter than the host household's own Persons**. If you keep chalav Yisrael yourself, nothing is noted.
- Accepted hechsherim per family: **deferred**.

### Meal-level kashrut
- A meal's meat / dairy / parve status is derived from its items, including dishes guests bring (§9). Meat and dairy items in the same meal are a hard error.
- **Equipment rules** are per-Person opt-ins, because practice varies. Example: "no parve dish cooked in a dairy pot at a meat meal." A version records the designation of the equipment it uses, so the check is deterministic. Waiting times between meals are out of scope.
- **Combination rules** (also per-Person opt-ins):
  - **No fish and dairy**: any dish combining fish and dairy is excluded for that guest, and the meal is flagged so the planner and AI keep fish and dairy dishes out of the same meal.
  - The same mechanism covers other minhagim, such as no fish with meat.

### How it's evaluated
Given a set of attending Persons, a date and the host household, the server returns a **dining brief**:
- the active constraints, after resolving seasons for the household's location;
- **hard exclusions** (strict constraints that rule out a dish);
- **eat-around notes** (flexible constraints), with a per-dish verdict from the recipe's skip-impact data (§6);
- combination-rule and equipment-rule violations at dish and meal level;
- sourcing notes for guests stricter than the host;
- likes, dislikes and recent serving history for the attendees (§5);
- a flag wherever an allergy passes only because of **AI-filled** ingredient data, plus the disclaimer.

## 5. Likes, dislikes and serving history
- A **reaction** is `{ person, version, like | dislike, note, recorded_by }`. It lives on the version, not the ingredient. Usually the host records it through their AI ("George loved the kugel").
- **Serving history**: when a menu is accepted and its date passes, each version is logged as served to each attending Person.
- **Recommendation weighting**:
  - a **like** boosts the version for that person, but the boost fades if they were served it recently, so George doesn't get the same kugel every week;
  - a **dislike** pushes the version down for that person for good. It is not hidden.
- Reactions and serving history are the host's data. They are part of your private layer on a contact and survive unlinking or account deletion (§3).

## 6. Recipes
- **Recipe**: the dish concept ("Brownies"). It owns many **Versions** (fudgy, cakey, parve, pesach, 2× scaled). A version can record its parent.
- **Ownership**: a recipe belongs to the user who created it. All members of their household can read and edit it (§3).
- **Versions are mutable.** Plans reference versions, so editing a version changes every plan using it. Every edit is kept in an **edit history**; concurrent edits are last-write-wins.
- **Visibility**: private to the household. Sharing is by unlisted link only (§10).
- **Lineage**: every version has a `lineage_id` and a content hash. Copies made by sharing or forking keep the lineage, so duplicates can be surfaced when merging recipe sets (merge, keep both, or skip).
- **No photos.** Recipe text isn't copyrightable but photos are, and we don't want to store them.
- **Import**: the user tells their AI "import this" and pastes whatever they have — text, a transcription, a URL's content. The import tool is forgiving and the AI structures it.

**Version fields**
- title, description, **source links** (blogs, YouTube…: link out only)
- servings (base yield). Required: a recipe or version cannot be created without it.
- **course**: main, side, dessert…
- **form**: salad, soup, kugel…
- **meat / dairy / parve**
- **difficulty**: easy / average / a pain
- **active time and total time**
- **pre-prep steps** with lead time ("marinate 12h")
- **serving style**: hot, room temperature, cold; holds on a blech
- **easy to deliver**: yes/no
- **equipment**: each item with its designation (dairy pot, pesach…)
- **flags**: gebrokts, kitniyot, etc. Derived from ingredients where possible; can be set by hand. "Spicy" and "kid friendly" are tags, not flags: a `spicy` tag flags the dish for guests who can't eat spicy food, a `kid friendly` tag favours it when kids are coming.
- **occasion fit**: arbitrary dimensions (§6.1)
- **tags**: free-form keywords ("spicy", "italian", "from Savta"), up to 12 per version. Stored as typed and matched case-, hyphen- and spelling-insensitively; no household vocabulary, so a shared recipe carries its tags. Searchable as plain text and filterable; the AI reuses tags already in use (`list_tags`) but is not required to. Descriptive only: never read by allergy or kashrut checks, and a "spicy" tag does not replace the spicy flag that warns guests who can't eat spicy food.
- **cost**: optional `$` / `$$` / `$$$`, filterable. No prices.
- **nutrition**: optional; the AI can fill it in on request. Always stored per serving (whole-recipe figures are divided by servings when saved; editing only the servings re-splits them so the dish's total stays, while a variation that scales the ingredients keeps per-serving), with a `source` of `ai` or `user`. Searchable by goal (high protein 20 g+, high fiber 5 g+, low calorie, low carb, low sodium, low sugar) or by limits, and totalled per person for a meal. Recipes without figures are left out of a nutrition search and counted.

**Ingredient lines**
- quantity (canonical metric amount plus the original as written), unit, ingredient, prep note
- **skip impact**: `none` / `minor` / `ruins`
- optional substitutions

### 6.1 Arbitrary dimensions
- Built-in: Shabbat night, Shabbat day, weekday, Purim, Chanukah, Shavuot, Pesach, and so on, plus civil holidays like Thanksgiving.
- **Recipe library**: full-text search plus filters (course, meat/dairy/parve, "safe for" chosen people, Pesach-friendly, time, difficulty, cost, not served recently). **Collections** are saved filters, usually on a dimension ("Shabbat staples", "Thanksgiving").
- Users can add any dimension ("good for sick friends", "kids love it", "make-ahead for sheva brachot").
- Each is `{dimension, fit}` with fit `fine` / `good` / `especially suited`. Searchable by the AI and in the UI.

## 7. Ingredients, units and conversion
- A shared **ingredient catalog**: name and aliases (including other transliterations); category (meat/dairy/parve/fish, allergens); flags (chametz, kitniyot, animal-derived…); density (g/ml).
- **No up-front seed in v1.** Records are created when a user's AI adds a recipe with an unknown ingredient, and the AI fills in category, flags and density. A curated seed set (AI-generated, reviewed) is on the roadmap.
- **AI-filled data is labelled.** Allergen and kashrut flags record their source (`seed`, `ai`, `user`). A user can correct any of them. The dining brief calls out allergies that pass only on AI-filled data (§4).
- **Conversions are deterministic:** weight↔weight and volume↔volume are pure math; weight↔volume uses density (flour about 120 g/cup).
- **User preference**: a global system (US/metric) plus per-category overrides (flour and sugar in grams, liquids in cups). Cooking mode has a quick toggle.
- Displayed amounts round to sensible kitchen fractions or whole grams. Converted values are marked approximate.

## 8. Kitchen and use soon
Both belong to the household (owned by the owner, used by all members).
- **Equipment**: item, count, designation (meat / dairy / parve / pesach).
- **Equipment checks**: warn when dishes need more of a designated item than you own, or at the same time (only one dairy pot on Pesach).
- **Use soon**: not an inventory of what's in the cupboard. It tracks perishables to **use up before they go bad**: the pargiyot in the fridge, half a bag of spinach, the sour cream. Shelf-stable staples (sugar, salt, oil, rice) are not tracked.
  - Each item has a **use-by date** (required), and optionally a quantity ("some" is fine). The list is sorted soonest first.
  - Expired items are never suggested; the list shows them so they can be cleared. Items expiring soon are boosted ("use the pargiyot by Tuesday"). The AI is told both.
  - **Accepted menus hold items aside**, so the same leftover isn't promised to two meals. The hold is recalculated live as plans and versions change. Items are used up when the meal date passes, and removed once nothing is left.
  - Only a recorded quantity comes off the shopping list.
- **Chametz**: chametz items need no use-by date of their own; their *effective expiry* is the pre-Pesach cutoff (default erev Pesach morning, configurable; computed by the calendar engine). Adding the pasta and flour before Pesach makes this list the "use it up before Pesach" list, and the planner prioritizes them. No tracking of selling, bedikah or rooms. A recipe's Pesach compatibility is computed from its ingredients and shown alongside any explicit Pesach version.

## 9. Planning, shopping, cooking
- **Plan**: a date range. **Meal**: date, slot, occasion, attending Persons (defaults to whole households; individuals can be dropped).
- **Meal items**:
  - a recipe version, a scale factor and a serving count; or
  - a **brought dish**: "Ruth is bringing potatoes". Free text plus who's bringing it, a course and meat/dairy/parve status. It counts toward menu balance and meal-level kashrut, but stays out of the shopping list, use-soon holds and cooking. The AI adds these from plain sentences. In-app coordination with the bringer comes later.
- **The core flow is: when → who → dishes → review.**
  1. **When**: start from what's coming up or pick days on the calendar. Meals are added to any day as needed; nothing is pre-created (no automatic seudah shlishit).
  2. **Who's coming**: the household is in by default; add contacts; mark individuals as not coming. As guests are added, the constraints they bring and the meal type (meat/dairy/parve) are shown live.
  3. **Dishes**: the menu starts empty. "Add item" asks what it is (main, side, salad, soup, dessert…) and then opens a picker that shows only dishes that work for the people coming and the meal type, ranked by likes, using up what expires soon and how long since it was served, with reasons shown. Dishes that don't fit are listed as hidden, with why. Any item can be marked as brought by a guest. "Suggest a menu" fills a balanced set from the top suggestions.
  4. **Review and accept**: adjustments still needed, hands-on time and shopping notes; accepting holds use-soon items and schedules the cooking, then offers the next meal.
  The same flow runs through the AI: it asks who's coming, then fills slots using the same ranking and rules.
- **Plans span days.** Planning starts from a **calendar**: pick any range of days, from one meal to a whole Yom Tov planned a month or more ahead. The calendar shows Hebrew dates, parshiyot, Jewish holidays and the household's civil holidays (Thanksgiving). The selected range is shown day by day: each meal's menu, plus all the cooking that has to happen on each day.
- **Accepting** works per meal, per day, per period (all of Shabbat, all of Yom Tov) or for the whole plan. Each meal is draft or accepted on its own. Accepting triggers use-soon holds and, once the date passes, serving history.
- **Scaling**: deterministic, rounds to usable units, warns where scaling isn't linear (leavening, spices, pan size, cook time). Saving a scaled result as a new version is an explicit action.
- **Shopping list**: one line per ingredient with the **total needed across upcoming accepted meals**, minus non-expired use-soon items with a quantity ("carrots — need 2", "sour cream — need ½ cup"). The user buys what makes sense. Lines can be checked off and **reordered by dragging**; no automatic store-section grouping. Sourcing notes (§4) appear on the relevant lines.
- **Menu lookup**: "what's for dinner?" reads the accepted plan.
- **Prep schedule** (basic): for an accepted menu, work backwards from each meal's time and produce a per-day task list.
  - Meals get a time. Defaults come from zmanim (Friday night meal after candle lighting) and can be overridden.
  - Each version contributes its pre-prep steps (by lead time), its active time and its total time.
  - **Active work is never scheduled during Shabbat or Yom Tov.** Passive steps (marinating, chilling) may span them, as long as they start before.
  - Dishes that must be ready before Shabbat or Yom Tov are pulled back to before it starts. Serving style decides what's needed: on the blech, room temperature or cold.
  - Yom Tov going into Shabbat flags **eruv tavshilin**. Cooking on Yom Tov for after Yom Tov is flagged.
  - Output is a list, not a calendar: "Thursday night: marinate chicken (12h). Friday by 2pm: kugel, soup…".
  - Not in the basic version: pot and oven conflicts, splitting work between people, notifications.
- **Cooking mode**: step-by-step with large type; scaled quantities with the unit toggle; inline timers; screen wake lock; ingredient checklist. Later: a merged timeline for a whole meal.

## 10. Sharing
- **Links are unlisted.** A link is never discoverable by search; public recipes (below) are the opt-in way to be found.
- **Version link** (main case) or **dish link** (a recipe with all its versions).
- Recipe links are **live**: anyone with the link sees the recipe as the author has it now, without an account, so the author's edits reach everyone following the link. Signed-in users can **save it to their household** as an independent copy with lineage; the copy is fixed as of the save and does not follow later edits. Sharing a recipe again returns the same link. The sender can revoke a link. Profile links are snapshots.
- **Profile links** share a Person's profile (§3).

### Public recipes
- An author (only the user who wrote it) can make a recipe **public**: the whole dish with all its versions. Anyone can search and read it (no account); signed-in users can rate it and save a copy. Over REST and MCP alike: publish, unpublish, list mine, get, search, save, rate, list my ratings.
- **Live, no copy, no double write.** `public_recipes` is only the publication record (recipe, owner, anonymous, rating and save totals). The content is the private recipe read live, exactly like a live share link, so editing the recipe (including ingredient catalog fixes) reaches the public one with no extra step, and nothing runs on private writes. A recipe is listed while its record is live, the recipe is live and it still has a live version; deleting the recipe or its last version just stops it appearing. Unpublishing keeps ratings and any copies others saved.
- **Search** runs on the same trigger-maintained `recipe_fts` as private search (transliteration aliases), one result per recipe. Filters apply to the lead version (the earliest live one): course, kashrut, difficulty, cost, time, tags and nutrition per serving. Sorts: relevance, popular (saves + ratings), top rated (Bayesian average), newest, A-Z, quickest. Safe-for, Pesach and dimension filters are not offered; results carry a "not checked, AI-filled data" disclaimer.
- **Author name** is never stored or sent by the client: it is the owner's profile name at read time. Anonymous recipes, and recipes whose author's account was deleted, show no author. The owner's id is never returned to anyone else.
- **Account deletion** keeps the author's public recipes (readable, searchable, saveable, anonymous); their other recipes are retired as before.
- **Ratings**: 1-5 stars, one per user (the user's, not the household's), replaceable or removable, not on your own recipe (household members can rate each other's); only the count and average are public. "My ratings" lists the viewer's own on recipes that are public right now.
- **Save a copy**: an independent copy with the original's lineage and a link back (`recipes.source_public_recipe_id`, shown as `original` on the copy, with `available: false` once unpublished). Saving twice returns the copy you have. The save count is the number of distinct households that ever saved a copy, so deleting and re-saving does not raise it.
- **Optional auth**: reading and searching need no sign-in; with a valid key or token the recipe also shows the viewer's own rating, saved copy and whether it is theirs. An invalid token is a 401, not anonymous.

### Language
- English only for now, using **Israeli-style transliteration** (Shabbat, kitniyot, chalav Yisrael).
- Search and the AI accept other spellings (Shabbos, kitniyos, cholov yisroel) through aliases.
- UI strings are externalized so Hebrew and other languages can be added later.

## 11. API and MCP
- **REST + OpenAPI** with per-user API keys (hashed, scoped read / read-write). A Tavshil skill that drives the REST API is an alternative to MCP.
- **MCP** via OAuth through BeezyWorks Accounts. A session acts on the signed-in user's household.
- **MCP tools are intent-level, not CRUD**, but must cover every feature (§1):
  - Planning: `get_dining_brief`, `plan_meal`, `update_meal` (add/remove items, brought dishes, attendees, time), `accept_menu`, `get_menu`, `get_prep_schedule`
  - Recipes: `search_recipes`, `get_recipe`, `import_recipe` (forgiving: pasted text/URL content), `save_recipe`, `save_variation`, `scale_recipe`, `get_recipe_history`
  - People: `get_people` (household and contacts), `save_person` (create/edit, including ghost households), `set_constraints`, `link_contact` (merge or overwrite), `add_note`, `record_reaction`
  - Kitchen: `get_use_soon`, `update_use_soon`, `get_kitchen`, `update_equipment`
  - Shopping: `get_shopping_list`, `update_shopping_list` (check off, reorder)
  - Catalog: `update_ingredient` (correct flags/density), `manage_dimensions`
  - Sharing: `share_recipe`, `share_profile`, `revoke_link`
- Resources and prompts: a "meal planning" prompt that explains the data model and constraint semantics.

### Database note (D1 vs Postgres)
D1 is the right call. The data is modest and mostly per household, so there's no need for Postgres's concurrency or analytics features. D1 gives FTS5 search, JSON columns for flexible dimensions, and no extra service. Limits to keep in mind: the 10 GB database cap and SQLite semantics. SQLite on both sides also suits the future local mobile copy. Drizzle keeps a later move to Postgres feasible.

## 12. Phasing
### MVP — "plan Shabbat for these guests", end to end
- Foundation: monorepo, design basics, auth via BeezyWorks Accounts, API keys, MCP, deployed to `tavshil.baderech.app`.
- Households with an owner and invited members; your own Person; ghost contact households with notes.
- Constraints: all kinds and tag types, seasons via `@beitecha/engine`, combination rules, equipment rules, sourcing notes.
- Recipes: versions, edit history, import, dimensions, cost, nutrition, source links, FTS search. Catalog built on demand by the AI, with source labels.
- Units and conversion.
- Dining brief, meals, brought dishes, accept menu, reactions and serving history.
- Use soon (use-by dates, holds, chametz effective expiry) and equipment designations.
- Pesach compatibility computed from ingredients.
- Scaling (math and rounding), shopping list, basic prep schedule.
- Web UI: browse, edit, menu, shopping list, cooking mode.
- The full MCP tool set above.

### Left out of the MVP
| Deferred | Why |
|---|---|
| Linking ghosts to real users, live links, deletion propagation | Only matters once other people use Tavshil. Ghosts cover every MVP case. |
| Snapshot share links and profile links | Same: value comes with other users. |
| Duplicate detection and merge UI | Store `lineage_id` and content hashes now; build the merge flow with sharing. |
| Equipment count / simultaneous-use checks | Designation rules are in. Pot and oven conflicts build on the basic prep schedule. |
| Prep reminders (notifications) | The schedule is readable via MCP and the UI; pushing it comes with mobile. |
| Non-linear scaling warnings | MVP scales linearly with rounding. |
| Merged meal timeline in cooking mode | Later polish. |
| Curated ingredient seed set | AI fills the catalog on demand. |

### After
1. Sharing: live recipe links, profile links, linking ghosts to real users, duplicate merge.
2. Scheduling: equipment counts and conflicts, splitting work between people, merged cooking timeline.
3. Mobile via EAS with a local offline database and prep reminders.
4. Later: hechsherim, meal trains, in-app potluck coordination, Hebrew UI.

**Never:** grocery delivery, prices.

## 13. Open questions
None open. Resolved in draft 3: contacts and notes are shared with the household; recipes belong to their author, and a leaver asks for shares of anyone else's.
