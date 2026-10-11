import { search, normalizeQuery, RULES, TtlCache, type SearchResult } from "@gitit/core";
import { searchLog } from "@gitit/db";
import { db } from "@/lib/db";
import { embedder, rateLimiter, clientIp } from "@/lib/services";
import { explainWithClaude } from "@/lib/explain";
import { requestUser } from "@/lib/request-user";
import { route, json, err, intParam } from "../_lib/http";

const KINDS = new Set(["repo", "skill", "mcp"]);
const LANGUAGE_RE = /^[A-Za-z0-9+#. -]{1,40}$/;

// Bounded, TTL'd result cache keyed by normalised query (10 min, 2,000 entries, LRU). Shared across
// HMR reloads. Rate limits are applied before the cache, so cached answers still count.
type Answer = { results: SearchResult[]; notIndexed: boolean };
const g = globalThis as unknown as { __searchCache2?: TtlCache<Answer> };
const cache = (g.__searchCache2 ??= new TtlCache<Answer>(2000, 10 * 60_000));

/**
 * GET /api/search?q=...&language=...&kind=repo|skill|mcp&limit=1..10
 * → { results, notIndexed, cached }. notIndexed: true (with results: []) means nothing in the index
 * cleared the relevance floor: say "not in the index yet", never show weak matches.
 */
export const GET = route("search GET", async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return err("q must be at least 3 characters");
  if (q.length > 300) return err("q must be at most 300 characters");
  const language = url.searchParams.get("language")?.trim() || undefined;
  if (language && !LANGUAGE_RE.test(language)) return err("language is not valid");
  const kindParam = url.searchParams.get("kind");
  if (kindParam !== null && !KINDS.has(kindParam)) return err("kind must be repo, skill or mcp");
  const kind = (kindParam ?? undefined) as "repo" | "skill" | "mcp" | undefined;
  const limit = intParam(url.searchParams.get("limit"), 5, 1, 10);

  const { user, apiKeyId } = await requestUser(req);
  if (!user && req.headers.get("authorization")) return err("Invalid or revoked API token", 401);
  const rl = apiKeyId
    ? await rateLimiter().check(RULES.searchFreeKey, `search:key:${apiKeyId}`)
    : await rateLimiter().check(RULES.searchAnon, `search:ip:${clientIp(req)}`);
  if (!rl.ok) return json({ error: "Rate limit exceeded", limit: rl.limit, upgrade: "/account" }, { status: 429 });

  const normalized = normalizeQuery(q);
  if (!normalized) return err("q has no searchable words");
  const key = `${normalized}|${language?.toLowerCase() ?? ""}|${kind ?? ""}|${limit}`;
  const d = await db();
  const log = (results: SearchResult[]) =>
    d.insert(searchLog).values({ query: q.slice(0, 300), normalized, userId: user?.id ?? null, apiKeyId: apiKeyId ?? null, resultIds: results.map((r) => r.item.id), costUsd: 0 })
      .catch((e: unknown) => console.warn("[api search] log failed:", (e as Error).message));
  const headers = { "cache-control": "private, max-age=60" };

  const cached = cache.get(key);
  if (cached) { void log(cached.results); return json({ ...cached, cached: true }, { headers }); }

  const found = await search(d, embedder(), q, { language, kind, limit });
  const answer: Answer = { results: await explainWithClaude(q, found.results), notIndexed: found.notIndexed };
  cache.set(key, answer);
  void log(answer.results);
  return json({ ...answer, cached: false }, { headers });
});
