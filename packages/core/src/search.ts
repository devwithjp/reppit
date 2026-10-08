import { sql, eq, and, inArray, desc } from "drizzle-orm";
import { items, votes, agentCompatReports, type Db, type Item } from "@gitit/db";
import { blendedRank } from "./ranking";
import type { Embedder } from "./embeddings";

export interface SearchOptions {
  language?: string;
  kind?: "repo" | "skill" | "mcp";
  limit?: number;       // final results, default 5
  candidates?: number;  // semantic candidates to rerank, default 50
}

export interface SearchResult {
  item: Pick<Item, "id" | "kind" | "slug" | "owner" | "name" | "url" | "description" | "language" | "stars" | "installs" | "healthScore" | "upvotes" | "downvotes" | "weightedScore" | "license" | "pushedAt">;
  score: number;
  semantic: number;
  why: string;
  downvoteReasons: Record<string, number>;
  compat: Record<string, { works: number; broken: number }>;
}

export function normalizeQuery(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9+#. ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Semantic candidates → blended rerank → explanations. Pure data path, no paid placement. */
export async function search(db: Db, embedder: Embedder, query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  const limit = opts.limit ?? 5;
  const candidates = opts.candidates ?? 50;
  const [qv] = await embedder.embed([normalizeQuery(query)]);
  const vec = `[${qv.join(",")}]`;
  const similarity = sql<number>`1 - (${items.embedding} <=> ${vec}::vector)`;

  const where = [sql`${items.embedding} is not null`, eq(items.archived, false)];
  if (opts.language) where.push(sql`lower(${items.language}) = ${opts.language.toLowerCase()}`);
  if (opts.kind) where.push(eq(items.kind, opts.kind));

  const rows = await db
    .select({ item: items, semantic: similarity })
    .from(items)
    .where(and(...where))
    .orderBy(desc(similarity))
    .limit(candidates);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.item.id);
  const [reasonRows, compatRows] = await Promise.all([
    db.select({ itemId: votes.itemId, reason: votes.reason, n: sql<number>`count(*)::int` })
      .from(votes).where(and(inArray(votes.itemId, ids), eq(votes.direction, "down")))
      .groupBy(votes.itemId, votes.reason),
    db.select({ itemId: agentCompatReports.itemId, agent: agentCompatReports.agent, status: agentCompatReports.status, n: sql<number>`count(*)::int` })
      .from(agentCompatReports).where(inArray(agentCompatReports.itemId, ids))
      .groupBy(agentCompatReports.itemId, agentCompatReports.agent, agentCompatReports.status),
  ]);

  const reasons = new Map<string, Record<string, number>>();
  for (const r of reasonRows) {
    if (!r.reason) continue;
    const m = reasons.get(r.itemId) ?? {}; m[r.reason] = r.n; reasons.set(r.itemId, m);
  }
  const compat = new Map<string, Record<string, { works: number; broken: number }>>();
  for (const c of compatRows) {
    const m = compat.get(c.itemId) ?? {};
    const a = m[c.agent] ?? { works: 0, broken: 0 };
    a[c.status] = c.n; m[c.agent] = a; compat.set(c.itemId, m);
  }

  const ranked = rows.map((r) => {
    const semantic = Number(r.semantic);
    const score = blendedRank({ semantic, weightedScore: r.item.weightedScore, health: r.item.healthScore, stars: r.item.stars, installs: r.item.installs });
    return { r, semantic, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit);

  return ranked.map(({ r, semantic, score }) => ({
    item: pick(r.item),
    score,
    semantic: round(semantic, 4),
    why: explain(r.item, semantic, reasons.get(r.item.id) ?? {}, compat.get(r.item.id) ?? {}),
    downvoteReasons: reasons.get(r.item.id) ?? {},
    compat: compat.get(r.item.id) ?? {},
  }));
}

/** Template explanation. Swapped for an LLM-written line when ANTHROPIC_API_KEY is set (see apps/web). */
export function explain(i: Item, semantic: number, reasons: Record<string, number>, compat: Record<string, { works: number; broken: number }>): string {
  const parts: string[] = [];
  const net = i.upvotes - i.downvotes;
  if (net >= 5) parts.push(`+${net} community votes`);
  else if (net <= -3) parts.push(`${net} community votes`);
  if (i.healthScore >= 0.7) parts.push("actively maintained");
  else if (i.healthScore < 0.3) parts.push("low maintenance activity");
  if (i.stars >= 1000) parts.push(`${fmt(i.stars)} stars`);
  if (i.installs >= 1000) parts.push(`${fmt(i.installs)} installs`);
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (topReason && topReason[1] >= 2) parts.push(`flagged ${topReason[0]} by ${topReason[1]}`);
  const works = Object.entries(compat).filter(([, v]) => v.works > v.broken).map(([a]) => a);
  const broken = Object.entries(compat).filter(([, v]) => v.broken > v.works).map(([a]) => a);
  if (works.length) parts.push(`works on ${works.join(", ")}`);
  if (broken.length) parts.push(`reported broken on ${broken.join(", ")}`);
  const match = semantic >= 0.5 ? "strong match" : semantic >= 0.3 ? "good match" : "partial match";
  return `${match}${parts.length ? ": " + parts.join(", ") : ""}.`;
}

function pick(i: Item): SearchResult["item"] {
  const { id, kind, slug, owner, name, url, description, language, stars, installs, healthScore, upvotes, downvotes, weightedScore, license, pushedAt } = i;
  return { id, kind, slug, owner, name, url, description, language, stars, installs, healthScore, upvotes, downvotes, weightedScore, license, pushedAt };
}
function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n); }
function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
