import { useSyncExternalStore } from 'react'

import { AUTH_URL, DEV_AUTH, USE_MOCK } from '@/lib/config'

import { tokenStore } from './tokens'

/** Mirrors Beitecha's account store: Better Auth on auth.baderech.app with bearer tokens, no cookies. */
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

let state: State = USE_MOCK
  ? { status: 'signedIn', user: { id: 'demo', name: 'Demo', email: 'demo@localhost' } }
  : { status: 'unknown', user: null }
const listeners = new Set<() => void>()
function set(next: State) {
  state = next
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
  if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Sign-in failed (${res.status})`)
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
  try {
    const data = await auth('/get-session')
    if (data?.user) set({ status: 'signedIn', user: data.user })
    else {
      tokenStore.set(null)
      set({ status: 'signedOut', user: null })
    }
  } catch {
    set({ status: 'signedOut', user: null })
  }
}

export async function signInEmail(email: string, password: string) {
  const data = await auth('/sign-in/email', { email, password })
  set({ status: 'signedIn', user: data.user })
}

export async function signUpEmail(name: string, email: string, password: string) {
  const callbackURL = `${AUTH_URL}/handoff?return=${encodeURIComponent(`${window.location.origin}/account/callback`)}`
  await auth('/sign-up/email', { name, email, password, callbackURL })
}

export async function requestPasswordReset(email: string) {
  await auth('/request-password-reset', { email, redirectTo: `${AUTH_URL}/reset-password` })
}

const RETURN_KEY = 'bishul.returnTo'

/** Leaves the page for the provider; comes back at /account/callback with a one-time token. */
export function signInWith(provider: 'google' | 'apple', returnTo = '/') {
  try {
    sessionStorage.setItem(RETURN_KEY, returnTo)
  } catch {}
  const back = `${window.location.origin}/account/callback`
  window.location.href = `${AUTH_URL}/start/${provider}?return=${encodeURIComponent(back)}`
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
