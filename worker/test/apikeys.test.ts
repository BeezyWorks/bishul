import { describe, expect, it } from 'vitest'

import worker from '../index'
import { api, call, ORIGIN, testEnv } from './helpers'

const v1 = (key: string, method: string, path: string, body?: unknown) =>
  worker.fetch(
    new Request(`${ORIGIN}/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  )

describe('API keys and /v1', () => {
  it('creates a key shown once, authenticates /v1, enforces scope, and revokes', async () => {
    const who = 'key-a'
    const write = await api(who, 'POST', '/keys', { scope: 'write' }, 201)
    expect(write.key).toMatch(/^tsk_[0-9a-f]{40}$/)
    const read = await api(who, 'POST', '/keys', { scope: 'read' }, 201)

    const listed = await api(who, 'GET', '/keys')
    expect(listed).toHaveLength(2)
    expect(JSON.stringify(listed)).not.toContain(write.key)

    const made = await v1(write.key, 'POST', '/recipes/import', {
      servings: 4,
      title: 'Key soup',
      ingredients: ['1 onion'],
      steps: ['Boil'],
    })
    expect(made.status).toBe(201)
    const body = (await made.json()) as any
    expect(body.version.id).toBeTruthy()
    const res = await v1(read.key, 'GET', '/recipes')
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).results.map((r: any) => r.title)).toEqual(['Key soup'])

    // Read key cannot write.
    const denied = await v1(read.key, 'POST', '/recipes/import', {
      servings: 4,
      title: 'Nope',
      ingredients: ['1 egg'],
      steps: ['x'],
    })
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as any).error.code).toBe('insufficient_scope')

    // Another user's key sees nothing of this household.
    const other = await api('key-b', 'POST', '/keys', { scope: 'read' }, 201)
    expect(((await (await v1(other.key, 'GET', '/recipes')).json()) as any).total).toBe(0)

    // Bad, missing and web-session credentials are rejected; web-only ops are absent.
    const bad = await v1('tsk_' + '0'.repeat(40), 'GET', '/recipes')
    expect(bad.status).toBe(401)
    expect(((await bad.json()) as any).error.code).toBe('unauthorized')
    expect((await call('GET', '/v1/recipes')).status).toBe(401)
    expect((await call('GET', '/v1/recipes', undefined, who)).status).toBe(401)
    expect((await v1(write.key, 'GET', '/keys')).status).toBe(404)

    // Revoke.
    await api(who, 'DELETE', `/keys/${read.id}`)
    expect((await v1(read.key, 'GET', '/recipes')).status).toBe(401)
    expect((await v1(write.key, 'GET', '/recipes')).status).toBe(200)
  })

  it('serves a valid OpenAPI 3.1 document without web-only operations', async () => {
    const res = await call('GET', '/v1/openapi.json')
    expect(res.status).toBe(200)
    const doc = (await res.json()) as any
    expect(doc.openapi).toMatch(/^3\.1/)
    expect(doc.info.title).toBeTruthy()
    const paths = Object.keys(doc.paths)
    expect(paths.some((p) => /recipes/.test(p))).toBe(true)
    expect(paths.some((p) => /\/keys|\/invites\/\{token\}|\/leave|\/transfer/.test(p))).toBe(false)
    expect(doc.components.securitySchemes).toBeTruthy()
    for (const p of Object.values<any>(doc.paths))
      for (const op of Object.values<any>(p)) expect(op.operationId).toBeTruthy()
  })

  it('answers unknown routes with the error shape', async () => {
    const res = await call('GET', '/api/nothing-here', undefined, 'key-c')
    expect(res.status).toBe(404)
    expect(((await res.json()) as any).error.code).toBeTruthy()
  })
})
