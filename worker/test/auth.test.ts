import { describe, expect, it } from 'vitest'

import { currentUser, forgetSessionsInMemory } from '../auth'
import type { Env } from '../env'
import { testEnv } from './helpers'

/** An env whose accounts service counts its session checks. */
function countingEnv(answer: (id: string) => Response) {
  const calls = { n: 0 }
  const env = {
    ...testEnv,
    AUTH: {
      fetch: async (_url: string, init?: RequestInit) => {
        calls.n++
        const id = new Headers(init?.headers).get('authorization')!.replace(/^Bearer /, '')
        return answer(id)
      },
    },
  } as unknown as Env
  return { env, calls }
}

const ok = (id: string) =>
  Response.json({ user: { id, name: `User ${id}`, email: `${id}@example.com` } })
const req = (token: string) =>
  new Request('https://tavshil.test/api/prefs', { headers: { authorization: `Bearer ${token}` } })

describe('session checks', () => {
  it('shares a good check across isolates through the colo cache', async () => {
    const token = `shared-${crypto.randomUUID()}`
    const { env, calls } = countingEnv(ok)
    expect((await currentUser(req(token), env))?.id).toBe(token)
    expect(calls.n).toBe(1)

    // A fresh isolate has an empty memory cache but finds the colo cache entry.
    forgetSessionsInMemory()
    const other = countingEnv(() => new Response('null', { status: 401 }))
    expect((await currentUser(req(token), other.env))?.id).toBe(token)
    expect(other.calls.n).toBe(0)
  })

  it('does not cache a rejected token', async () => {
    const token = `bad-${crypto.randomUUID()}`
    const { env, calls } = countingEnv(() => new Response('null', { status: 401 }))
    expect(await currentUser(req(token), env)).toBeNull()
    forgetSessionsInMemory()
    expect(await currentUser(req(token), env)).toBeNull()
    expect(calls.n).toBe(2)
  })

  it('stores a hash of the token, not the token', async () => {
    const token = `hashed-${crypto.randomUUID()}`
    await currentUser(req(token), countingEnv(ok).env)
    const raw = await (caches as unknown as { default: Cache }).default.match(
      `https://session-cache.tavshil.internal/${encodeURIComponent(`Bearer ${token}`)}`,
    )
    expect(raw).toBeUndefined()
  })
})
