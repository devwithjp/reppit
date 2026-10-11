import { desc, eq } from "drizzle-orm";
import { items } from "@gitit/db";
import { GitHubClient, ingestRepo, parseRepoRef, itemEmbeddingText, resolveItemBySlug, upsertRepoItem, applySignals, checkPackageSignals, fetchManifestsRaw, trustScore, RULES } from "@gitit/core";
import { db } from "@/lib/db";
import { embedder, rateLimiter } from "@/lib/services";
import { requestUser } from "@/lib/request-user";
import { route, json, err, readJsonObject, intParam, limitByIp } from "../_lib/http";

const SORTS = new Set(["hot", "top", "new"]);
const KINDS = new Set(["repo", "skill", "mcp"]);

/** GET /api/items?sort=hot|top|new&kind=repo|skill|mcp&limit=1..50&offset=0..10000 */
export const GET = route("items GET", async (req) => {
  const limited = await limitByIp(req, RULES.readPerIp, "read");
  if (limited) return limited;
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") ?? "hot";
  if (!SORTS.has(sort)) return err("sort must be hot, top or new");
  const kind = url.searchParams.get("kind");
  if (kind !== null && !KINDS.has(kind)) return err("kind must be repo, skill or mcp");
  const limit = intParam(url.searchParams.get("limit"), 25, 1, 50);
  const offset = intParam(url.searchParams.get("offset"), 0, 0, 10_000);
  const d = await db();
  const order = sort === "top" ? desc(items.weightedScore) : sort === "new" ? desc(items.createdAt) : desc(items.hotScore);
  const rows = await d.select({
    id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description, language: items.language,
    stars: items.stars, upvotes: items.upvotes, downvotes: items.downvotes, healthScore: items.healthScore, commentCount: items.commentCount, createdAt: items.createdAt,
    pushedAt: items.pushedAt, lastReleaseAt: items.lastReleaseAt, archived: items.archived, deprecated: items.deprecated, advisoriesOpen: items.advisoriesOpen,
    openIssues: items.openIssues, closedIssues: items.closedIssues, packageName: items.packageName, packageEcosystem: items.packageEcosystem,
    weightedScore: items.weightedScore, license: items.license,
  }).from(items).where(kind ? eq(items.kind, kind as "repo" | "skill" | "mcp") : undefined).orderBy(order).limit(limit).offset(offset);
  return json({ items: rows.map((r) => ({ ...r, trust: trustScore(r) })) });
});

/** POST /api/items {repo: "owner/name" | URL}: ingest from GitHub, embed, store. Session or Bearer token. */
export const POST = route("items POST", async (req) => {
  const { user } = await requestUser(req);
  if (!user) return err(req.headers.get("authorization") ? "Invalid or revoked API token" : "Sign in to submit", 401);
  const rl = await rateLimiter().check(RULES.submitPerUser, `submit:${user.id}`);
  if (!rl.ok) return err("Submission limit reached for today", 429);
  const body = await readJsonObject(req);
  if (!body) return err("Body must be a JSON object");
  const ref = parseRepoRef(typeof body.repo === "string" ? body.repo : "");
  if (!ref) return err("Provide a GitHub repo as owner/name or URL");
  const d = await db();
  const slug = `${ref.owner}/${ref.name}`;
  const existing = await resolveItemBySlug(d, slug, { kind: "repo" });
  if (existing) return json({ item: { id: existing.item.id, slug: existing.item.slug }, existed: true });
  const row = await ingestRepo(new GitHubClient(), ref.owner, ref.name);
  if (!row) return err("Repo not found on GitHub", 404);
  const [embedding] = await embedder().embed([itemEmbeddingText(row)]);
  // Upsert by github_id: if GitHub answered under a new name we already hold, this updates that row
  // (and records the submitted name as an alias) instead of creating a duplicate.
  const res = await upsertRepoItem(d, { ...row, embedding, embeddedAt: new Date(), submittedBy: user.id }, { requestedSlug: slug });
  const signals = await checkPackageSignals([res.slug, slug], await fetchManifestsRaw(row.owner, row.name));
  await applySignals(d, res.id, signals);
  return json({ item: { id: res.id, slug: res.slug }, existed: res.action !== "inserted" }, { status: res.action === "inserted" ? 201 : 200 });
});
