/** API origin: same origin in production; the local `wrangler dev` when running `expo start`. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

/** The accounts service (Better Auth). */
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? 'https://auth.baderech.app'
