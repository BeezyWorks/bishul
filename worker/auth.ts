import type { Env } from './env'
import { HttpError } from './http'

export interface User {
  id: string
  name: string
  email: string
}

/** How long a good session check is reused in this isolate's memory. */
const SESSION_TTL_MS = 30_000
/**
 * How long a good session check is shared across isolates in the colo's cache (the accounts check takes seconds).
 * A revoked session can stay valid this long at most.
 */
const SHARED_TTL_S = 300
const SHARED_ORIGIN = 'https://session-cache.tavshil.internal'
const SESSION_CACHE_MAX = 500
const sessions = new Map<string, { user: User; expires: number }>()
const checking = new Map<string, Promise<User | null>>()

/** Test helper: forget this isolate's memory cache (as a fresh isolate would). */
export function forgetSessionsInMemory() {
  sessions.clear()
}

/** The colo cache, keyed by a hash of the token so the token itself is never stored. */
async function sharedKey(authorization: string): Promise<Request> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return new Request(`${SHARED_ORIGIN}/${hex}`)
}

function sharedCache(): Cache | null {
  return typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default
}

async function checkSession(authorization: string, env: Env): Promise<User | null> {
  const cache = sharedCache()
  const key = cache ? await sharedKey(authorization) : null
  if (cache && key) {
    const hit = await cache.match(key).catch(() => undefined)
    const user = hit ? ((await hit.json().catch(() => null)) as User | null) : null
    if (user?.id) return user
  }
  const user = await fetchSession(authorization, env)
  if (cache && key) {
    if (user) {
      // The key is an internal URL that no client can request, so the cache stays server-side.
      const res = Response.json(user, { headers: { 'cache-control': `max-age=${SHARED_TTL_S}` } })
      await cache.put(key, res).catch(() => {})
    } else await cache.delete(key).catch(() => false)
  }
  return user
}

async function fetchSession(authorization: string, env: Env): Promise<User | null> {
  const url = `${env.AUTH_URL}/api/auth/get-session`
  const init = { headers: { authorization } }
  const res = env.AUTH ? await env.AUTH.fetch(url, init) : await fetch(url, init)
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as { user?: User } | null
  return body?.user?.id ? { id: body.user.id, name: body.user.name, email: body.user.email } : null
}

/**
 * The signed-in BeezyWorks account, from the request's bearer token, checked against
 * the accounts service. Null when there's no token or it's no longer valid. The accounts
 * check is slow, so a good answer is reused (in memory, then in the colo cache for a few minutes) and parallel
 * requests share one check.
 */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  if (env.DEV_AUTH === '1') {
    const dev = /^Bearer (dev-[a-z0-9-]+)$/.exec(authorization)
    if (dev) return { id: dev[1], name: dev[1].slice(4), email: `${dev[1]}@localhost` }
  }
  const hit = sessions.get(authorization)
  if (hit && hit.expires > Date.now()) return hit.user
  let pending = checking.get(authorization)
  if (!pending) {
    pending = checkSession(authorization, env)
      .then((user) => {
        if (user) {
          if (sessions.size >= SESSION_CACHE_MAX) sessions.clear()
          sessions.set(authorization, { user, expires: Date.now() + SESSION_TTL_MS })
        } else sessions.delete(authorization)
        return user
      })
      .finally(() => checking.delete(authorization))
    checking.set(authorization, pending)
  }
  return pending
}

export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await currentUser(request, env)
  if (!user) throw new HttpError(401, 'sign in required')
  return user
}
