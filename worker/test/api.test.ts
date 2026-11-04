import { env } from 'cloudflare:workers'
import { SignJWT, importJWK } from 'jose'
import { describe, expect, it } from 'vitest'

import type { Env } from '../env'
import worker from '../index'

const ORIGIN = 'https://bishul.test'
const testEnv = env as unknown as Env & { TEST_KEYS: string }
const keys = JSON.parse(testEnv.TEST_KEYS) as Record<string, any>

const call = (method: string, path: string, body?: unknown, token?: string) =>
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

const sign = async (opts: { scope?: string; kid?: string } = {}) =>
  new SignJWT({ scope: opts.scope ?? 'bishul:write', azp: 'client-test' })
    .setProtectedHeader({ alg: 'EdDSA', kid: opts.kid ?? 'a' })
    .setSubject('user-1')
    .setIssuer('https://auth.test/api/auth')
    .setAudience(`${ORIGIN}/mcp`)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(await importJWK(keys[opts.kid ?? 'a'], 'EdDSA'))

const rpc = async (token: string, method: string, params?: unknown) => {
  const res = await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method, params }, token)
  return { status: res.status, data: (await res.json()) as any }
}

describe('health and auth', () => {
  it('answers /health', async () => {
    const res = await call('GET', '/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rejects a missing or bad session token', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401)
    expect((await call('GET', '/api/me', undefined, 'expired')).status).toBe(401)
    const ok = await call('GET', '/api/me', undefined, 'u1')
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as any).user.id).toBe('u1')
  })
})

describe('mcp', () => {
  it('challenges a request with no token', async () => {
    const res = await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(
      `${ORIGIN}/.well-known/oauth-protected-resource/mcp`,
    )
  })

  it('refuses a token without the scope', async () => {
    const res = await call(
      'POST',
      '/mcp',
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      await sign({ scope: 'other' }),
    )
    expect(res.status).toBe(403)
  })

  it('publishes the protected-resource metadata', async () => {
    const res = await call('GET', '/.well-known/oauth-protected-resource/mcp')
    expect(await res.json()).toMatchObject({
      resource: `${ORIGIN}/mcp`,
      scopes_supported: ['bishul:write'],
    })
  })

  it('initializes, pings and lists no tools', async () => {
    const token = await sign()
    const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18' })
    expect(init.data.result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'bishul' },
    })
    expect((await rpc(token, 'ping')).data.result).toEqual({})
    expect((await rpc(token, 'tools/list')).data.result).toEqual({ tools: [] })
    expect((await rpc(token, 'nope')).data.error.code).toBe(-32601)
    expect((await call('GET', '/mcp', undefined, token)).status).toBe(405)
  })
})
