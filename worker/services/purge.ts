/**
 * The routine purge. Deleting in Tavshil is soft (sync-friendly: BRIEF §1), so retired rows pile up and keep personal
 * data after an account or a recipe is deleted. Once a row has been retired for `RETENTION_DAYS` it is erased for good.
 *
 * What counts as retired: `deleted_at` is set, or (links, invites, API keys) `revoked_at` is set. A row is only
 * erased when no other row still points at it, so a child goes first and its parent on a later pass; a row that is
 * still referenced stays and is looked at again tomorrow. The tables, columns and references are read from the
 * database itself, so new tables are covered without touching this file. The recipe edit log has no `deleted_at`
 * (it is append-only), so its rows go with their version.
 *
 * Runs from the Worker's daily cron (`scheduled` in `index.ts`).
 */
export const RETENTION_DAYS = 30
const MAX_PASSES = 12
const DAY = 24 * 60 * 60 * 1000
/**
 * Rows that belong to a parent and have no meaning without it, listed by parent. They go when the parent goes (the
 * edit log is append-only and has no `deleted_at` of its own; the rest are live rows that were never retired one by
 * one when their version was deleted).
 */
const PARTS: Record<string, string[]> = {
  versions: [
    'version_edits',
    'ingredient_lines',
    'version_equipment',
    'version_tags',
    'version_dimensions',
  ],
}

interface Fk {
  child: string
  from: string
  parent: string
  to: string
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`

async function describeSchema(db: D1Database) {
  const tables = (
    await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%\\_fts%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations'`,
      )
      .all<{ name: string }>()
  ).results.map((r) => r.name)
  const columns = new Map<string, Set<string>>()
  const fks: Fk[] = []
  for (const t of tables) {
    const cols = await db
      .prepare(`SELECT name FROM pragma_table_info(?)`)
      .bind(t)
      .all<{ name: string }>()
    columns.set(t, new Set(cols.results.map((c) => c.name)))
    const list = await db
      .prepare(`SELECT "table" AS parent, "from", "to" FROM pragma_foreign_key_list(?)`)
      .bind(t)
      .all<{ parent: string; from: string; to: string | null }>()
    for (const f of list.results)
      fks.push({ child: t, from: f.from, parent: f.parent, to: f.to ?? 'id' })
  }
  return { tables, columns, fks }
}

/** Erases rows retired for more than `RETENTION_DAYS`. Returns how many rows were erased per table. */
export async function purgeRetired(
  db: D1Database,
  now = Date.now(),
  retentionDays = RETENTION_DAYS,
): Promise<Record<string, number>> {
  const cutoff = now - retentionDays * DAY
  const { tables, columns, fks } = await describeSchema(db)
  const erased: Record<string, number> = {}
  const count = (table: string, n: number) => {
    if (n) erased[table] = (erased[table] ?? 0) + n
  }

  /** The condition under which a retired row may be erased: old enough, and nothing but its own parts points at it. */
  const erasable = (table: string, ignore: Set<string>) => {
    const cols = columns.get(table)!
    const retired = [
      'deleted_at IS NOT NULL AND deleted_at < ?1',
      ...(cols.has('revoked_at') ? ['revoked_at IS NOT NULL AND revoked_at < ?1'] : []),
    ]
    const unreferenced = fks
      .filter((f) => f.parent === table && !ignore.has(f.child))
      .map(
        (f) =>
          `NOT EXISTS (SELECT 1 FROM ${q(f.child)} AS r WHERE r.${q(f.from)} = ${q(table)}.${q(f.to)}` +
          // A row may point at itself (a version's parent version): that is not a reason to keep it.
          `${f.child === table ? ' AND r.rowid <> ' + q(table) + '.rowid' : ''})`,
      )
    return `(${retired.join(' OR ')})${unreferenced.map((u) => ' AND ' + u).join('')}`
  }

  /** Parts go when their parent is erasable, so this runs before the parent itself is looked at. */
  const erasePartsOfRetired = async () => {
    let changed = 0
    for (const [parent, parts] of Object.entries(PARTS)) {
      if (!columns.has(parent)) continue
      const own = new Set(parts)
      for (const part of parts) {
        if (!columns.has(part)) continue
        const fk = fks.find((f) => f.child === part && f.parent === parent)
        if (!fk) continue
        const res = await db
          .prepare(
            `DELETE FROM ${q(part)} WHERE ${q(fk.from)} IN
             (SELECT ${q(fk.to)} FROM ${q(parent)} WHERE ${erasable(parent, own)})`,
          )
          .bind(cutoff)
          .run()
        count(part, res.meta.changes)
        changed += res.meta.changes
      }
    }
    return changed
  }

  const statements = tables
    .filter((t) => columns.get(t)!.has('deleted_at'))
    .map((table) => ({
      table,
      sql: `DELETE FROM ${q(table)} WHERE ${erasable(table, new Set())}`,
    }))

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = await erasePartsOfRetired()
    for (const s of statements) {
      const res = await db.prepare(s.sql).bind(cutoff).run()
      count(s.table, res.meta.changes)
      changed += res.meta.changes
    }
    if (!changed) break
  }
  return erased
}
