# Tavshil — project conventions

Recipe, household and meal-planning app for kosher families. The core job is "plan Shabbat for these guests". The
product spec is `BRIEF.md`; read it first. Primary interface is the user's own AI (MCP, or a skill over the REST API);
the web UI covers browsing, editing, the menu, the shopping list and cooking mode. Served at `tavshil.baderech.app`,
a sibling of Beitecha and the Baderech apps.

## Architecture

- **AI for judgment, code for facts.** Constraint matching, scaling, unit conversion, calendar logic and shopping-list
  math are deterministic code. The AI chooses dishes, balances menus, structures pasted recipes and handles fuzzy
  requests. Allergy results always carry the "it's on the host" disclaimer and flag AI-filled ingredient data.
- **One service layer** behind the web UI, REST (API keys) and MCP. No feature exists in only one of them. Handlers
  (Hono routes, MCP tools) stay thin and call the services.
- **`packages/core` (`@tavshil/core`).** Pure TypeScript, no platform dependencies (no Workers, D1, React or DOM types).
  Units and conversion, scaling, constraint evaluation, the dining brief and the prep schedule live here. All
  deterministic logic is unit-tested with Vitest. It depends on `@beitecha/engine` for the Hebrew calendar and nothing
  else.
- **Engine (`packages/engine`, the `BeezyWorks/beitecha-engine` submodule, `@beitecha/engine`).** The shared calendar
  engine (on `@hebcal/core`): location, Israel vs diaspora, holidays, zmanim, occasions. Reuse it; never rebuild it.
  Clone with `--recurse-submodules`.
- **Worker (`worker/`, `@tavshil/worker`).** Hono in `index.ts`; `mcp.ts` is a hand-written stateless JSON-RPC endpoint
  (initialize, ping, tools/list, tools/call; no sessions). Tools are intent-level, not CRUD. Auth: the web app sends the
  Baderech bearer token, checked with `GET /api/auth/get-session` on the accounts Worker over the `AUTH` service
  binding (`auth.ts`; `DEV_AUTH=1` in `.dev.vars` accepts `Bearer dev-<name>`). MCP access tokens are JWTs verified
  against the accounts JWKS (`oauth.ts`; scope `tavshil:write`, resource `${PUBLIC_URL}/mcp`). Per-user API keys
  (hashed, read / read-write) are added for REST. Vitest with `@cloudflare/vitest-pool-workers`; the accounts service is
  faked in `worker/vitest.config.mts`.
- **Schema** lives in `worker/db/schema.ts` (Drizzle on D1). `pnpm db:generate` writes SQL migrations into root
  `migrations/`; `pnpm db:migrate:local` applies them. Sync-friendly from day one: client-generatable IDs (ULID/UUID),
  `updated_at` on every row, soft deletes, an edit log.
- **App (`src/`).** Expo Router, web first. `src/app/` holds only route files that re-export screens from
  `src/features/<feature>/`. Tavshil has its own look (no `@beezyworks/design`): tokens in `src/theme/tokens.ts`; no raw
  colors in components. Fonts: Bricolage Grotesque (display), Instrument Sans (body).
- **Time is the household's time zone**, never the viewer's clock. Today/now come from the engine's `todayIn(tz)` with
  the household location's zone.
- **Households are the unit; constraints live on individuals.** See BRIEF.md §3 for ownership rules.

## Conventions

- English UI text uses Israeli-style transliteration (Shabbat, kitniyot, chalav Yisrael). Search and the AI accept other
  spellings (Shabbos, kitniyos) through aliases. Strings are kept in one place so other languages can be added.
- Prettier: no semicolons, single quotes, width 100. `pnpm format`.
- Commit straight to `main` or via PR. Conventional commits (`feat(worker): ...`, `fix(core): ...`); semantic-release
  runs from CI on `main`. There is no deploy job; deploy by hand with `pnpm deploy`.
- Checks: `pnpm typecheck` and `pnpm test` (core and worker) must pass.
- Hebrew in chat output prints reversed for the user's terminal; never reverse it in files.
