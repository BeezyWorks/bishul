import type { DisplayPrefs } from '@tavshil/core'
import { and, eq, isNull } from 'drizzle-orm'

import * as s from '../db/schema'
import type { Actor, Db } from './ctx'

/** Display preferences (BRIEF §7): US or metric, plus per-category overrides (flour and sugar in grams, ...). */
export async function getPrefs(db: Db, actor: Pick<Actor, 'userId'>) {
  const [row] = await db
    .select()
    .from(s.userPrefs)
    .where(and(eq(s.userPrefs.userId, actor.userId), isNull(s.userPrefs.deletedAt)))
  const system = row?.system ?? 'us'
  const overrides = row?.overrides ?? {}
  const display: DisplayPrefs = { system, overrides }
  return { system, overrides, display }
}

export async function setPrefs(
  db: Db,
  actor: Actor,
  input: { system?: 'us' | 'metric'; overrides?: Record<string, s.UnitOverride> },
) {
  const [row] = await db.select().from(s.userPrefs).where(eq(s.userPrefs.userId, actor.userId))
  if (row)
    await db
      .update(s.userPrefs)
      .set({
        ...(input.system && { system: input.system }),
        ...(input.overrides && { overrides: input.overrides }),
        deletedAt: null,
      })
      .where(eq(s.userPrefs.id, row.id))
  else
    await db.insert(s.userPrefs).values({
      userId: actor.userId,
      system: input.system ?? 'us',
      overrides: input.overrides ?? {},
    })
  const { system, overrides } = await getPrefs(db, actor)
  return { system, overrides }
}
