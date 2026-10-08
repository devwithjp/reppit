import { desc, eq, and, type SQL } from "drizzle-orm";
import { items } from "@gitit/db";
import { GitHubClient, ingestRepo, parseRepoRef, itemEmbeddingText, RULES } from "@gitit/core";
import { db } from "@/lib/db";
import { embedder, rateLimiter } from "@/lib/services";
import { requestUser, json, err } from "@/lib/request-user";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") ?? "hot";
  const kind = url.searchParams.get("kind");
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 25));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const d = await db();
  const where: SQL[] = [];
  if (kind === "repo" || kind === "skill" || kind === "mcp") where.push(eq(items.kind, kind));
  const order = sort === "top" ? desc(items.weightedScore) : sort === "new" ? desc(items.createdAt) : desc(items.hotScore);
  const rows = await d.select({
    id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description, language: items.language,
    stars: items.stars, upvotes: items.upvotes, downvotes: items.downvotes, healthScore: items.healthScore, commentCount: items.commentCount, createdAt: items.createdAt,
  }).from(items).where(where.length ? and(...where) : undefined).orderBy(order).limit(limit).offset(offset);
  return json({ items: rows });
}

/** Submit a repo: ingest from GitHub, embed, store. */
export async function POST(req: Request) {
  const { user } = await requestUser(req);
  if (!user) return err("Sign in to submit", 401);
  const rl = await rateLimiter().check(RULES.submitPerUser, `submit:${user.id}`);
  if (!rl.ok) return err("Submission limit reached for today", 429);
  const body = (await req.json().catch(() => ({}))) as { repo?: string };
  const ref = parseRepoRef(body.repo ?? "");
  if (!ref) return err("Provide a GitHub repo as owner/name or URL");
  const d = await db();
  const slug = `${ref.owner}/${ref.name}`;
  const [existing] = await d.select({ id: items.id, slug: items.slug }).from(items).where(and(eq(items.slug, slug), eq(items.kind, "repo")));
  if (existing) return json({ item: existing, existed: true });
  const row = await ingestRepo(new GitHubClient(), ref.owner, ref.name);
  if (!row) return err("Repo not found on GitHub", 404);
  const [embedding] = await embedder().embed([itemEmbeddingText(row)]);
  const [inserted] = await d.insert(items).values({ ...row, slug: row.slug, embedding, embeddedAt: new Date(), submittedBy: user.id }).returning({ id: items.id, slug: items.slug });
  return json({ item: inserted, existed: false }, { status: 201 });
}
