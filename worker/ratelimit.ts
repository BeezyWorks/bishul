import type { Env } from './env'
import { ApiError } from './http'

/**
 * Counts a bad secret (an unknown API key, an invalid access token) against the caller's IP, so guessing runs out of
 * room quickly. Throws a 429 once over. A no-op without the `AUTH_LIMIT` binding (plain local dev) or an IP.
 */
export async function countBadSecret(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!env.AUTH_LIMIT || !ip) return
  const { success } = await env.AUTH_LIMIT.limit({ key: ip })
  if (!success) throw new ApiError(429, 'rate_limited', 'Too many requests; try again in a minute')
}
