/** Fetch wrapper for the Tavshil REST API (`/api/*`): bearer token, JSON in and out, typed errors. */
import { expireSession } from '@/features/account/store'
import { tokenStore } from '@/features/account/tokens'
import { API_URL } from '@/lib/config'

/** The server answered `{ error: { code, message } }` (or something went wrong reaching it). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
}

function queryString(q?: Query): string {
  if (!q) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const headers: Record<string, string> = { accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}${queryString(opts.query)}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach Tavshil. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: unknown }
  } | null
  if (res.status === 401) {
    expireSession()
    throw new ApiError(401, 'unauthorized', 'Your session has ended. Please sign in again.')
  }
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(
      res.status,
      e?.code ?? 'error',
      e?.message ?? `Something went wrong (${res.status}).`,
      e?.details,
    )
  }
  return data as T
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>(path, { query }),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
