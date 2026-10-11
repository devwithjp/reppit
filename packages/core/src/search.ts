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
    | "githubId" | "lastReleaseAt" | "closedIssues" | "archived" | "deprecated" | "deprecationMessage" | "advisoriesOpen" | "openIssues" | "openPullRequests" | "packageEcosystem" | "packageName" | "installPackage" | "installOptions" | "installKind" | "releasesLastYear" | "publishedPackages" | "signalsCheckedAt">;
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
  /** What to install for this query, or null (an app, docs-only, or no verified primary package). */
  install: { ecosystem: string; name: string } | null;
}

/** `notIndexed: true` (with `results: []`) when nothing cleared the relevance floor. */
export interface SearchResults {
  results: SearchResult[];
  notIndexed: boolean;
  /**
   * Only for a one-word query with no exact name match (a name lookup that missed): items tagged with
   * the word in their name or topics, so the UI can say "requests is not in the index yet; related: …".
   * Never presented as matches.
   */
  related?: SearchResult[];
}

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
 * Admission by meaning: a query-relative outlier rule, not a fixed floor.
 *
 * For each query, the similarity of a fixed pseudo-random baseline of BASELINE_SIZE indexed items
 * (ordered by md5(id), so results are reproducible) gives the "pack": its median and a robust spread
 * (MAD × 1.4826). A candidate may pass on meaning alone when its similarity is
 *   - at least median + k × spread (a clear outlier for this query), and
 *   - within `margin` of the query's best match.
 * Real queries put a few items far above the pack; keyboard mash gives a flat distribution, so nothing
 * clears it. The local hashed embedder never admits on meaning (null). k and margin are tuned on the
 * eval fixtures, including junk negatives that must stay empty, never on held-out queries; override
 * with SEARCH_OUTLIER_K and SEARCH_OUTLIER_MARGIN.
 */
export const BASELINE_SIZE = 300;

/**
 * IDF-weighted relevance floor. A query term's weight is its inverse document frequency over the
 * index's heads (name, topics, description): ln((N + 1) / (df + 1)) + 0.1. Generic words ("self",
 * "hosted", "list", "tool") are frequent, so they weigh little without any hand list. A problem query
 * passes on words only if its most distinctive term matches in the head and the IDF-weighted coverage
 * (head 1, README-only 0.4) reaches IDF_COVERAGE_MIN. Tuned on the eval fixtures and negatives;
 * override with SEARCH_IDF_COVERAGE.
 */
export const IDF_COVERAGE_MIN = 0.6;
export const idfCoverageMin = (env: Record<string, string | undefined> = process.env) => {
  const v = Number(env.SEARCH_IDF_COVERAGE);
  return env.SEARCH_IDF_COVERAGE && Number.isFinite(v) ? v : IDF_COVERAGE_MIN;
};
export const idfWeight = (n: number, df: number) => Math.log((n + 1) / (df + 1)) + 0.1;

/**
 * IDF-weighted coverage and the index of the most distinctive term. hits: 2 head, 1 README only,
 * 0 absent. A term found in no head anywhere gets the highest weight and becomes the distinctive
 * term: nothing indexed is about it, which is the strongest sign the domain is not covered
 * ("self hosted password manager" when no password manager is indexed).
 */
export function idfCoverage(hits: number[], weights: number[]): { coverage: number; distinctive: number } {
  if (!hits.length) return { coverage: 0, distinctive: -1 };
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  const got = hits.reduce((a, h, i) => a + weights[i] * (h === 2 ? 1 : h === 1 ? 0.4 : 0), 0);
  const distinctive = weights.reduce((best, w, i) => (w > weights[best] ? i : best), 0);
  return { coverage: got / total, distinctive };
}

