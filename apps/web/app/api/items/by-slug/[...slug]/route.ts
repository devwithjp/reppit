import { eq, and, desc } from "drizzle-orm";
import { comments, users, agentCompatReports } from "@gitit/db";
import { castVote, createComment, resolveItemBySlug, writeRefusal, VoteError, CommentError, RULES, type DownvoteReason } from "@gitit/core";
import { db } from "@/lib/db";
import { rateLimiter, clientIp } from "@/lib/services";
import { requestUser, suspensionRefusal } from "@/lib/request-user";
import { route, json, err, readJsonObject, limitByIp, itemPayload, UUID_RE } from "../../../_lib/http";

const ACTIONS = new Set(["vote", "comments", "compat"]);
const AGENTS = new Set(["claude-code", "codex", "cursor", "gemini-cli", "copilot", "windsurf", "other"]);
const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

type Ctx = { params: Promise<{ slug: string[] }> };

/** "owner/name[/path...]" plus an optional trailing action. Null for malformed slugs. */
async function parse(ctx: Ctx) {
  const segments = [...(await ctx.params).slug];
  const action = segments.length > 2 && ACTIONS.has(segments[segments.length - 1]) ? segments.pop()! : null;
  let decoded: string[];
  try { decoded = segments.map(decodeURIComponent); } catch { return null; }
  if (decoded.length < 2 || decoded.length > 12 || !decoded.every((s) => SEGMENT.test(s))) return null;
  return { slug: decoded.join("/"), action };
}

/**
 * GET /api/items/by-slug/{owner}/{name}
 * Resolves renamed/transferred repos through item_aliases. When the requested slug is an old name,
 * the item is returned with `redirect: { from, to }` so clients can update links; `canonicalSlug` is
 * always the current one.
 */
export const GET = route<Ctx>("items/by-slug GET", async (req, ctx) => {
  const limited = await limitByIp(req, RULES.readPerIp, "read");
  if (limited) return limited;
  const p = await parse(ctx);
  if (!p || p.action) return err("Not found", 404);
  const d = await db();
  const found = await resolveItemBySlug(d, p.slug);
  if (!found) return err("Not found", 404);
  const { item, viaAlias } = found;
  const [cmts, compat] = await Promise.all([
    d.select({ id: comments.id, body: comments.body, parentId: comments.parentId, createdAt: comments.createdAt, user: users.login })
      .from(comments).innerJoin(users, eq(users.id, comments.userId)).where(and(eq(comments.itemId, item.id), eq(comments.deleted, false))).orderBy(desc(comments.createdAt)).limit(50),
    d.select({ agent: agentCompatReports.agent, status: agentCompatReports.status, note: agentCompatReports.note, user: users.login, createdAt: agentCompatReports.createdAt })
      .from(agentCompatReports).innerJoin(users, eq(users.id, agentCompatReports.userId)).where(eq(agentCompatReports.itemId, item.id)).orderBy(desc(agentCompatReports.createdAt)).limit(50),
  ]);
  return json({
    ...itemPayload(item),
    canonicalSlug: item.slug,
    redirect: viaAlias ? { from: p.slug, to: item.slug } : null,
    comments: cmts,
    compatReports: compat,
  });
});

/**
 * POST /api/items/by-slug/{slug}/vote|comments|compat
 * Auth: session cookie or `Authorization: Bearer <personal token>` (revoked tokens are refused by
 * requestUser). A token needs the "write" scope (403 otherwise); session users are unaffected.
 * Writes are attributed to the token's owner. Old slugs resolve through aliases.
 */
