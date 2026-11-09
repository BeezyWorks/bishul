import { and, desc, eq, isNull } from 'drizzle-orm'

import * as s from '../db/schema'
import { ApiError, invalid, notFound, randomToken, sha256Hex, type Actor, type Db } from './ctx'
import { ingredientDataSource } from './mappers'
import { requirePerson } from './people'
import { loadVersions, saveRecipe, type IngredientInput, type SaveRecipeInput } from './recipes'
import { loadCatalog } from './catalog'

// ---------------------------------------------------------------------------------------------------------------
// Sharing (BRIEF §10): a recipe link is live. Anyone with the link reads the recipe as it is now, so the author's
// edits show up for everyone following the link. A signed-in user can save a copy to their household; the copy is
// independent from then on (it keeps its lineage but not the author's later edits). Profile links are snapshots.

interface SnapshotIngredient {
  section?: string | null
  original: string
  name: string
  quantity: { amount: number; unit: 'g' | 'ml' | 'piece' } | null
  prepNote: string | null
  skipImpact: 'none' | 'minor' | 'ruins'
  catalog: {
    category: 'meat' | 'dairy' | 'parve' | 'fish'
    aliases: string[]
    allergens: string[]
    flags: Record<string, boolean>
    densityGPerMl: number | null
    gramsPerPiece: number | null
    source: 'ai' | 'user' | 'seed'
  } | null
}

interface SnapshotVersion {
  title: string
  description: string | null
  sourceLinks: { url: string; label?: string }[]
  servings: number | null
  course: string | null
  form: string | null
  category: 'meat' | 'dairy' | 'parve' | null
  difficulty: 'easy' | 'average' | 'a_pain' | null
  activeMinutes: number | null
  totalMinutes: number | null
  servingStyle: 'hot' | 'room_temperature' | 'cold' | null
  holdsOnBlech: boolean | null
  easyToDeliver: boolean | null
  cost: number | null
  nutrition: s.Nutrition | null
  prePrep: { step: string; leadMinutes: number }[]
  steps: { text: string; timerMinutes?: number; timerLabel?: string; section?: string; uses?: s.StepUse[] }[]
  flags: Record<string, boolean>
  equipment: { item: string; designation: 'meat' | 'dairy' | 'parve' | 'pesach' | null }[]
  dimensions: { name: string; fit: string }[]
  /** Absent on links shared before tags existed. */
  tags?: string[]
  ingredients: SnapshotIngredient[]
  lineageId: string
  /** Index of the parent in the dish's `versions`, for a dish link. */
  parentIndex: number | null
}

function snapshotVersion(
  v: Awaited<ReturnType<typeof loadVersions>> extends Map<string, infer V> ? V : never,
): SnapshotVersion {
  const x = v.version
  return {
    title: x.title,
    description: x.description,
    sourceLinks: x.sourceLinks ?? [],
    servings: x.servings,
    course: x.course,
    form: x.form,
    category: x.category,
    difficulty: x.difficulty,
    activeMinutes: x.activeMinutes,
    totalMinutes: x.totalMinutes,
    servingStyle: x.servingStyle,
    holdsOnBlech: x.holdsOnBlech,
    easyToDeliver: x.easyToDeliver,
    cost: x.cost,
    nutrition: x.nutrition,
    prePrep: (x.prePrep ?? []).map((p) => ({ step: p.step, leadMinutes: p.lead_minutes })),
    steps: (x.steps ?? []).map((st) => ({
      text: st.text,
      ...(st.timer_minutes && { timerMinutes: st.timer_minutes }),
      ...(st.timer_label && { timerLabel: st.timer_label }),
      ...(st.section && { section: st.section }),
      ...(st.uses?.length && { uses: st.uses }),
    })),
    flags: Object.fromEntries(Object.entries(x.flags ?? {}).map(([k, f]) => [k, !!f?.value])),
    equipment: v.equipment.map((e) => ({ item: e.item, designation: e.designation })),
    dimensions: v.dims.map((d) => ({ name: d.dimension.name, fit: d.fit })),
    tags: v.tags.map((t) => t.tag),
    ingredients: v.lines.map((l) => ({
      section: l.line.section,
      original: l.line.originalText,
      name: l.ingredient?.name ?? l.line.originalText,
      quantity:
        l.line.quantityMetric !== null
          ? {
              amount: l.line.quantityMetric,
              unit: (l.line.unitMetric ?? 'piece') as 'g' | 'ml' | 'piece',
            }
          : null,
      prepNote: l.line.prepNote,
      skipImpact: l.line.skipImpact,
      catalog: l.ingredient && {
        category: l.ingredient.category,
        aliases: l.ingredient.aliases ?? [],
        allergens: (l.ingredient.allergens ?? []).map((a) => a.tag),
        flags: Object.fromEntries(
          Object.entries(l.ingredient.flags ?? {}).map(([k, f]) => [k, !!f?.value]),
        ),
        densityGPerMl: l.ingredient.densityGPerMl,
        gramsPerPiece: l.ingredient.gramsPerPiece,
        source: ingredientDataSource(l.ingredient),
      },
    })),
    lineageId: x.lineageId,
    parentIndex: null,
  }
}

