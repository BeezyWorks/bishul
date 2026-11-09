# Database (D1 + Drizzle)

`schema.ts` is the source of truth. `pnpm db:generate` writes SQL into `/migrations`; `0001_fts.sql` is hand-written
(registered with `drizzle-kit generate --custom`). Apply locally with `pnpm db:migrate:local`. The worker tests apply
all migrations to the test D1 (`vitest.config.mts` reads them, `test/setup.ts` applies them).

**Conventions.** Text ULID primary keys (`ids.ts`, client-generatable); `created_at`/`updated_at` in ms epoch;
`deleted_at` soft delete on user data (`version_edits` is append-only). Users are external (BeezyWorks Accounts), so
`*_user_id` has no foreign key. JSON columns only for flexible shapes.

## Tables

- **People:** `households` (owner, location JSON, `is_ghost`, `ghost_of_household_id`), `household_members`,
  `persons`, `person_links` (ghost person to real person, merge or overwrite).
- **Constraints:** `constraints`, `person_rules` (opt-in combination and equipment rules), `notes`, `reactions`,
  `served_log`.
- **Recipes:** `recipes`, `versions` (all version fields, `lineage_id`, `content_hash`, JSON steps/flags/nutrition),
  `ingredient_lines`, `version_equipment`, `dimensions`, `version_dimensions`, `version_edits`.
- **Catalog:** `ingredients` (household null = global; flags and allergens carry `seed|ai|user` sources).
- **Planning:** `meals`, `meal_attendees`, `meal_items` (a version with scale and servings, or a brought dish).
- **Kitchen:** `pantry_items`, `equipment`, `shopping_list` (order, checked and manual lines only; holds and totals
  are computed).
- **Access:** `share_links` (snapshot JSON, `revoked_at`), `api_keys` (hashed, `read|write`).
- **Public recipes:** `public_recipes` (one projection per published dish: JSON snapshot, list columns from the lead version, rating and save totals, `anonymous`), `public_recipe_ratings` (one per user), `public_recipe_fts` (FTS5, written by `syncPublic` in the same batch, no triggers). `recipes.source_public_recipe_id` links a saved copy back.
- **Tags:** `version_tags` (`tag` as typed, `key` folded for matching; no owner or vocabulary table).
- **Search:** `recipe_fts` (FTS5, one row per live version: recipe and version title, description, ingredient text
  with catalog names and aliases, and tags; rebuilt in `0010_fts_tags.sql`). Triggers on `versions`, `ingredient_lines`, `recipes` and `ingredients` keep it in
  sync, including soft deletes. Query: `SELECT version_id FROM recipe_fts WHERE recipe_fts MATCH 'lem*'`.

## Layering of private additions

A real person's own data (their `persons` row in their household, constraints with `layer_household_id` null) is
theirs. Anything a host adds about a person is tagged with the host's household in `layer_household_id` (constraints,
`person_rules`, `reactions`, `served_log`) or `author_household_id` (`notes`). Reads for a household take the person's
own rows (layer null, via a live link) plus rows whose layer is that household; no other household's layer is ever
returned. Unlinking or account deletion removes the person's own rows and the link; the host's layer stays.