export const POST = route<Ctx>("items/by-slug POST", async (req, ctx) => {
  const p = await parse(ctx);
  if (!p || !p.action) return err("Not found", 404);
  const { user, apiKeyId, scopes } = await requestUser(req);
  if (!user) return err(req.headers.get("authorization") ? "Invalid or revoked API token" : "Sign in required", 401);
  const suspended = suspensionRefusal(user);
  if (suspended) return err(suspended, 403);
  const refused = writeRefusal({ apiKeyId, scopes });
  if (refused) return err(refused, 403);
  const body = await readJsonObject(req);
  if (!body) return err("Body must be a JSON object");
  const d = await db();
  const found = await resolveItemBySlug(d, p.slug);
  if (!found) return err("Not found", 404);
  const item = found.item;

  if (p.action === "vote") {
    const [a, b] = await Promise.all([rateLimiter().check(RULES.votePerUser, `vote:u:${user.id}`), rateLimiter().check(RULES.votePerIp, `vote:ip:${clientIp(req)}`)]);
    if (!a.ok || !b.ok) return err("Too many votes, slow down", 429);
    const direction = body.direction === "up" || body.direction === "down" ? body.direction : body.direction === null ? null : undefined;
    if (direction === undefined) return err("direction must be up, down or null");
    if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") return err("reason must be a string");
    // The reason is passed through unfiltered: castVote is the single enforcement point for
    // "downvotes require a reason" and for rejecting unknown reason tags.
    const reason = (body.reason ?? null) as DownvoteReason | null;
    try {
      const scores = await castVote(d, user.id, item.id, direction, reason);
      return json({ ok: true, slug: item.slug, ...scores });
    } catch (e) { if (e instanceof VoteError) return err(e.message, e.status); throw e; }
  }

  if (p.action === "comments") {
    const rl = await rateLimiter().check(RULES.commentPerUser, `comment:${user.id}`);
    if (!rl.ok) return err("Too many comments", 429);
    const text = typeof body.body === "string" ? body.body : "";
    let parentId: string | null = null;
    if (body.parentId !== undefined && body.parentId !== null) {
      if (typeof body.parentId !== "string" || !UUID_RE.test(body.parentId)) return err("parentId must be a comment id");
      parentId = body.parentId;
    }
    try {
      const comment = await createComment(d, user.id, item.id, text, parentId);
      return json({ comment: { ...comment, user: user.login } }, { status: 201 });
    } catch (e) { if (e instanceof CommentError) return err(e.message, e.status); throw e; }
  }

  // compat
  const rl = await rateLimiter().check(RULES.votePerUser, `compat:u:${user.id}`);
  if (!rl.ok) return err("Too many reports, slow down", 429);
  const agent = typeof body.agent === "string" ? body.agent.toLowerCase() : "";
  const status = body.status === "works" || body.status === "broken" ? body.status : null;
  if (!AGENTS.has(agent) || !status) return err(`agent must be one of ${[...AGENTS].join(", ")}; status works|broken`);
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return err("note must be a string");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  await d.insert(agentCompatReports).values({ itemId: item.id, userId: user.id, agent, status, note })
    .onConflictDoUpdate({ target: [agentCompatReports.itemId, agentCompatReports.userId, agentCompatReports.agent], set: { status, note, createdAt: new Date() } });
  return json({ ok: true, slug: item.slug });
});

/** DELETE /api/items/by-slug/{slug}/vote: remove the caller's vote. */
export const DELETE = route<Ctx>("items/by-slug DELETE", async (req, ctx) => {
  const p = await parse(ctx);
  if (!p || p.action !== "vote") return err("Not found", 404);
  const { user, apiKeyId, scopes } = await requestUser(req);
  if (!user) return err(req.headers.get("authorization") ? "Invalid or revoked API token" : "Sign in required", 401);
  const refused = writeRefusal({ apiKeyId, scopes });
  if (refused) return err(refused, 403);
  const [a, b] = await Promise.all([rateLimiter().check(RULES.votePerUser, `vote:u:${user.id}`), rateLimiter().check(RULES.votePerIp, `vote:ip:${clientIp(req)}`)]);
  if (!a.ok || !b.ok) return err("Too many votes, slow down", 429);
  const d = await db();
  const found = await resolveItemBySlug(d, p.slug);
  if (!found) return err("Not found", 404);
  try {
    const scores = await castVote(d, user.id, found.item.id, null);
    return json({ ok: true, slug: found.item.slug, ...scores });
  } catch (e) { if (e instanceof VoteError) return err(e.message, e.status); throw e; }
});
