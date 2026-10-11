import { sql, eq, and, inArray, desc } from "drizzle-orm";
import { items, votes, agentCompatReports, type Db, type Item } from "@gitit/db";
import { blendedRank, rankTier, compareRank } from "./ranking";
import { tokenize, type Embedder } from "./embeddings";
import { trustScore, ago, type TrustScore } from "./trust";

export interface SearchOptions {
  language?: string;
  kind?: "repo" | "skill" | "mcp";
  limit?: number;       // final results, default 5
  candidates?: number;  // candidates per retriever (vector, lexical), default 50
}

export type MatchKind = "exact" | "strong" | "partial";

export interface SearchResult {
  item: Pick<Item, "id" | "kind" | "slug" | "owner" | "name" | "url" | "description" | "language" | "stars" | "installs" | "healthScore" | "upvotes" | "downvotes" | "weightedScore" | "license" | "pushedAt"
    | "githubId" | "lastReleaseAt" | "closedIssues" | "archived" | "deprecated" | "deprecationMessage" | "advisoriesOpen" | "openIssues" | "openPullRequests" | "packageEcosystem" | "packageName" | "installPackage" | "publishedPackages" | "signalsCheckedAt">;
  score: number;
  /** Vector similarity in [0, 1] (0 when the item has no embedding). */
  semantic: number;
  /** Lexical relevance in [0, 1]: query-term coverage plus normalised full-text rank. */
  lexical: number;
  /** exact = the query is this item's name, package name or owner/name; strong = every term matches
   *  its name, description or topics (as a phrase, when there are 3+ terms); partial = the rest of
   *  what cleared the relevance floor. */
  match: MatchKind;
  why: string;
  downvoteReasons: Record<string, number>;
  compat: Record<string, { works: number; broken: number }>;
  /** The shared trust score (core/trust.ts): same number the web, MCP server and CLI show. */
  trust: TrustScore;
}

/** `notIndexed: true` (with `results: []`) when nothing cleared the relevance floor. */
export interface SearchResults { results: SearchResult[]; notIndexed: boolean }