/** Head document frequency per term form-set, cached per database for 10 minutes. */
const dfCache = new WeakMap<object, { n: number; at: number; df: Map<string, number> }>();
async function termWeights(db: Db, alts: string[][]): Promise<number[]> {
  if (!alts.length) return [];
  const now = Date.now();
  let c = dfCache.get(db);
  if (!c || now - c.at > 10 * 60_000) { c = { n: -1, at: now, df: new Map() }; dfCache.set(db, c); }
  const keyOf = (forms: string[]) => forms.join("|");
  const missing = alts.filter((f) => !c!.df.has(keyOf(f)));
  if (missing.length || c.n < 0) {
    const tsv = sql.raw("items.search_tsv");
    const cols = missing.map((forms, i) => sql`count(*) filter (where ts_filter(${tsv}, ${HEAD}) @@ (${termQuery(forms)}))::int as ${sql.raw(`d${i}`)}`);
    const r = await db.execute(sql`select count(*)::int as n${cols.length ? sql`, ${sql.join(cols, sql`, `)}` : sql``} from ${items}`);
    const row = ((Array.isArray(r) ? r : (r as { rows: Record<string, number>[] }).rows) as Record<string, number>[])[0];
    c.n = Number(row.n);
    missing.forEach((forms, i) => c!.df.set(keyOf(forms), Number(row[`d${i}`])));
  }
  return alts.map((forms) => idfWeight(c!.n, c!.df.get(keyOf(forms)) ?? 0));
}
// k = 6, one step safer than the sweep's best (5): at 4 a junk query already leaks, and with only seven
// negative queries a one-step margin is too thin. Confident junk costs more trust than one eval miss.
export const OUTLIER_DEFAULTS = { k: 6, margin: 0.03 };
export function outlierRule(embedderName: string, env: Record<string, string | undefined> = process.env): { k: number; margin: number } | null {
  if (embedderName.startsWith("local")) return null;
  const k = Number(env.SEARCH_OUTLIER_K), margin = Number(env.SEARCH_OUTLIER_MARGIN);
  return {
    k: env.SEARCH_OUTLIER_K && Number.isFinite(k) ? k : OUTLIER_DEFAULTS.k,
    margin: env.SEARCH_OUTLIER_MARGIN && Number.isFinite(margin) ? margin : OUTLIER_DEFAULTS.margin,
  };
}

