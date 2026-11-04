import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet } from 'jose'

import type { Env } from './env'

// ---------------------------------------------------------------------------
// The MCP's access tokens: JWTs the accounts service signs (Better Auth's `jwt()` + `mcp()` plugins). Checked here
// against its JWKS, fetched over the `AUTH` binding. `jose` rather than `@better-auth/mcp`'s handler: that one is
// built around a Better Auth instance (`requireMcpAuth(auth, …)`), which this Worker does not run, and `jose`
// is the same library it verifies with, in a few dozen lines on Web Crypto.

/** Who a verified MCP token acts for: the account and the chat app (OAuth client) behind it. */
export interface OAuthIdentity {
  userId: string
  clientId: string
  /** The client's own name from the accounts service ("Claude"), or null. Only labels. */
  clientName: () => Promise<string | null>
}

/** The one scope a Bishul token carries. */
export const MCP_SCOPE = 'bishul:write'
/** The signing algorithms we accept (the accounts service signs with EdDSA by default); never `none` or HMAC. */
const ALGORITHMS = ['EdDSA', 'ES256', 'RS256']
const JWKS_TTL_MS = 5 * 60_000
/** A token with a `kid` we don't know may refetch the JWKS (key rotation), but not more often than this. */
const JWKS_REFETCH_MS = 10_000
const CLOCK_SKEW_S = 30

export const issuerOf = (env: Pick<Env, 'AUTH_URL'>) =>
  `${env.AUTH_URL.replace(/\/$/, '')}/api/auth`
export const resourceOf = (env: Pick<Env, 'PUBLIC_URL'>) =>
  `${env.PUBLIC_URL.replace(/\/$/, '')}/mcp`
export const metadataUrl = (env: Pick<Env, 'PUBLIC_URL'>) =>
  `${env.PUBLIC_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp`

/** Reaches the accounts service over the service binding (the URL's host is the issuer's), else over the network. */
async function accounts(env: Env, path: string): Promise<Response> {
  const url = `${env.AUTH_URL.replace(/\/$/, '')}${path}`
  return env.AUTH ? env.AUTH.fetch(url) : fetch(url)
}

let cache: { jwks: JSONWebKeySet; at: number } | null = null

/** For tests: forget the cached keys, or pretend they were fetched `ms` ago. */
export const forgetJwks = () => {
  cache = null
}
export const ageJwks = (ms: number) => {
  if (cache) cache.at -= ms
}

async function loadJwks(env: Env): Promise<JSONWebKeySet> {
  const res = await accounts(env, '/api/auth/jwks')
  const body = (await res.json().catch(() => null)) as JSONWebKeySet | null
  if (!res.ok || !body || !Array.isArray(body.keys))
    throw new Error('the accounts service has no keys')
  cache = { jwks: body, at: Date.now() }
  return body
}

export class TokenError extends Error {
  constructor(
    readonly kind: 'invalid_token' | 'insufficient_scope',
    message: string,
  ) {
    super(message)
  }
}

const scopesOf = (v: unknown): string[] =>
  typeof v === 'string' ? v.split(/\s+/).filter(Boolean) : Array.isArray(v) ? v.map(String) : []

/**
 * A verified token as the user and chat app behind it. Throws `TokenError`: `invalid_token` (bad signature, wrong
 * issuer or audience, expired, not yet valid, a token bound to a proof key we can't check) or `insufficient_scope`.
 */
export async function verifyAccessToken(env: Env, token: string): Promise<OAuthIdentity> {
  const options = {
    issuer: issuerOf(env),
    audience: resourceOf(env),
    algorithms: ALGORITHMS,
    clockTolerance: CLOCK_SKEW_S,
    requiredClaims: ['sub', 'exp'],
  }
  const check = async (jwks: JSONWebKeySet) =>
    (await jwtVerify(token, createLocalJWKSet(jwks), options)).payload
  let payload
  try {
    if (!cache || Date.now() - cache.at > JWKS_TTL_MS) await loadJwks(env)
    try {
      payload = await check(cache!.jwks)
    } catch (e) {
      // A key we haven't seen: the accounts service may have rotated. Look once more (not more than every 10 s).
      if (!(e instanceof errors.JWKSNoMatchingKey) || Date.now() - cache!.at < JWKS_REFETCH_MS)
        throw e
      payload = await check(await loadJwks(env))
    }
  } catch (e) {
    if (e instanceof errors.JOSEError)
      throw new TokenError('invalid_token', 'The token is not valid')
    // The accounts service couldn't be reached: not the token's fault, but nothing can be trusted either.
    console.error('jwks error', e instanceof Error ? e.message : 'unknown')
    throw new TokenError('invalid_token', 'The token could not be checked')
  }
  if (payload.cnf)
    throw new TokenError('invalid_token', 'Proof-of-possession tokens are not accepted')
  const clientId = typeof payload.azp === 'string' ? payload.azp : (payload.client_id as unknown)
  if (typeof payload.sub !== 'string' || typeof clientId !== 'string' || !clientId)
    throw new TokenError('invalid_token', 'The token has no user or client')
  if (!scopesOf(payload.scope).includes(MCP_SCOPE))
    throw new TokenError('insufficient_scope', `The token needs the ${MCP_SCOPE} scope`)
  return { userId: payload.sub, clientId, clientName: () => clientName(env, clientId) }
}

const names = new Map<string, { name: string | null; at: number }>()
const NAME_TTL_MS = 10 * 60_000

/** The client's own name from the accounts service ("Claude"), or null. Self-asserted, so it only labels. */
async function clientName(env: Env, clientId: string): Promise<string | null> {
  const seen = names.get(clientId)
  if (seen && Date.now() - seen.at < NAME_TTL_MS) return seen.name
  let name: string | null = null
  try {
    const res = await accounts(
      env,
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    )
    const body = res.ok
      ? ((await res.json().catch(() => null)) as { client_name?: unknown } | null)
      : null
    name =
      typeof body?.client_name === 'string' ? body.client_name.trim().slice(0, 40) || null : null
  } catch {
    name = null
  }
  if (names.size > 500) names.clear()
  names.set(clientId, { name, at: Date.now() })
  return name
}

// ---------------------------------------------------------------------------
// HTTP: discovery and challenges (MCP authorization, RFC 9728)

const wellKnown = (env: Env) => ({
  resource: resourceOf(env),
  authorization_servers: [issuerOf(env)],
  scopes_supported: [MCP_SCOPE],
  bearer_methods_supported: ['header'],
})

/** `GET /.well-known/oauth-protected-resource[/mcp]`: where a chat app learns whom to sign in with. */
export function protectedResourceMetadata(env: Env): Response {
  return Response.json(wellKnown(env), { headers: { 'cache-control': 'public, max-age=300' } })
}

/** 401 (no or bad token) or 403 (a good token without the scope), with the `WWW-Authenticate` challenge. */
export function challenge(
  env: Env,
  kind: 'missing' | 'invalid_token' | 'insufficient_scope',
  message?: string,
): Response {
  const parts = [`resource_metadata="${metadataUrl(env)}"`]
  if (kind === 'invalid_token') parts.unshift('error="invalid_token"')
  if (kind === 'insufficient_scope')
    parts.unshift('error="insufficient_scope"', `scope="${MCP_SCOPE}"`)
  return Response.json(
    {
      error: kind === 'missing' ? 'unauthorized' : kind,
      error_description: message ?? 'Sign in with your Baderech account to use Bishul',
    },
    {
      status: kind === 'insufficient_scope' ? 403 : 401,
      headers: { 'www-authenticate': `Bearer ${parts.join(', ')}` },
    },
  )
}
