/** API origin: same origin in production; the local `wrangler dev` when running `expo start`. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

/** The accounts service (Better Auth). */
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? 'https://auth.baderech.app'

/** Offline demo: the in-memory mock backend and no sign-in. */
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === '1'

/** Local development only: "continue as a dev user" (the local worker needs `DEV_AUTH=1`). */
export const DEV_AUTH = __DEV__ && process.env.EXPO_PUBLIC_DEV_AUTH !== '0'

/** The public site, for the Connect-your-AI instructions. */
export const SITE_URL = 'https://bishul.baderech.app'
export const MCP_URL = `${SITE_URL}/mcp`
export const REST_URL = `${SITE_URL}/v1`
export const OPENAPI_URL = `${SITE_URL}/v1/openapi.json`