/** Median and MAD-based spread of a sample. */
export function robustStats(xs: number[]): { median: number; spread: number } {
  if (!xs.length) return { median: 0, spread: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const med = (v: number[]) => (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  const median = med(sorted);
  const mad = med(xs.map((x) => Math.abs(x - median)).sort((a, b) => a - b));
  return { median, spread: 1.4826 * mad };
}

/**
 * gte-small cosine similarities sit in a narrow band (about 0.75 to 0.95), so used raw they add a
 * near-constant to every candidate's relevance and barely rank. Rescale linearly from [lo, hi] to
 * [0, 1] before blending. Tuned on the eval fixtures only; override with SEARCH_SEMANTIC_SCALE="lo,hi".
 */
export const GTE_SMALL_SEMANTIC_SCALE: [number, number] = [0.82, 0.92];
export function semanticScale(embedderName: string, env: Record<string, string | undefined> = process.env): ((sim: number) => number) {
  const o = env.SEARCH_SEMANTIC_SCALE?.split(",").map(Number);
  const range = o && o.length === 2 && o.every(Number.isFinite) && o[1] > o[0] ? (o as [number, number]) : embedderName === "gte-small" ? GTE_SMALL_SEMANTIC_SCALE : null;
  if (!range) return (sim) => sim;
  const [lo, hi] = range;
  return (sim) => Math.max(0, Math.min(1, (sim - lo) / (hi - lo)));
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
  /** The query is one plain word (requests, fastapi, pdf): a name lookup, see search(). */
  singleWord: boolean;
  /** Per content term, the forms that count as a match (the term plus its synonyms). */
  alts: string[][];
}

/**
 * Generic qualifiers people add to problem queries. They say what kind of answer is wanted, not what
 * it is about, so they are not content words for the relevance floor.
 */
export const QUALIFIER_WORDS = new Set([
  "library", "libraries", "lib", "libs", "package", "packages", "framework", "frameworks", "tool", "tools", "module", "modules",
  "best", "simple", "easy", "fast", "faster", "fastest", "lightweight", "alternative", "alternatives", "modern", "good", "small",
  "tiny", "minimal", "popular", "better", "way", "than", "using", "use", "like", "similar", "recommended", "top",
]);

/**
 * Small, generic synonym groups for problem phrasing (no entry exists for a particular query). Any form
 * in a group matches any other. Multi-word forms match as phrases.
 */
export const SYNONYM_GROUPS: string[][] = [
  ["dataframe", "dataframes", "data frame", "data frames"],
  ["mock", "mocks", "mocking", "stub", "stubs", "fake", "fakes"],
  ["logging", "logger", "loggers", "log", "logs"],
  ["auth", "authentication", "authn", "login"],
  ["db", "database", "databases"],
  ["config", "configuration", "settings"],
  ["env", "environment"],
  ["cli", "command line", "command-line"],
  ["k8s", "kubernetes"],
  ["regex", "regexp", "regular expression", "regular expressions"],
  ["i18n", "internationalization", "localization", "l10n"],
  ["ml", "machine learning"],
  ["llm", "llms", "large language model", "large language models"],
  ["orm", "object relational mapper", "object relational mapping"],
  ["fsm", "finite state machine"],
  ["async", "asynchronous"],
  ["resize", "resizing", "resizer"],
  ["ui", "uis", "user interface", "user interfaces", "tui", "gui"],
];
const SYNONYMS = new Map<string, string[]>();
for (const g of SYNONYM_GROUPS) for (const w of g) SYNONYMS.set(w, g);
/** Multi-word forms, longest first, mapped to their group's single-word head ("data frame" → "dataframe"). */
const PHRASES = SYNONYM_GROUPS.flatMap((g) => {
  const head = g.find((w) => !w.includes(" ") && !w.includes("-")) ?? g[0];
  return g.filter((w) => w.includes(" ")).map((w) => [w, head] as const);
}).sort((a, b) => b[0].length - a[0].length);
/** Collapse multi-word synonym forms in a query into one term, so "data frame" is one word, not two. */
export function collapsePhrases(raw: string): string {
  let out = ` ${raw} `;
  for (const [form, head] of PHRASES) out = out.split(` ${form} `).join(` ${head} `);
  return out.trim();
}

export function parseQuery(query: string): ParsedQuery {
  const raw = query.trim().toLowerCase().replace(/\s+/g, " ");
  const keys = new Set<string>();
  if (raw) keys.add(raw);
  const gh = raw.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (gh) keys.add(gh[1]);
  const words = raw.split(" ");
  if (words.length > 1 && words.length <= 4) keys.add(words.join("-")); // "react hook form" -> react-hook-form
  const all = [...new Set(tokenize(collapsePhrases(raw)))];
  const languages = new Set(all.flatMap((t) => LANGUAGE_WORDS[t] ?? []));
  const topical = all.filter((t) => !LANGUAGE_WORDS[t]);
  const ecosystems = new Set([...languages].map((l) => LANGUAGE_ECOSYSTEMS[l]).filter((x): x is string => !!x));
  const identifier = !raw.includes(" ") && /[-_.@/]/.test(raw);
  const singleWord = !!raw && !raw.includes(" ") && !identifier;
  const content = topical.filter((t) => !QUALIFIER_WORDS.has(t));
  const terms = (content.length ? content : topical.length ? topical : all).slice(0, 8);
  const alts = terms.map((t) => SYNONYMS.get(t) ?? [t]);
  return { raw, exactKeys: [...keys].filter((k) => k.length >= 2 && k.length <= 120), terms, languages, ecosystems, identifier, singleWord, alts };
}

/** One form against both configs the document uses (simple for names, english for prose). */
const formQuery = (t: string) => t.includes(" ") || t.includes("-")
  ? sql`(phraseto_tsquery('english', ${t}) || phraseto_tsquery('simple', ${t}))`
  : sql`(plainto_tsquery('english', ${t}) || plainto_tsquery('simple', ${t}))`;
/** A content term: any of its forms (synonyms) matches. */
const termQuery = (forms: string[]) => sql.join(forms.map(formQuery), sql` || `);
/** Head = name, package, slug (A), topics (B), description (C). README is D. */
const HEAD = sql.raw(`'{a,b,c}'`);

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
    const optionFits = ecos ? sql.join([...pq.ecosystems].map((e) => sql`${items.installOptions} @> ${JSON.stringify([{ ecosystem: e }])}::jsonb`), sql` or `) : null;
    filters.push(ecos
      ? sql`(lower(${items.language}) in (${langs}) or ${items.packageEcosystem} in (${ecos}) or ${optionFits})`
      : sql`lower(${items.language}) in (${langs})`);
  }
  const live = [eq(items.archived, false), ...filters];

  // A failing query embedder (model not loadable on this host, edge function down) must not take
  // search down: fall back to full-text only, and say so in the log.
  let qv: number[] | null = null;
  try { [qv] = await embedder.embed([normalizeQuery(query) || pq.raw]); }
  catch (e) { console.warn(`[search] ${embedder.name} embedder failed, full-text only: ${(e as Error).message.slice(0, 120)}`); }
  const vec = qv ? `[${qv.join(",")}]` : null;
  const similarity = vec ? sql<number>`coalesce(1 - (${items.embedding} <=> ${vec}::vector), 0)` : sql<number>`0`;
  const anyTerm = pq.alts.length ? sql.join(pq.alts.map(termQuery), sql` || `) : null;
  const tsv = sql.raw("items.search_tsv");
  const keyList = pq.exactKeys.length ? sql.join(pq.exactKeys.map((k) => sql`${k}`), sql`, `) : null;
  const exactExpr = keyList
    ? sql<boolean>`(lower(${items.name}) in (${keyList}) or lower(${items.packageName}) in (${keyList}) or lower(${items.slug}) in (${keyList}))`
    : sql<boolean>`false`;

  const [semRows, lexRows, exactRows] = await Promise.all([
    vec ? db.select({ id: items.id, sim: similarity }).from(items).where(and(sql`${items.embedding} is not null`, ...live)).orderBy(desc(similarity)).limit(n) : Promise.resolve([] as { id: string; sim: number }[]),
    anyTerm
      ? db.select({ id: items.id }).from(items).where(and(sql`${tsv} @@ (${anyTerm})`, ...live)).orderBy(desc(sql`ts_rank(${tsv}, ${anyTerm})`)).limit(n)
      : Promise.resolve([] as { id: string }[]),
    keyList ? db.select({ id: items.id }).from(items).where(and(exactExpr, ...exactFilters)).limit(10) : Promise.resolve([] as { id: string }[]),
  ]);
  const ids = [...new Set([...exactRows, ...lexRows, ...semRows].map((r) => r.id))];
  if (ids.length === 0) return none();

  // Per term: 2 = in name, topics or description (head), 1 = README only, 0 = absent.
  const termHits = pq.alts.map((forms) => sql<number>`((ts_filter(${tsv}, ${HEAD}) @@ (${termQuery(forms)}))::int + (${tsv} @@ (${termQuery(forms)}))::int)`);
  // Name or topics only (A,B): what a one-word lookup may offer as "related".
  const tagged = pq.singleWord && pq.alts.length ? sql<boolean>`ts_filter(${tsv}, '{a,b}') @@ (${termQuery(pq.alts[0])})` : sql<boolean>`false`;
  const rows = await db.select({
    item: items,
    semantic: similarity,
    rank: anyTerm ? sql<number>`ts_rank(${tsv}, ${anyTerm})` : sql<number>`0`,
    hits: termHits.length ? sql<number[]>`array[${sql.join(termHits, sql`, `)}]` : sql<number[]>`array[]::int[]`,
    exact: exactExpr,
    // The whole query as a phrase in name/description/topics ("markdown parser" in marked's description).
    phrase: pq.terms.length > 1 ? sql<boolean>`ts_filter(${tsv}, ${HEAD}) @@ (phraseto_tsquery('english', ${pq.terms.join(" ")}) || phraseto_tsquery('simple', ${pq.terms.join(" ")}))` : sql<boolean>`false`,
    tagged,
  }).from(items).where(inArray(items.id, ids));

  const maxRank = Math.max(1e-9, ...rows.map((r) => Number(r.rank)));
  const weights = await termWeights(db, pq.alts);
  const coverageMin = idfCoverageMin();
  const scale = semanticScale(embedder.name);
  const rule = vec ? outlierRule(embedder.name) : null;
  let admitAt = Number.POSITIVE_INFINITY; // similarity needed to pass on meaning alone
  if (rule && semRows.length) {
    const sample = await db.select({ sim: similarity }).from(items).where(sql`${items.embedding} is not null`).orderBy(sql`md5(${items.id}::text)`).limit(BASELINE_SIZE);
    const { median, spread } = robustStats(sample.map((r) => Number(r.sim)));
    const best = Math.max(...semRows.map((r) => Number(r.sim)));
    admitAt = spread > 0 ? Math.max(median + rule.k * spread, best - rule.margin) : Number.POSITIVE_INFINITY;
  }
  const scored = rows.map((r) => {
    const semantic = Math.max(0, Number(r.semantic));
    const hits = (r.hits ?? []).map(Number);
    // IDF-weighted: README-only hits count 0.4 of a head hit (name, topics, description).
    const { coverage, distinctive } = idfCoverage(hits, weights);
    const headHits = hits.filter((h) => h === 2).length;
    const headAll = hits.length > 0 && headHits === hits.length;
    const lexical = 0.75 * coverage + 0.25 * (Number(r.rank) / maxRank);
    const exact = r.exact === true;
    const nameHit = pq.terms.some((t) => t === r.item.name.toLowerCase() || t === r.item.packageName?.toLowerCase());
    const lang = r.item.language?.toLowerCase();
    const ecoFits = (!!r.item.packageEcosystem && pq.ecosystems.has(r.item.packageEcosystem)) || (r.item.installOptions ?? []).some((o) => pq.ecosystems.has(o.ecosystem));
    const langMismatch = pq.languages.size > 0 && !ecoFits && !(lang && pq.languages.has(lang));
    const phrase = r.phrase === true;
    let relevance = 0.55 * lexical + 0.45 * scale(semantic) + (nameHit ? 0.2 : 0) + (phrase ? 0.15 : 0);
    if (langMismatch) relevance *= 0.6;
    relevance = Math.min(1, relevance);
    const match: MatchKind = exact ? "exact" : headAll && (phrase || hits.length <= 2 || nameHit) ? "strong" : "partial";
    /*
     * Relevance floor. Exact name matches always pass. Otherwise:
     *   - one plain word (requests, fastapi): a name lookup. Only exact matches are results; items
     *     tagged with the word (name, topics) come back separately as `related`.
     *   - an identifier (express-rate-limit): the whole identifier as a phrase in the head.
     *   - a problem query, on words: the most distinctive content term (highest IDF) must match in the
     *     head, and IDF-weighted coverage must reach idfCoverageMin(). Qualifiers ("library", "faster")
     *     are dropped and synonyms allowed. Or: the content words as a phrase in the head.
     *   - a problem query, on meaning: a clear semantic outlier for this query (outlierRule) that also
     *     contains the most distinctive term somewhere (head or README). Meaning alone, with none of
     *     the query's distinctive words, is not enough for a multi-word query.
     *   - a language named in the query filters; a mismatch never passes.
     */
    const distinctHit = distinctive >= 0 ? hits[distinctive] : 0;
    const lexicalPass = distinctHit === 2 && coverage >= coverageMin;
    const semanticPass = semantic >= admitAt && (hits.length <= 1 || distinctHit >= 1);
    const isMatch = exact || (
      !pq.singleWord &&
      !langMismatch &&
      (pq.identifier ? phrase || (hits.length === 1 && headAll) : lexicalPass || phrase || semanticPass)
    );
    const isRelated = !exact && pq.singleWord && r.tagged === true && !langMismatch;
    const inputs = { semantic: relevance, weightedScore: r.item.weightedScore, health: r.item.healthScore, stars: r.item.stars, installs: r.item.installs, archived: r.item.archived, deprecated: r.item.deprecated };
    // Exact matches are pinned above everything (tier -1); among them, flagged ones still sort last.
    const tier = exact ? -1 + rankTier(inputs) * 0.5 : rankTier(inputs);
    return { r, semantic, lexical, match, isMatch, isRelated, score: blendedRank(inputs), tier };
  });
  const matched = scored.filter((x) => x.isMatch && (x.match === "exact" || !x.r.item.archived));
  const relatedRows = scored.filter((x) => x.isRelated && !x.r.item.archived).sort(compareRank).slice(0, 3);

  if (matched.length === 0) {
    if (!relatedRows.length) return none();
    return { results: [], notIndexed: true, related: await decorate(db, relatedRows, pq) };
  }
  const ranked = matched.sort(compareRank).slice(0, limit);
  return { results: await decorate(db, ranked, pq), notIndexed: false };
}

