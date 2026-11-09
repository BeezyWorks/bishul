import { env } from 'cloudflare:workers'
import { SignJWT, importJWK } from 'jose'

import type { Env } from '../env'
import worker from '../index'

export const ORIGIN = 'https://tavshil.test'
export const testEnv = env as unknown as Env & { TEST_KEYS: string }
const keys = JSON.parse(testEnv.TEST_KEYS) as Record<string, any>

/** A request to the Worker. `token` is a session token: the fake accounts service treats "Bearer <id>" as user <id>. */
export const call = (method: string, path: string, body?: unknown, token?: string) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  )

/** Calls the session API as user `who` and returns the parsed JSON (throwing on an error status unless allowed). */
export async function api(who: string, method: string, path: string, body?: unknown, expect = 200) {
  const res = await call(method, `/api${path}`, body, who)
  const data = (await res.json()) as any
  if (res.status !== expect)
    throw new Error(
      `${method} ${path} -> ${res.status} (wanted ${expect}): ${JSON.stringify(data)}`,
    )
  return data
}

export const sign = async (userId: string, opts: { scope?: string } = {}) =>
  new SignJWT({ scope: opts.scope ?? 'tavshil:write', azp: 'client-test' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'a' })
    .setSubject(userId)
    .setIssuer('https://auth.test/api/auth')
    .setAudience(`${ORIGIN}/mcp`)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(await importJWK(keys.a, 'EdDSA'))

export const rpc = async (token: string, method: string, params?: unknown, id = 1) => {
  const res = await call('POST', '/mcp', { jsonrpc: '2.0', id, method, params }, token)
  return { status: res.status, data: (await res.json()) as any }
}

/** Calls an MCP tool and returns the structured result (or the error text). */
export async function tool(token: string, name: string, args: unknown = {}) {
  const { data } = await rpc(token, 'tools/call', { name, arguments: args })
  if (data.error) throw new Error(JSON.stringify(data.error))
  return {
    isError: data.result.isError as boolean,
    data: data.result.structuredContent as any,
    text: data.result.content[0].text as string,
  }
}

/** The next Friday (erev Shabbat) on or after today, in YYYY-MM-DD, from the household's own calendar. */
export async function nextFriday(who: string): Promise<string> {
  const cal = await api(who, 'GET', '/calendar?days=10')
  return cal.days.find((d: any) => d.isErevShabbat).date
}
