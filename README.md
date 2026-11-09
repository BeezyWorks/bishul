# Tavshil

Recipe, household and meal-planning app for kosher families, served at `tavshil.baderech.app`.
The product spec is in [BRIEF.md](BRIEF.md); conventions for contributors and agents are in [AGENTS.md](AGENTS.md).

## Layout

- `src/` the Expo Router app (web first)
- `worker/` the Cloudflare Worker (`@tavshil/worker`): Hono, Drizzle on D1, REST and MCP
- `packages/core/` pure domain logic (`@tavshil/core`)
- `packages/engine/` the Hebrew calendar engine (git submodule, `@beitecha/engine`)

## Develop

```sh
git clone --recurse-submodules git@github.com:BeezyWorks/tavshil.git
pnpm install
pnpm dev:api     # the Worker on :8787 (put DEV_AUTH=1 in .dev.vars for dev tokens)
pnpm start       # the web app (set EXPO_PUBLIC_API_URL=http://localhost:8787)
pnpm typecheck && pnpm test
```