type Scored = { r: { item: Item }; semantic: number; lexical: number; match: MatchKind; score: number };

/** The install to show for this query: a named language picks its registry's option (polars: PyPI for Python). */
export function chooseInstall(i: Pick<Item, "installPackage" | "installOptions" | "installKind" | "packageEcosystem">, ecosystems: Set<string>): { ecosystem: string; name: string } | null {
  if (i.installKind && i.installKind !== "package") return null;
  const byQuery = (i.installOptions ?? []).find((o) => ecosystems.has(o.ecosystem));
  if (byQuery) return byQuery;
  // The query names a language whose registry this repo does not publish to: no command from another
  // registry (an npm package is not the answer to a Python query); the UI links the install docs.
  if (ecosystems.size) return null;
  return i.installPackage && i.packageEcosystem ? { ecosystem: i.packageEcosystem, name: i.installPackage } : null;
}

async function decorate(db: Db, ranked: Scored[], pq: ParsedQuery): Promise<SearchResult[]> {
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

  return ranked.map(({ r, semantic, lexical, match, score }) => ({
    item: pick(r.item),
    score,
    semantic: round(semantic, 4),
    lexical: round(lexical, 4),
    match,
    install: chooseInstall(r.item, pq.ecosystems),
    why: explain(r.item, match, reasons.get(r.item.id) ?? {}, compat.get(r.item.id) ?? {}),
    downvoteReasons: reasons.get(r.item.id) ?? {},
    compat: compat.get(r.item.id) ?? {},
    trust: trustScore(r.item),
  }));
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
  if (i.installKind === "app") parts.push("an application: install it from its docs");
  else if (i.installPackage && i.packageEcosystem) parts.push(`${i.packageEcosystem}: ${i.installPackage}`);
  else if (i.publishedPackages?.length) parts.push(i.publishedPackages.length === 1 ? "publishes 1 package, not the one to install: see its docs" : `publishes ${i.publishedPackages.length} packages, none of them the one obvious install`);
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
    githubId, lastReleaseAt, closedIssues, archived, deprecated, deprecationMessage, advisoriesOpen, openIssues, openPullRequests, packageEcosystem, packageName, installPackage, installOptions, installKind, releasesLastYear, publishedPackages, signalsCheckedAt } = i;
  return { id, kind, slug, owner, name, url, description, language, stars, installs, healthScore, upvotes, downvotes, weightedScore, license, pushedAt,
    githubId, lastReleaseAt, closedIssues, archived, deprecated, deprecationMessage, advisoriesOpen, openIssues, openPullRequests, packageEcosystem, packageName, installPackage, installOptions, installKind, releasesLastYear, publishedPackages, signalsCheckedAt };
}
function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
