/**
 * Repository identity (DECISIONS.md "Repository identity is the numeric id, not the slug").
 *
 * - `items.github_id` is the identity of a repo; `items.slug` is a mutable label.
 * - When GitHub reports a different owner/name for a known id (rename or transfer), the slug is
 *   updated and the old one goes to `item_aliases`, so old URLs, fixtures and API calls resolve.
 * - Slugs compare case-insensitively, as GitHub's do.
 */
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { items, itemAliases, type Db, type Item, type NewItem } from "@gitit/db";
import { healthScore } from "./ranking";

export interface UpsertRepoResult {
  id: string;
  slug: string;
  /** inserted: new row. updated: same slug. renamed: slug changed. adopted: a legacy row without github_id was matched by slug. */
  action: "inserted" | "updated" | "renamed" | "adopted";
  previousSlug?: string;
  /** Other items whose stale label held this repo's canonical slug; they were relabelled `slug~id8`. */
  displaced: string[];
}

const lowerEq = (col: typeof items.slug | typeof itemAliases.slug, v: string) => sql`lower(${col}) = lower(${v})`;

/** Record that `itemId` was known as `slug` until `at`. Idempotent; keeps the latest seen_until. */
export async function recordAlias(db: Db, itemId: string, slug: string, at: Date = new Date()) {
  await db.insert(itemAliases).values({ itemId, slug, seenUntil: at })
    .onConflictDoUpdate({ target: [itemAliases.itemId, itemAliases.slug], set: { seenUntil: sql`greatest(${itemAliases.seenUntil}, excluded.seen_until)` } });
}

/**
 * Insert or update a repo row keyed by github_id.
 * `requestedSlug` is the owner/name we asked GitHub for; if GitHub answered under a different name,
 * the requested one is recorded as an alias too (e.g. asked facebook/react, got react/react).
 */
export async function upsertRepoItem(db: Db, row: NewItem, opts: { requestedSlug?: string; now?: Date } = {}): Promise<UpsertRepoResult> {
  if (row.kind && row.kind !== "repo") throw new Error("upsertRepoItem only handles repos");
  if (typeof row.githubId !== "number") throw new Error(`upsertRepoItem requires githubId (slug ${row.slug})`);
  const githubId = row.githubId;
  const now = opts.now ?? new Date();
  const requested = opts.requestedSlug?.trim();

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    let action: UpsertRepoResult["action"] = "updated";
    let [existing] = await t.select({ id: items.id, slug: items.slug }).from(items).where(eq(items.githubId, githubId));

    if (!existing) {
      // Legacy rows predate github_id. Adopt one if it sits at the slug we asked for or at the canonical slug.
      for (const candidate of [requested, row.slug]) {
        if (!candidate) continue;
        const [legacy] = await t.select({ id: items.id, slug: items.slug }).from(items)
          .where(and(eq(items.kind, "repo"), isNull(items.githubId), lowerEq(items.slug, candidate)));
        if (legacy) { existing = legacy; action = "adopted"; break; }
      }
    }

    // GitHub says row.slug belongs to githubId now. Any other row holding that label is stale.
    const displaced: string[] = [];
    const holders = await t.select({ id: items.id, slug: items.slug }).from(items)
      .where(and(eq(items.kind, "repo"), lowerEq(items.slug, row.slug), existing ? ne(items.id, existing.id) : undefined));
    for (const h of holders) {
      await t.update(items).set({ slug: `${h.slug}~${h.id.slice(0, 8)}`, updatedAt: now }).where(eq(items.id, h.id));
      await recordAlias(t, h.id, h.slug, now);
      displaced.push(h.id);
    }

    const { id: _id, createdAt: _c, submittedBy, upvotes: _u, downvotes: _d, weightedScore: _w, hotScore: _h, commentCount: _cc, ...fields } = row;
    let id: string;
    let previousSlug: string | undefined;
    if (existing) {
      id = existing.id;
      if (existing.slug.toLowerCase() !== row.slug.toLowerCase()) {
        previousSlug = existing.slug;
        if (action !== "adopted") action = "renamed";
        await recordAlias(t, id, existing.slug, now);
      }
      await t.update(items).set({ ...fields, githubId, updatedAt: now }).where(eq(items.id, id));
    } else {
      const [ins] = await t.insert(items).values({ ...fields, githubId, kind: "repo", submittedBy }).returning({ id: items.id });
      id = ins.id;
      action = "inserted";
    }
    if (requested && requested.toLowerCase() !== row.slug.toLowerCase() && requested.toLowerCase() !== previousSlug?.toLowerCase()) {
      await recordAlias(t, id, requested, now);
    }
    await refreshHealth(t, id, now);
    // The canonical slug is live again for this item (renamed back): it must not also be an alias of it.
    await t.delete(itemAliases).where(and(eq(itemAliases.itemId, id), lowerEq(itemAliases.slug, row.slug)));
    return { id, slug: row.slug, action, ...(previousSlug ? { previousSlug } : {}), displaced };
  });
}

