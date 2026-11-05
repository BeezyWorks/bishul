import type { Env } from './env'
import { HttpError } from './http'

export interface User {
  id: string
  name: string
  email: string
}

/** How long a good session check is reused. A revoked session can stay valid this long at most. */
const SESSION_TTL_MS = 30_000
const SESSION_CACHE_MAX = 500
const sessions = new Map<string, { user: User; expires: number }>()
const checking = new Map<string, Promise<User | null>>()

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
 * check is slow, so a good answer is reused briefly and parallel requests share one check.
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
    pending = fetchSession(authorization, env)
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
