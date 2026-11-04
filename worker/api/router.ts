import type { Context, Hono } from 'hono'
import { ZodError, z } from 'zod'

import { requireUser } from '../auth'
import type { Env } from '../env'
import { ApiError, HttpError, apiFail } from '../http'
import { countBadSecret } from '../ratelimit'
import { openDb, type Actor, type Via } from '../services/ctx'
import { ensureActor } from '../services/households'
import { authenticateApiKey } from '../services/sharing'
import { operations, type Operation } from './ops'

type App = Hono<{ Bindings: Env }>
type Ctx = Context<{ Bindings: Env }>

const MAX_BODY = 1_000_000

interface Auth {
  user: { id: string; name?: string | null }
  via: Via
  scope: 'read' | 'write'
}

/** `/api`: the web app's bearer token, checked with the accounts service. */
async function sessionAuth(c: Ctx): Promise<Auth> {
  const user = await requireUser(c.req.raw, c.env)
  return { user: { id: user.id, name: user.name }, via: 'web', scope: 'write' }
}

/** `/v1`: `Authorization: Bearer bsk_…`. Bad keys count against the caller's IP. */
async function keyAuth(c: Ctx): Promise<Auth> {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')
  if (!match) throw new ApiError(401, 'unauthorized', 'Send your API key as "Authorization: Bearer bsk_…"')
  const db = openDb(c.env.DB)
  const key = await authenticateApiKey(db, match[1])
  if (!key) {
    await countBadSecret(c.req.raw, c.env)
    throw new ApiError(401, 'unauthorized', 'That API key is not valid')
  }
  return { user: { id: key.userId }, via: 'api', scope: key.scope }
}

async function body(c: Ctx): Promise<Record<string, unknown>> {
  const text = await c.req.text()
  if (!text.trim()) return {}
  if (text.length > MAX_BODY) throw new ApiError(413, 'too_large', 'The request body is too large')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ApiError(400, 'invalid_json', 'The body is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new ApiError(400, 'invalid', 'The body must be a JSON object')
  return parsed as Record<string, unknown>
}

export function parseInput(op: Operation, raw: unknown) {
  const res = op.input.safeParse(raw)
  if (res.success) return res.data
  throw new ApiError(400, 'invalid', describeIssues(res.error), res.error.issues)
}

export function describeIssues(err: ZodError): string {
  return err.issues
    .slice(0, 4)
    .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
    .join('; ')
}

function register(app: App, base: '/api' | '/v1', auth: (c: Ctx) => Promise<Auth>) {
  for (const op of operations) {
    if (base === '/v1' && op.webOnly) continue
    const handler = async (c: Ctx) => {
      const a = op.public ? null : await auth(c)
      const hasBody = op.method === 'post' || op.method === 'put' || op.method === 'patch'
      const raw = { ...Object.fromEntries(new URL(c.req.url).searchParams), ...(hasBody ? await body(c) : {}), ...c.req.param() }
      const input = parseInput(op, raw)
      if (a && a.scope === 'read' && (op.scope === 'write' || op.needsWrite?.(input as never)))
        throw new ApiError(403, 'insufficient_scope', 'This API key is read-only. Create a read-write key to change data.')
      const db = openDb(c.env.DB)
      const actor: Actor = a
        ? await ensureActor(db, a.user, a.via)
        : { userId: '', householdId: '', via: base === '/v1' ? 'api' : 'web' }
      const result = await op.run(
        { db, actor, user: a?.user ?? { id: '' }, publicUrl: c.env.PUBLIC_URL },
        input as never,
      )
      return c.json(result as object, (op.status ?? 200) as 200)
    }
    app.on(op.method.toUpperCase(), `${base}${op.path}`, handler)
  }
}

/** Errors on every route: `{ error: { code, message } }`. */
export function onError(err: Error, c: Ctx): Response {
  if (err instanceof ApiError) {
    const res = apiFail(err.status, err.code, err.message, err.details)
    if (err.status === 429) res.headers.set('retry-after', '60')
    return res
  }
  if (err instanceof HttpError)
    return apiFail(err.status, err.status === 401 ? 'unauthorized' : 'error', err.message)
  if (err instanceof ZodError) return apiFail(400, 'invalid', describeIssues(err), err.issues)
  console.error('unhandled', c.req.method, new URL(c.req.url).pathname, err instanceof Error ? err.message : err)
  return apiFail(500, 'internal', 'Something went wrong on our side. Nothing was lost; try again in a moment.')
}

export function mountApi(app: App) {
  register(app, '/api', sessionAuth)
  register(app, '/v1', keyAuth)
}

export { z }