export interface ResolvedItem {
  item: Item;
  /** True when `slug` matched an old name; `item.slug` is the canonical one to redirect to. */
  viaAlias: boolean;
}

/**
 * Resolve a slug to an item: live slug first (case-insensitive, exact case preferred), then the
 * most recently seen alias. A live slug always wins over an alias of another item.
 */
export async function resolveItemBySlug(db: Db, slug: string, opts: { kind?: Item["kind"] } = {}): Promise<ResolvedItem | null> {
  const s = slug.trim();
  if (!s) return null;
  const kindFilter = opts.kind ? eq(items.kind, opts.kind) : undefined;
  const [live] = await db.select().from(items)
    .where(and(lowerEq(items.slug, s), kindFilter))
    .orderBy(sql`(${items.slug} = ${s}) desc`)
    .limit(1);
  if (live) return { item: live, viaAlias: false };
  const [aliased] = await db.select({ item: items }).from(itemAliases)
    .innerJoin(items, eq(items.id, itemAliases.itemId))
    .where(and(lowerEq(itemAliases.slug, s), kindFilter))
    .orderBy(desc(itemAliases.seenUntil))
    .limit(1);
  return aliased ? { item: aliased.item, viaAlias: true } : null;
}

export async function findItemByGithubId(db: Db, githubId: number): Promise<Item | null> {
  const [row] = await db.select().from(items).where(eq(items.githubId, githubId));
  return row ?? null;
}

/**
 * Recompute health from the stored row, so it always reflects every known signal (issues,
 * deprecation, advisories) whichever ingester last wrote a subset of them.
 */
export async function refreshHealth(db: Db, itemId: string, now: Date = new Date()): Promise<number | null> {
  const [r] = await db.select({
    pushedAt: items.pushedAt, lastReleaseAt: items.lastReleaseAt, openIssues: items.openIssues, stars: items.stars,
    archived: items.archived, license: items.license, deprecated: items.deprecated, advisoriesOpen: items.advisoriesOpen,
  }).from(items).where(eq(items.id, itemId));
  if (!r) return null;
  const h = healthScore(r, now);
  await db.update(items).set({ healthScore: h }).where(eq(items.id, itemId));
  return h;
}

/** Write package signals for an item and refresh its health. `null` signals (a failed check) are a no-op. */
export async function applySignals(db: Db, itemId: string, s: {
  packageEcosystem: string | null; packageName: string | null; deprecated: boolean | null; deprecationMessage: string | null;
  advisoriesOpen: number | null; signalsCheckedAt: Date;
} | null, now: Date = new Date()) {
  if (!s) return false;
  await db.update(items).set({ ...s, updatedAt: now }).where(eq(items.id, itemId));
  await refreshHealth(db, itemId, now);
  return true;
}
