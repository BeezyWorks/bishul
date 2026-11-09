import { storage } from '@/lib/storage'

const KEY = 'bishul.authToken'

/** The Baderech session (bearer) token, kept in localStorage on the web. */
export const tokenStore = {
  get: () => storage.get(KEY),
  set: (token: string | null) => storage.set(KEY, token),
}

const USER_KEY = 'bishul.authUser'

/** The last signed-in user, so the app can start signed in before the session check returns. */
export const userStore = {
  get(): { id: string; name: string; email: string } | null {
    try {
      const u = JSON.parse(storage.get(USER_KEY) ?? 'null')
      return u && typeof u.id === 'string' ? u : null
    } catch {
      return null
    }
  },
  set(user: { id: string; name: string; email: string } | null) {
    storage.set(
      USER_KEY,
      user ? JSON.stringify({ id: user.id, name: user.name, email: user.email }) : null,
    )
  },
}