export interface ShareInput {
  kind: 'version' | 'dish' | 'profile'
  /** Version id, recipe id, or person id. */
  targetId: string
}

/** The recipe content of a version or dish link, built from the recipe as it is now; null if it is gone. */
async function recipeSnapshot(
  db: Db,
  householdId: string,
  kind: 'version' | 'dish',
  targetId: string,
): Promise<{ title: string; snapshot: Record<string, unknown> } | null> {
  if (kind === 'version') {
    const v = (await loadVersions(db, householdId, [targetId])).get(targetId)
    if (!v) return null
    return {
      title: v.recipe.title,
      snapshot: { kind: 'version', recipe: { title: v.recipe.title }, version: snapshotVersion(v) },
    }
  }
  const [recipe] = await db
    .select()
    .from(s.recipes)
    .where(
      and(
        eq(s.recipes.id, targetId),
        eq(s.recipes.householdId, householdId),
        isNull(s.recipes.deletedAt),
      ),
    )
  if (!recipe) return null
  const rows = await db
    .select({ id: s.recipeVersions.id, parent: s.recipeVersions.parentVersionId })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.recipeId, recipe.id), isNull(s.recipeVersions.deletedAt)))
    .orderBy(s.recipeVersions.createdAt)
  const loaded = await loadVersions(
    db,
    householdId,
    rows.map((r) => r.id),
  )
  return {
    title: recipe.title,
    snapshot: {
      kind: 'dish',
      recipe: { title: recipe.title },
      versions: rows.map((r) => ({
        ...snapshotVersion(loaded.get(r.id)!),
        parentIndex: r.parent ? rows.findIndex((x) => x.id === r.parent) : null,
      })),
    },
  }
}

export async function createShare(db: Db, actor: Actor, publicUrl: string, input: ShareInput) {
  const urlFor = (token: string) => `${publicUrl.replace(/\/$/, '')}/s/${token}`
  let snapshot: unknown
  let title = ''
  if (input.kind !== 'profile') {
    const built = await recipeSnapshot(db, actor.householdId, input.kind, input.targetId)
    if (!built) throw notFound(input.kind === 'version' ? 'Recipe version' : 'Recipe')
    title = built.title
    snapshot = built.snapshot
    // One live link per recipe and person: sharing again hands back the same link.
    const [existing] = await db
      .select()
      .from(s.shareLinks)
      .where(
        and(
          eq(s.shareLinks.createdBy, actor.userId),
          eq(s.shareLinks.kind, input.kind),
          eq(s.shareLinks.targetId, input.targetId),
          isNull(s.shareLinks.revokedAt),
          isNull(s.shareLinks.deletedAt),
        ),
      )
    if (existing)
      return {
        id: existing.id,
        token: existing.token,
        kind: input.kind,
        title,
        url: urlFor(existing.token),
        createdAt: existing.createdAt,
      }
  } else {
    const acc = await requirePerson(db, actor, input.targetId)
    if (acc.relation !== 'own') throw invalid('Only a person in your own household can be shared')
    const cons = await db
      .select()
      .from(s.constraints)
      .where(
        and(
          eq(s.constraints.personId, acc.person.id),
          isNull(s.constraints.layerHouseholdId),
          isNull(s.constraints.deletedAt),
        ),
      )
    const rules = await db
      .select()
      .from(s.personRules)
      .where(
        and(
          eq(s.personRules.personId, acc.person.id),
          isNull(s.personRules.layerHouseholdId),
          isNull(s.personRules.deletedAt),
        ),
      )
    title = acc.person.name
    // The person's own data only: never anything a household added about them.
    snapshot = {
      kind: 'profile',
      person: { name: acc.person.name, isChild: acc.person.isChild },
      constraints: cons.map((c) => ({
        tagType: c.tagType,
        tag: c.tag,
        kind: c.kind,
        severity: c.severity,
        activeWhen: c.activeWhen,
        note: c.note,
      })),
      rules: rules.map((r) => r.rule),
    }
  }
  const token = randomToken(18)
  const [row] = await db
    .insert(s.shareLinks)
    .values({
      token,
      kind: input.kind,
      targetId: input.targetId,
      snapshot: { ...(snapshot as object), sharedAt: Date.now() },
      createdBy: actor.userId,
    })
    .returning()
  return {
    id: row.id,
    token,
    kind: input.kind,
    title,
    url: urlFor(token),
    createdAt: row.createdAt,
  }
}

