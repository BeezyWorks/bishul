import { Hono } from 'hono'

import { buildOpenApi } from './api/openapi'
import { mountApi, onError } from './api/router'
import { currentUser } from './auth'
import type { Env } from './env'
import { handleMcp } from './mcp'
import { countBadSecret } from './ratelimit'
import { eraseUserAccount } from './services/accounts'
import { openDb, sha256Hex } from './services/ctx'
import { purgeRetired } from './services/purge'

export type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

// No page of ours may be framed (clickjacking).
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('content-security-policy', "frame-ancestors 'none'")
  c.res.headers.set('x-frame-options', 'DENY')
})

// In local dev the Expo server (another port) calls the API cross-origin.
app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  const dev = c.env.DEV_AUTH === '1' && origin && /^http:\/\/localhost:\d+$/.test(origin)
  if (dev && c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      },
    })
  }
  await next()
  if (dev) c.res.headers.set('access-control-allow-origin', origin)
})

app.onError(onError)

app.get('/health', (c) => c.json({ ok: true }))

// The hosted MCP server and the discovery document a chat app reads before signing in.
app.all('/mcp', (c) => handleMcp(c.req.raw, c.env))
app.get('/.well-known/oauth-protected-resource/mcp', (c) => handleMcp(c.req.raw, c.env))
app.get('/.well-known/oauth-protected-resource', (c) => handleMcp(c.req.raw, c.env))

// BeezyWorks Accounts tells us when an account is deleted (BRIEF §3): a POST with the shared secret as bearer token.
app.post('/internal/account-deleted', async (c) => {
  const secret = c.env.ACCOUNT_EVENTS_SECRET
  const given = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
  const ok = !!secret && !!given && (await sha256Hex(given)) === (await sha256Hex(secret))
  if (!ok) {
    await countBadSecret(c.req.raw, c.env)
    return c.json({ error: { code: 'unauthorized', message: 'not allowed' } }, 401)
  }
  const body = (await c.req.json().catch(() => null)) as { userId?: unknown } | null
  if (typeof body?.userId !== 'string' || !body.userId)
    return c.json({ error: { code: 'invalid', message: 'userId is required' } }, 400)
  await eraseUserAccount(openDb(c.env.DB), body.userId)
  return c.json({ ok: true })
})

// Session API (the web app): the Baderech bearer token, checked with the accounts Worker.
app.get('/api/me', async (c) => {
  const user = await currentUser(c.req.raw, c.env)
  return user
    ? c.json({ user })
    : c.json({ error: { code: 'unauthorized', message: 'sign in required' } }, 401)
})

// The OpenAPI 3.1 document for /v1, generated from the same operations the server runs.
app.get('/v1/openapi.json', (c) =>
  c.json(buildOpenApi(c.env.PUBLIC_URL), 200, { 'cache-control': 'public, max-age=300' }),
)

// /api/* (session token) and /v1/* (API key): the same operations, one service layer (api/ops.ts).
mountApi(app)

app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'not found' } }, 404))
app.all('/v1/*', (c) => c.json({ error: { code: 'not_found', message: 'not found' } }, 404))

// Everything else is the exported Expo web app.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  // Daily (see `triggers` in wrangler.jsonc): erase what was deleted long enough ago (services/purge.ts).
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      purgeRetired(env.DB).then(
        (erased) => console.log('[purge]', JSON.stringify(erased)),
        (e) => console.error('[purge] failed', e instanceof Error ? e.message : e),
      ),
    )
  },
}