export function normalizeQuery(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9+#. ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Query words naming a language. They steer ranking (a mismatch is penalised) rather than count as topic terms. */
const LANGUAGE_WORDS: Record<string, string[]> = {
  python: ["python"], py: ["python"], rust: ["rust"], go: ["go"], golang: ["go"], java: ["java"], ruby: ["ruby"], php: ["php"],
  swift: ["swift"], kotlin: ["kotlin"], "c#": ["c#"], "c++": ["c++"], elixir: ["elixir"], scala: ["scala"], dart: ["dart"],
  typescript: ["typescript", "javascript"], javascript: ["typescript", "javascript"], js: ["typescript", "javascript"], ts: ["typescript", "javascript"],
  node: ["typescript", "javascript"], nodejs: ["typescript", "javascript"], "node.js": ["typescript", "javascript"], deno: ["typescript", "javascript"],
};

/**
 * Relevance floor. A candidate is a match only if it is an exact name match, covers at least half of
 * the query's terms lexically, or (real embedders only) its vector similarity reaches the floor. The
 * local hashed embedder gives keyboard mash a similarity of 0.3+, so it never qualifies on its own.
 * The real-embedder floor (0.45) is provisional until calibrated against eval; override with
 * SEARCH_SEMANTIC_FLOOR.
 */
export const MIN_COVERAGE = 0.5;
export function semanticFloor(embedderName: string, env: Record<string, string | undefined> = process.env): number {
  const o = Number(env.SEARCH_SEMANTIC_FLOOR);
  if (env.SEARCH_SEMANTIC_FLOOR && Number.isFinite(o)) return o;
  return embedderName.startsWith("local") ? Number.POSITIVE_INFINITY : 0.45;
}

/** Registry ecosystem for each language family, so "in python" also admits PyPI packages. */
const LANGUAGE_ECOSYSTEMS: Record<string, string> = { python: "PyPI", rust: "crates.io", go: "Go", typescript: "npm", javascript: "npm" };

export interface ParsedQuery {
  raw: string; exactKeys: string[]; terms: string[];
  /** Repo languages named in the query (lower-case). Non-empty = results are restricted to them. */
  languages: Set<string>;
  /** Registry ecosystems for those languages. */
  ecosystems: Set<string>;
  /** A single identifier-like token (express-rate-limit, socket.io, @scope/pkg): a name lookup. */
  identifier: boolean;
}

export function parseQuery(query: string): ParsedQuery {
  const raw = query.trim().toLowerCase().replace(/\s+/g, " ");
  const keys = new Set<string>();
  if (raw) keys.add(raw);
  const gh = raw.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (gh) keys.add(gh[1]);
  const words = raw.split(" ");
  if (words.length > 1 && words.length <= 4) keys.add(words.join("-")); // "react hook form" -> react-hook-form
  const all = [...new Set(tokenize(raw))];
  const languages = new Set(all.flatMap((t) => LANGUAGE_WORDS[t] ?? []));
  const topical = all.filter((t) => !LANGUAGE_WORDS[t]);
  const ecosystems = new Set([...languages].map((l) => LANGUAGE_ECOSYSTEMS[l]).filter((x): x is string => !!x));
  const identifier = !raw.includes(" ") && /[-_.@/]/.test(raw);
  return { raw, exactKeys: [...keys].filter((k) => k.length >= 2 && k.length <= 120), terms: (topical.length ? topical : all).slice(0, 8), languages, ecosystems, identifier };
}

/** One query term against both configs the document uses (simple for names, english for prose). */
const termQuery = (t: string) => sql`(plainto_tsquery('english', ${t}) || plainto_tsquery('simple', ${t}))`;

/**
 * Hybrid retrieval: vector candidates ∪ full-text candidates ∪ exact name matches, then a blended
 * rerank. Exact matches are pinned first (archived ones included, so a lookup shows the flag).
 * Otherwise archived items are excluded and deprecated ones demoted below every unflagged result.
 * Nothing clearing the relevance floor returns an empty list with `notIndexed: true`.
 */
export async function search(db: Db, embedder: Embedder, query: string, opts: SearchOptions = {}): Promise<SearchResults> {
  const limit = opts.limit ?? 5;
  const n = opts.candidates ?? 50;
  const none = (): SearchResults => ({ results: [], notIndexed: true });
  const pq = parseQuery(query);
  if (!pq.terms.length && !pq.exactKeys.length) return none();

  const filters = [];
  if (opts.language) filters.push(sql`lower(${items.language}) = ${opts.language.toLowerCase()}`);
  if (opts.kind) filters.push(eq(items.kind, opts.kind));
  const exactFilters = [...filters];
  // A language named in the query is a filter, not a hint: "cli argument parsing in rust" returns
  // Rust repos and crates only. Exact name lookups are not filtered.
  if (pq.languages.size) {
    const langs = sql.join([...pq.languages].map((l) => sql`${l}`), sql`, `);
    const ecos = pq.ecosystems.size ? sql.join([...pq.ecosystems].map((e) => sql`${e}`), sql`, `) : null;
    filters.push(ecos
      ? sql`(lower(${items.language}) in (${langs}) or ${items.packageEcosystem} in (${ecos}))`
      : sql`lower(${items.language}) in (${langs})`);
  }
  const live = [eq(items.archived, false), ...filters];

  const [qv] = await embedder.embed([normalizeQuery(query) || pq.raw]);
  const vec = `[${qv.join(",")}]`;
  const similarity = sql<number>`coalesce(1 - (${items.embedding} <=> ${vec}::vector), 0)`;
  const anyTerm = pq.terms.length ? sql.join(pq.terms.map(termQuery), sql` || `) : null;
  const tsv = sql.raw("items.search_tsv");
  const keyList = pq.exactKeys.length ? sql.join(pq.exactKeys.map((k) => sql`${k}`), sql`, `) : null;
  const exactExpr = keyList
    ? sql<boolean>`(lower(${items.name}) in (${keyList}) or lower(${items.packageName}) in (${keyList}) or lower(${items.slug}) in (${keyList}))`
    : sql<boolean>`false`;

  const [semRows, lexRows, exactRows] = await Promise.all([
    db.select({ id: items.id }).from(items).where(and(sql`${items.embedding} is not null`, ...live)).orderBy(desc(similarity)).limit(n),
    anyTerm
      ? db.select({ id: items.id }).from(items).where(and(sql`${tsv} @@ (${anyTerm})`, ...live)).orderBy(desc(sql`ts_rank(${tsv}, ${anyTerm})`)).limit(n)
      : Promise.resolve([] as { id: string }[]),
    keyList ? db.select({ id: items.id }).from(items).where(and(exactExpr, ...exactFilters)).limit(10) : Promise.resolve([] as { id: string }[]),
  ]);
  const ids = [...new Set([...exactRows, ...lexRows, ...semRows].map((r) => r.id))];
  if (ids.length === 0) return none();

  // Per term: 2 = in name/description/topics (weights A,B), 1 = README only, 0 = absent.
  const termHits = pq.terms.map((t) => sql<number>`((ts_filter(${tsv}, '{a,b}') @@ ${termQuery(t)})::int + (${tsv} @@ ${termQuery(t)})::int)`);
  const rows = await db.select({
    item: items,
    semantic: similarity,
    rank: anyTerm ? sql<number>`ts_rank(${tsv}, ${anyTerm})` : sql<number>`0`,
    hits: termHits.length ? sql<number[]>`array[${sql.join(termHits, sql`, `)}]` : sql<number[]>`array[]::int[]`,
    exact: exactExpr,
    // The whole query as a phrase in name/description/topics ("markdown parser" in marked's description).
    phrase: pq.terms.length > 1 ? sql<boolean>`ts_filter(${tsv}, '{a,b}') @@ (phraseto_tsquery('english', ${pq.terms.join(" ")}) || phraseto_tsquery('simple', ${pq.terms.join(" ")}))` : sql<boolean>`false`,
  }).from(items).where(inArray(items.id, ids));

  const maxRank = Math.max(1e-9, ...rows.map((r) => Number(r.rank)));
  const floor = semanticFloor(embedder.name);
  const scored = rows.map((r) => {
    const semantic = Math.max(0, Number(r.semantic));
    const hits = (r.hits ?? []).map(Number);
    const coverage = hits.length ? hits.reduce((a, h) => a + (h === 2 ? 1 : h === 1 ? 0.5 : 0), 0) / hits.length : 0;
    const headAll = hits.length > 0 && hits.every((h) => h === 2);
    const lexical = 0.75 * coverage + 0.25 * (Number(r.rank) / maxRank);
    const exact = r.exact === true;
    const nameHit = pq.terms.some((t) => t === r.item.name.toLowerCase() || t === r.item.packageName?.toLowerCase());
    const lang = r.item.language?.toLowerCase();
    const ecoFits = !!r.item.packageEcosystem && pq.ecosystems.has(r.item.packageEcosystem);
    const langMismatch = pq.languages.size > 0 && !ecoFits && !(lang && pq.languages.has(lang));
    const phrase = r.phrase === true;
    let relevance = 0.55 * lexical + 0.45 * semantic + (nameHit ? 0.2 : 0) + (phrase ? 0.15 : 0);
    if (langMismatch) relevance *= 0.6;
    relevance = Math.min(1, relevance);
    const match: MatchKind = exact ? "exact" : headAll && (phrase || hits.length <= 2 || nameHit) ? "strong" : "partial";
    // A one-word query is usually a name: a README mention alone is not a match. A partial match in
    // the wrong language (Go queue for a Node query) is noise, not a fallback.
    // A one-word query is usually a name: a README mention alone is not a match. A named language
    // filters (mismatches never pass). An identifier (express-rate-limit) is a name lookup: without an
    // exact match it must appear as a phrase in a name, description or topics; two of its three words
    // in a topic list (bull's "rate-limiter") is not it.
    const isMatch = exact || (
      (coverage >= MIN_COVERAGE || semantic >= floor) &&
      !(hits.length === 1 && !headAll && semantic < floor) &&
      !langMismatch &&
      !(pq.identifier && hits.length > 1 && !phrase)
    );
    const inputs = { semantic: relevance, weightedScore: r.item.weightedScore, health: r.item.healthScore, stars: r.item.stars, installs: r.item.installs, archived: r.item.archived, deprecated: r.item.deprecated };
    // Exact matches are pinned above everything (tier -1); among them, flagged ones still sort last.
    const tier = exact ? -1 + rankTier(inputs) * 0.5 : rankTier(inputs);
    return { r, semantic, lexical, match, isMatch, score: blendedRank(inputs), tier };
  }).filter((x) => x.isMatch && (x.match === "exact" || !x.r.item.archived));

  if (scored.length === 0) return none();
  const ranked = scored.sort(compareRank).slice(0, limit);

  const top = ranked.map((x) => x.r.item.id);
  const [reasonRows, compatRows] = await Promise.all([
    db.select({ itemId: votes.itemId, reason: votes.reason, n: sql<number>`count(*)::int` })
      .from(votes).where(and(inArray(votes.itemId, top), eq(votes.direction, "down")))
      .groupBy(votes.itemId, votes.reason),
    db.select({ itemId: agentCompatReports.itemId, agent: agentCompatReports.agent, status: agentCompatReports.status, n: sql<number>`count(*)::int` })
      .from(agentCompatReports).where(inArray(agentCompatReports.itemId, top))
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

  const results = ranked.map(({ r, semantic, lexical, match, score }) => ({
    item: pick(r.item),
    score,
    semantic: round(semantic, 4),
    lexical: round(lexical, 4),
    match,
    why: explain(r.item, match, reasons.get(r.item.id) ?? {}, compat.get(r.item.id) ?? {}),
    downvoteReasons: reasons.get(r.item.id) ?? {},
    compat: compat.get(r.item.id) ?? {},
    trust: trustScore(r.item),
  }));
  return { results, notIndexed: false };
}

const MATCH_LABEL: Record<MatchKind, string> = { exact: "Exact name match", strong: "Matches every term", partial: "Partial match" };

/**
 * Template explanation: the match basis, then decision facts (flags, maintenance, package, votes,
 * agent reports). Stars are deliberately absent: they are not a trust input. Unknown (null) signals
 * are never stated, and never as "0 advisories". Swapped for an LLM-written line when
 * ANTHROPIC_API_KEY is set (see apps/web).
 */
export function explain(i: Item, match: MatchKind, reasons: Record<string, number>, compat: Record<string, { works: number; broken: number }>, now: Date = new Date()): string {
  const parts: string[] = [];
  if (i.archived) parts.push("archived by its owner");
  if (i.deprecated === true) parts.push(`deprecated on ${i.packageEcosystem ?? "its registry"}${i.deprecationMessage ? ` (${truncate(i.deprecationMessage, 80)})` : ""}`);
  if (typeof i.advisoriesOpen === "number" && i.advisoriesOpen > 0) parts.push(`${i.advisoriesOpen} open security ${i.advisoriesOpen === 1 ? "advisory" : "advisories"} on the latest ${i.packageName ?? "release"}`);
  if (!i.archived && i.pushedAt) parts.push(`last push ${ago(i.pushedAt, now)}`);
  if (i.lastReleaseAt) parts.push(`last release ${ago(i.lastReleaseAt, now)}`);
  if (i.installPackage && i.packageEcosystem) parts.push(`${i.packageEcosystem}: ${i.installPackage}`);
  else if (i.publishedPackages?.length) parts.push(`publishes ${i.publishedPackages.length} package${i.publishedPackages.length === 1 ? "" : "s"}, none of them the one obvious install`);
  if (i.advisoriesOpen === 0) parts.push("no open advisories");
  const net = i.upvotes - i.downvotes;
  if (net >= 5) parts.push(`+${net} community votes`);
  else if (net <= -3) parts.push(`${net} community votes`);
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (topReason && topReason[1] >= 2) parts.push(`flagged ${topReason[0]} by ${topReason[1]}`);
  const works = Object.entries(compat).filter(([, v]) => v.works > v.broken).map(([a]) => a);
  const broken = Object.entries(compat).filter(([, v]) => v.broken > v.works).map(([a]) => a);
  if (works.length) parts.push(`works on ${works.join(", ")}`);
  if (broken.length) parts.push(`reported broken on ${broken.join(", ")}`);
  return `${MATCH_LABEL[match]}${parts.length ? ": " + parts.join(", ") : ""}.`;
}

function pick(i: Item): SearchResult["item"] {
  const { id, kind, slug, owner, name, url, description, language, stars, installs, healthScore, upvotes, downvotes, weightedScore, license, pushedAt,
    githubId, lastReleaseAt, closedIssues, archived, deprecated, deprecationMessage, advisoriesOpen, openIssues, openPullRequests, packageEcosystem, packageName, installPackage, publishedPackages, signalsCheckedAt } = i;
  return { id, kind, slug, owner, name, url, description, language, stars, installs, healthScore, upvotes, downvotes, weightedScore, license, pushedAt,
    githubId, lastReleaseAt, closedIssues, archived, deprecated, deprecationMessage, advisoriesOpen, openIssues, openPullRequests, packageEcosystem, packageName, installPackage, publishedPackages, signalsCheckedAt };
}
function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