export async function listShares(db: Db, actor: Actor, publicUrl: string) {
  const rows = await db
    .select()
    .from(s.shareLinks)
    .where(
      and(
        eq(s.shareLinks.createdBy, actor.userId),
        isNull(s.shareLinks.revokedAt),
        isNull(s.shareLinks.deletedAt),
      ),
    )
    .orderBy(desc(s.shareLinks.createdAt))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    targetId: r.targetId,
    url: `${publicUrl.replace(/\/$/, '')}/s/${r.token}`,
    createdAt: r.createdAt,
  }))
}

export async function revokeShare(db: Db, actor: Actor, idOrToken: string) {
  const [row] = await db
    .select()
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.createdBy, actor.userId), isNull(s.shareLinks.deletedAt)))
    .then((rows) =>
      rows.filter(
        (r) => r.id === idOrToken || r.token === idOrToken || idOrToken.endsWith(`/s/${r.token}`),
      ),
    )
  if (!row) throw notFound('Share link')
  await db.update(s.shareLinks).set({ revokedAt: Date.now() }).where(eq(s.shareLinks.id, row.id))
  return { revoked: true }
}

/**
 * The public read: no account needed. A recipe link shows the recipe as it is now; if the recipe has since been
 * deleted, the last copy stored with the link is shown. Profile links are the snapshot taken when shared.
 */
export async function getShared(db: Db, token: string) {
  const [row] = await db.select().from(s.shareLinks).where(eq(s.shareLinks.token, token))
  if (!row) throw notFound('Share link')
  if (row.revokedAt) throw new ApiError(410, 'revoked', 'The sender has turned this link off')
  if (row.kind !== 'profile') {
    const [owner] = await db
      .select({ householdId: s.recipes.householdId })
      .from(s.recipes)
      .where(
        row.kind === 'dish'
          ? eq(s.recipes.id, row.targetId)
          : eq(
              s.recipes.id,
              db
                .select({ id: s.recipeVersions.recipeId })
                .from(s.recipeVersions)
                .where(eq(s.recipeVersions.id, row.targetId)),
            ),
      )
    const live = owner && (await recipeSnapshot(db, owner.householdId, row.kind, row.targetId))
    if (live)
      return { ...live.snapshot, sharedAt: (row.snapshot as { sharedAt?: number }).sharedAt }
  }
  return { kind: row.kind, ...(row.snapshot as object) }
}

function toInput(v: SnapshotVersion): SaveRecipeInput {
  const ingredients: IngredientInput[] = v.ingredients.map((i) => ({
    text: i.original,
    section: i.section,
    name: i.name,
    quantity: i.quantity?.amount,
    unit: i.quantity && i.quantity.unit !== 'piece' ? i.quantity.unit : undefined,
    prepNote: i.prepNote ?? undefined,
    skipImpact: i.skipImpact,
    ...(i.catalog && {
      ingredient: {
        category: i.catalog.category,
        aliases: i.catalog.aliases,
        allergens: i.catalog.allergens,
        flags: i.catalog.flags,
        densityGPerMl: i.catalog.densityGPerMl ?? undefined,
        gramsPerPiece: i.catalog.gramsPerPiece ?? undefined,
        // Someone else's data: user-vouched stays user, anything else stays AI-labelled.
        source: i.catalog.source === 'user' ? ('user' as const) : ('ai' as const),
      },
    }),
  }))
  return {
    title: v.title,
    description: v.description,
    sourceLinks: v.sourceLinks,
    servings: v.servings,
    course: v.course,
    form: v.form,
    category: v.category,
    difficulty: v.difficulty,
    activeMinutes: v.activeMinutes,
    totalMinutes: v.totalMinutes,
    servingStyle: v.servingStyle,
    holdsOnBlech: v.holdsOnBlech,
    easyToDeliver: v.easyToDeliver,
    cost: v.cost,
    nutrition: v.nutrition,
    prePrep: v.prePrep,
    steps: v.steps.map(({ uses, ...st }) => ({
      ...st,
      ...(uses && { uses: uses.map((u) => ({ ingredient: u.line, portion: u.portion })) }),
    })),
    flags: v.flags,
    equipment: v.equipment,
    dimensions: v.dimensions.map((d) => ({ dimension: d.name, fit: d.fit })),
    tags: v.tags ?? [],
    ingredients,
  }
}

