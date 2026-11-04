import { Hono } from 'hono'

import { currentUser } from './auth'
import type { Env } from './env'
import { handleMcp } from './mcp'

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

app.get('/health', (c) => c.json({ ok: true }))

// The hosted MCP server and the discovery document a chat app reads before signing in.
app.all('/mcp', (c) => handleMcp(c.req.raw, c.env))
app.get('/.well-known/oauth-protected-resource/mcp', (c) => handleMcp(c.req.raw, c.env))
app.get('/.well-known/oauth-protected-resource', (c) => handleMcp(c.req.raw, c.env))

// Session API (the web app): the Baderech bearer token, checked with the accounts Worker.
app.get('/api/me', async (c) => {
  const user = await currentUser(c.req.raw, c.env)
  return user ? c.json({ user }) : c.json({ error: 'sign in required' }, 401)
})

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))
app.all('/v1/*', (c) => c.json({ error: { code: 'not_found', message: 'not found' } }, 404))

// Everything else is the exported Expo web app.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
