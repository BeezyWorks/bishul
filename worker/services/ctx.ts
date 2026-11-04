import { getTableColumns } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

import * as schema from '../db/schema'
import { ApiError } from '../http'

export { ApiError }
export { ulid } from '../db/ids'

export type Db = DrizzleD1Database<typeof schema>
export const openDb = (d1: D1Database): Db => drizzle(d1, { schema })

/** Which face of the service layer is calling (recorded on version edits). */
export type Via = 'web' | 'api' | 'mcp'

/** Who is acting: a user, in the household they belong to. Every service takes one. */
export interface Actor {
  userId: string
  householdId: string
  via: Via
}

// ---------------------------------------------------------------------------------------------------------------
// Errors. Services throw ApiError; the faces turn it into `{ error: { code, message } }` or an MCP tool error.

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`)
export const invalid = (message: string, details?: unknown) =>
  new ApiError(400, 'invalid', message, details)
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, 'conflict', message, details)
export const forbidden = (message: string) => new ApiError(403, 'forbidden', message)

// ---------------------------------------------------------------------------------------------------------------
// D1 helpers. D1 allows at most 100 bound parameters per statement, so lists are chunked.

const CHUNK = 80

export function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Runs `fn` over chunks of `ids` and concatenates the rows (for `WHERE x IN (...)` on long lists). */
export async function inChunks<T>(
  ids: string[],
  fn: (part: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = []
  for (const part of chunks([...new Set(ids)])) out.push(...(await fn(part)))
  return out
}

/** Inserts rows in D1 batches (one statement per row, so no statement exceeds the parameter limit). */
export async function insertMany<T extends SQLiteTable>(
  db: Db,
  table: T,
  rows: T['$inferInsert'][],
): Promise<void> {
  await batch(
    db,
    rows.map((r) => db.insert(table).values(r as never)),
  )
}

/** Runs prepared Drizzle statements as D1 batches (each a transaction). */
export async function batch(db: Db, stmts: unknown[]): Promise<void> {
  for (const part of chunks(stmts, 50)) {
    if (!part.length) continue
    await db.batch(part as never)
  }
}

export const columnCount = (table: SQLiteTable) => Object.keys(getTableColumns(table)).length

export const now = () => Date.now()

// ---------------------------------------------------------------------------------------------------------------
// Small pure helpers

export const unique = <T>(xs: T[]): T[] => [...new Set(xs)]

export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')

/** A random URL-safe token of `bytes` random bytes. */
export function randomToken(bytes = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** `HH:MM` (or `6:30 pm`) or minutes since midnight, to minutes since midnight. */
export function parseTime(t: string | number | null | undefined): number | null {
  if (t === null || t === undefined || t === '') return null
  if (typeof t === 'number') return Math.round(t)
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(t.trim())
  if (!m) throw invalid(`time must be like 18:30, got "${t}"`)
  let h = +m[1]
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0)
  if (h > 29 || +m[2] > 59) throw invalid(`time must be like 18:30, got "${t}"`)
  return h * 60 + +m[2]
}

export const clock = (minutes: number | null): string | null =>
  minutes === null
    ? null
    : `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export const isDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
