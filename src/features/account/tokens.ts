import { storage } from '@/lib/storage'

const KEY = 'bishul.authToken'

/** The Baderech session (bearer) token, kept in localStorage on the web. */
export const tokenStore = {
  get: () => storage.get(KEY),
  set: (token: string | null) => storage.set(KEY, token),
}
