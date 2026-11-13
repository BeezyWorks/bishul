import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

import { AUTH_URL, DEV_AUTH, USE_MOCK } from '@/lib/config'

import { tokenStore, userStore } from './tokens'

/** Account store: Better Auth on auth.baderech.app with bearer tokens, no cookies. */
export interface AccountUser {
  id: string
  name: string
  email: string
}
export type AccountStatus = 'unknown' | 'signedOut' | 'signedIn'
interface State {
  status: AccountStatus
  user: AccountUser | null
}

/** A stored token plus the last known user: start signed in and verify in the background. */
function initialState(): State {
  if (USE_MOCK)
    return { status: 'signedIn', user: { id: 'demo', name: 'Demo', email: 'demo@localhost' } }
  const user = tokenStore.get() ? userStore.get() : null
  return user ? { status: 'signedIn', user } : { status: 'unknown', user: null }
}
let state: State = initialState()
const listeners = new Set<() => void>()
function set(next: State) {
  state = next
  userStore.set(next.status === 'signedIn' ? next.user : null)
  listeners.forEach((l) => l())
}

export function useAccount(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}
export const getAccount = () => state

class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function auth(path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${AUTH_URL}/api/auth${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Bearer tokens only: no cross-site cookies.
    credentials: 'omit',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok)
    throw new AuthError(
      data?.message ?? data?.error ?? `Sign-in failed (${res.status})`,
      res.status,
    )
  const fresh = res.headers.get('set-auth-token')
  if (fresh) tokenStore.set(fresh)
  return data
}

export async function refreshAccount(): Promise<void> {
  if (USE_MOCK) return
  const token = tokenStore.get()
  if (!token) return set({ status: 'signedOut', user: null })
  if (DEV_AUTH && token.startsWith('dev-')) {
    return set({
      status: 'signedIn',
      user: { id: token, name: token.slice(4), email: `${token}@localhost` },
    })
  }
  const cached = state.status === 'signedIn'
  try {
    const data = await auth('/get-session')
    // Signed out while this was in flight: stay signed out. (A rotated token differs from `token`.)
    if (!tokenStore.get()) return
    if (data?.user) set({ status: 'signedIn', user: data.user })
    else {
      tokenStore.set(null)
      set({ status: 'signedOut', user: null })
    }
  } catch (e) {
    // Offline or a server hiccup must not sign out someone we already trust; an HTTP 401 does.
    if (cached && !(e instanceof AuthError && e.status === 401)) return
    if (tokenStore.get() === token) tokenStore.set(null)
    set({ status: 'signedOut', user: null })
  }
}

export async function signInEmail(email: string, password: string) {
  const data = await auth('/sign-in/email', { email, password })
  set({ status: 'signedIn', user: data.user })
}

/** The deep link (`scheme: tavshil`) a native sign-in returns to. `tavshil://` must be in the accounts TRUSTED_ORIGINS. */
const NATIVE_CALLBACK_URL = 'tavshil://account/callback'

/** Where the accounts service sends the one-time token back: this app's own page, or its deep link. */
const callbackUrl = () =>
  Platform.OS === 'web' ? `${window.location.origin}/account/callback` : NATIVE_CALLBACK_URL

export async function signUpEmail(name: string, email: string, password: string) {
  const callbackURL = `${AUTH_URL}/handoff?return=${encodeURIComponent(callbackUrl())}`
  await auth('/sign-up/email', { name, email, password, callbackURL })
}

export async function requestPasswordReset(email: string) {
  await auth('/request-password-reset', { email, redirectTo: `${AUTH_URL}/reset-password` })
}

const RETURN_KEY = 'tavshil.returnTo'

/**
 * Google or Apple through the accounts service. On the web this leaves the page and comes back at
 * /account/callback; in the app it runs in the system browser sheet and finishes here.
 */
export async function signInWith(provider: 'google' | 'apple', returnTo = '/') {
  const start = `${AUTH_URL}/start/${provider}?return=${encodeURIComponent(callbackUrl())}`
  if (Platform.OS === 'web') {
    try {
      sessionStorage.setItem(RETURN_KEY, returnTo)
    } catch {}
    window.location.href = start
    return
  }
  const result = await WebBrowser.openAuthSessionAsync(start, NATIVE_CALLBACK_URL)
  if (result.type !== 'success') return // closed the sheet: not an error
  const params = Linking.parse(result.url).queryParams ?? {}
  if (typeof params.ott !== 'string') throw new Error('Sign-in didn’t finish. Please try again.')
  await completeHandoff(params.ott)
}

export async function completeHandoff(oneTimeToken: string) {
  const res = await fetch(`${AUTH_URL}/api/auth/one-time-token/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: oneTimeToken }),
    credentials: 'omit',
  })
  const token = res.headers.get('set-auth-token')
  const data = await res.json().catch(() => null)
  if (!res.ok || !token) throw new Error('That sign-in link has expired. Please try again.')
  tokenStore.set(token)
  set({ status: 'signedIn', user: data.user })
}

/** Local development only. */
export function signInDev(name: string) {
  const id = `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  tokenStore.set(id)
  set({ status: 'signedIn', user: { id, name, email: `${id}@localhost` } })
}

export async function signOut() {
  if (USE_MOCK) return
  if (!tokenStore.get()?.startsWith('dev-')) await auth('/sign-out', {}).catch(() => {})
  tokenStore.set(null)
  set({ status: 'signedOut', user: null })
}

/**
 * Deletes the account and its data (App Store 5.1.1(v)). The accounts service removes the login and tells Tavshil to
 * erase the rest. Credential users send their password; others need a session created in the last 24 hours.
 */
export async function deleteAccount(password?: string) {
  if (USE_MOCK) return
  if (!tokenStore.get()?.startsWith('dev-')) {
    try {
      await auth('/delete-user', password ? { password } : {})
    } catch (e) {
      if (e instanceof Error && /SESSION_EXPIRED|fresh/i.test(e.message))
        throw new Error('For your security, sign out, sign in again, then delete your account.')
      throw e
    }
  }
  tokenStore.set(null)
  set({ status: 'signedOut', user: null })
}

/** The API said 401: the token is gone or expired. */
export function expireSession() {
  if (USE_MOCK) return
  tokenStore.set(null)
  set({ status: 'signedOut', user: null })
}

/** Where to go after a social sign-in round trip. */
export function takeReturnTo(): string {
  try {
    const to = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return to && to.startsWith('/') ? to : '/'
  } catch {
    return '/'
  }
}