/** Saves a shared recipe into the household as an independent copy that keeps the original's lineage. */
export async function saveShared(db: Db, actor: Actor, token: string) {
  const shared = (await getShared(db, token)) as {
    kind: string
    recipe?: { title: string }
    version?: SnapshotVersion
    versions?: SnapshotVersion[]
  }
  if (shared.kind === 'profile')
    throw invalid('This is a profile link. Use link_contact on a contact to link it.')
  const versions = shared.kind === 'version' ? [shared.version!] : shared.versions!
  const created: string[] = []
  let recipeId: string | undefined
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i]
    const res = await saveRecipe(db, actor, {
      ...toInput(v),
      ...(recipeId ? { recipeId } : { recipeTitle: shared.recipe!.title }),
    })
    recipeId = res.version.recipeId
    await db
      .update(s.recipeVersions)
      .set({
        lineageId: v.lineageId,
        parentVersionId:
          v.parentIndex !== null && v.parentIndex >= 0 ? created[v.parentIndex] : null,
      })
      .where(eq(s.recipeVersions.id, res.version.id))
    created.push(res.version.id)
  }
  return { recipeId: recipeId!, versionIds: created }
}

// ---------------------------------------------------------------------------------------------------------------
// API keys (BRIEF §11): hashed, scoped read or write. The key is shown once.

const KEY_RE = /^tsk_[0-9a-f]{40}$/
const LAST_USED_EVERY_MS = 5 * 60_000

export async function createApiKey(db: Db, userId: string, scope: 'read' | 'write') {
  const raw = new Uint8Array(20)
  crypto.getRandomValues(raw)
  const key = `tsk_${[...raw].map((b) => b.toString(16).padStart(2, '0')).join('')}`
  const [row] = await db
    .insert(s.apiKeys)
    .values({ userId, hashedKey: await sha256Hex(key), prefix: key.slice(0, 12), scope })
    .returning()
  return {
    id: row.id,
    key,
    prefix: row.prefix,
    scope,
    createdAt: row.createdAt,
    note: 'Copy this key now: it is shown only once.',
  }
}

export async function listApiKeys(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(s.apiKeys)
    .where(and(eq(s.apiKeys.userId, userId), isNull(s.apiKeys.deletedAt)))
    .orderBy(desc(s.apiKeys.createdAt))
  return rows.map((r) => ({
    id: r.id,
    prefix: r.prefix,
    scope: r.scope,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  }))
}

export async function revokeApiKey(db: Db, userId: string, id: string) {
  const res = await db
    .update(s.apiKeys)
    .set({ revokedAt: Date.now() })
    .where(and(eq(s.apiKeys.id, id), eq(s.apiKeys.userId, userId)))
    .returning({ id: s.apiKeys.id })
  if (!res.length) throw notFound('API key')
  return { revoked: true }
}

/** The user and scope behind a `tsk_…` key, or null (unknown, malformed or revoked). */
export async function authenticateApiKey(db: Db, raw: string) {
  if (!KEY_RE.test(raw)) return null
  const [row] = await db
    .select()
    .from(s.apiKeys)
    .where(
      and(
        eq(s.apiKeys.hashedKey, await sha256Hex(raw)),
        isNull(s.apiKeys.revokedAt),
        isNull(s.apiKeys.deletedAt),
      ),
    )
  if (!row) return null
  const now = Date.now()
  if (!row.lastUsedAt || now - row.lastUsedAt > LAST_USED_EVERY_MS)
    await db.update(s.apiKeys).set({ lastUsedAt: now }).where(eq(s.apiKeys.id, row.id))
  return { userId: row.userId, scope: row.scope, keyId: row.id }
}

export { loadCatalog }
