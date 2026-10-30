import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { items, votes, agentCompatReports, type Db } from "@gitit/db";

/** Columns a list row needs. Never the embedding or the README. */
export const rowColumns = {
  id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description,
  language: items.language, license: items.license, stars: items.stars, openIssues: items.openIssues,
  pushedAt: items.pushedAt, lastReleaseAt: items.lastReleaseAt, archived: items.archived,
  deprecated: items.deprecated, deprecationMessage: items.deprecationMessage, advisoriesOpen: items.advisoriesOpen,
  closedIssues: items.closedIssues, packageName: items.packageName, packageEcosystem: items.packageEcosystem, installPackage: items.installPackage, publishedPackages: items.publishedPackages,
  healthScore: items.healthScore, upvotes: items.upvotes, downvotes: items.downvotes,
  weightedScore: items.weightedScore, commentCount: items.commentCount, createdAt: items.createdAt,
};

export type RowItem = {
  id: string; kind: string; slug: string; url: string; description: string | null; language: string | null;
  license: string | null; stars: number; openIssues: number | null; closedIssues: number | null; pushedAt: Date | null; lastReleaseAt: Date | null;
  archived: boolean; deprecated: boolean | null; deprecationMessage: string | null; advisoriesOpen: number | null;
  packageName: string | null; packageEcosystem: string | null; installPackage: string | null; publishedPackages: { ecosystem: string; name: string }[] | null; healthScore: number; upvotes: number; downvotes: number; weightedScore: number; commentCount: number;
};

export type Compat = Record<string, { works: number; broken: number }>;

export interface RowExtras {
  reasons: Map<string, Record<string, number>>; // downvote reason -> count
  compat: Map<string, Compat>;
  mine: Map<string, "up" | "down">;
}

/** Downvote reasons, agent reports and the viewer's own votes for a page of rows, in three queries. */
export async function loadExtras(d: Db, ids: string[], viewerId: string | null): Promise<RowExtras> {
  const out: RowExtras = { reasons: new Map(), compat: new Map(), mine: new Map() };
  if (ids.length === 0) return out;
  const [reasonRows, compatRows, mineRows] = await Promise.all([
    d.select({ itemId: votes.itemId, reason: votes.reason, n: sql<number>`count(*)::int` })
      .from(votes).where(and(inArray(votes.itemId, ids), eq(votes.direction, "down")))
      .groupBy(votes.itemId, votes.reason),
    d.select({ itemId: agentCompatReports.itemId, agent: agentCompatReports.agent, status: agentCompatReports.status, n: sql<number>`count(*)::int` })
      .from(agentCompatReports).where(inArray(agentCompatReports.itemId, ids))
      .groupBy(agentCompatReports.itemId, agentCompatReports.agent, agentCompatReports.status),
    viewerId
      ? d.select({ itemId: votes.itemId, direction: votes.direction }).from(votes).where(and(eq(votes.userId, viewerId), inArray(votes.itemId, ids)))
      : Promise.resolve([] as { itemId: string; direction: "up" | "down" }[]),
  ]);
  for (const r of reasonRows) {
    if (!r.reason) continue;
    const m = out.reasons.get(r.itemId) ?? {};
    m[r.reason] = Number(r.n);
    out.reasons.set(r.itemId, m);
  }
  for (const c of compatRows) {
    const m = out.compat.get(c.itemId) ?? {};
    const a = m[c.agent] ?? { works: 0, broken: 0 };
    a[c.status] = Number(c.n);
    m[c.agent] = a;
    out.compat.set(c.itemId, m);
  }
  for (const v of mineRows) out.mine.set(v.itemId, v.direction);
  return out;
}

/** Downvote reasons across the whole index in the last `days` days, largest first. */
export async function recentReasons(d: Db, days = 30): Promise<{ reason: string; n: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await d.select({ reason: votes.reason, n: sql<number>`count(*)::int` })
    .from(votes).where(and(eq(votes.direction, "down"), gte(votes.createdAt, since)))
    .groupBy(votes.reason);
  return rows.filter((r) => r.reason).map((r) => ({ reason: r.reason as string, n: Number(r.n) })).sort((a, b) => b.n - a.n);
}

/** How many MCP servers are indexed. The MCP tab and link appear only when this is above zero. */
export async function mcpCount(d: Db): Promise<number> {
  const [r] = await d.select({ n: sql<number>`count(*)::int` }).from(items).where(eq(items.kind, "mcp"));
  return Number(r?.n ?? 0);
}

export interface IndexCounts { repo: number; skill: number; mcp: number; total: number; unvoted: number }

export async function indexCounts(d: Db): Promise<IndexCounts> {
  const rows = await d.select({
    kind: items.kind,
    n: sql<number>`count(*)::int`,
    unvoted: sql<number>`count(*) filter (where ${items.upvotes} + ${items.downvotes} = 0)::int`,
  }).from(items).groupBy(items.kind);
  const c: IndexCounts = { repo: 0, skill: 0, mcp: 0, total: 0, unvoted: 0 };
  for (const r of rows) {
    c[r.kind] = Number(r.n);
    c.total += Number(r.n);
    c.unvoted += Number(r.unvoted);
  }
  return c;
}
