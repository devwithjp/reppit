import { search, normalizeQuery, RULES, type SearchResult } from "@gitit/core";
import { searchLog } from "@gitit/db";
import { db } from "@/lib/db";
import { cache, embedder, rateLimiter, clientIp } from "@/lib/services";
import { explainWithClaude } from "@/lib/explain";
import { requestUser, json, err } from "@/lib/request-user";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return err("q must be at least 3 characters");
  const language = url.searchParams.get("language") ?? undefined;
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "repo" || kindParam === "skill" || kindParam === "mcp" ? kindParam : undefined;
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));

  const { user, apiKeyId } = await requestUser(req);
  const rl = apiKeyId
    ? await rateLimiter().check(RULES.searchFreeKey, `search:key:${apiKeyId}`)
    : await rateLimiter().check(RULES.searchAnon, `search:ip:${clientIp(req)}`);
  if (!rl.ok) return json({ error: "Rate limit exceeded", limit: rl.limit, upgrade: "/account" }, { status: 429 });

  const normalized = normalizeQuery(q);
  const key = `search:${normalized}|${language ?? ""}|${kind ?? ""}|${limit}`;
  const cached = cache.get<SearchResult[]>(key);
  if (cached) return json({ results: cached, cached: true });

  const d = await db();
  let results = await search(d, embedder(), q, { language, kind, limit });
  results = await explainWithClaude(q, results);
  cache.set(key, results);
  d.insert(searchLog).values({ query: q, normalized, userId: user?.id ?? null, apiKeyId: apiKeyId ?? null, resultIds: results.map((r) => r.item.id), costUsd: 0 }).catch(() => {});
  return json({ results, cached: false });
}
