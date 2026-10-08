import { eq, and, desc } from "drizzle-orm";
import { items, comments, users, votes, agentCompatReports } from "@gitit/db";
import { castVote, bumpCommentCount, VoteError, RULES, DOWNVOTE_REASONS, type DownvoteReason } from "@gitit/core";
import { db } from "@/lib/db";
import { rateLimiter, clientIp } from "@/lib/services";
import { requestUser, json, err } from "@/lib/request-user";

const ACTIONS = new Set(["vote", "comments", "compat"]);
const AGENTS = new Set(["claude-code", "codex", "cursor", "gemini-cli", "copilot", "windsurf", "other"]);

function parse(segments: string[]) {
  const action = ACTIONS.has(segments[segments.length - 1]) ? segments.pop()! : null;
  return { slug: segments.map(decodeURIComponent).join("/"), action };
}

async function findItem(slug: string) {
  const d = await db();
  const [item] = await d.select().from(items).where(eq(items.slug, slug));
  return item ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug, action } = parse([...(await ctx.params).slug]);
  if (action) return err("Not found", 404);
  const item = await findItem(slug);
  if (!item) return err("Not found", 404);
  const d = await db();
  const [cmts, compat] = await Promise.all([
    d.select({ id: comments.id, body: comments.body, parentId: comments.parentId, createdAt: comments.createdAt, user: users.login })
      .from(comments).innerJoin(users, eq(users.id, comments.userId)).where(and(eq(comments.itemId, item.id), eq(comments.deleted, false))).orderBy(desc(comments.createdAt)).limit(50),
    d.select({ agent: agentCompatReports.agent, status: agentCompatReports.status, note: agentCompatReports.note, user: users.login, createdAt: agentCompatReports.createdAt })
      .from(agentCompatReports).innerJoin(users, eq(users.id, agentCompatReports.userId)).where(eq(agentCompatReports.itemId, item.id)).orderBy(desc(agentCompatReports.createdAt)).limit(50),
  ]);
  const { embedding: _e, ...rest } = item;
  return json({ ...rest, readme: item.readme?.slice(0, 20_000) ?? null, comments: cmts, compatReports: compat });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug, action } = parse([...(await ctx.params).slug]);
  if (!action) return err("Not found", 404);
  const { user } = await requestUser(req);
  if (!user) return err("Sign in required", 401);
  const item = await findItem(slug);
  if (!item) return err("Not found", 404);
  const d = await db();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (action === "vote") {
    const [a, b] = await Promise.all([rateLimiter().check(RULES.votePerUser, `vote:u:${user.id}`), rateLimiter().check(RULES.votePerIp, `vote:ip:${clientIp(req)}`)]);
    if (!a.ok || !b.ok) return err("Too many votes, slow down", 429);
    const direction = body.direction === "up" || body.direction === "down" ? body.direction : body.direction === null ? null : undefined;
    if (direction === undefined) return err("direction must be up, down or null");
    const reason = typeof body.reason === "string" && DOWNVOTE_REASONS.includes(body.reason as DownvoteReason) ? (body.reason as DownvoteReason) : undefined;
    try {
      const scores = await castVote(d, user.id, item.id, direction, reason);
      return json({ ok: true, ...scores });
    } catch (e) { if (e instanceof VoteError) return err(e.message, e.status); throw e; }
  }

  if (action === "comments") {
    const rl = await rateLimiter().check(RULES.commentPerUser, `comment:${user.id}`);
    if (!rl.ok) return err("Too many comments", 429);
    const text = String(body.body ?? "").trim();
    if (text.length < 2 || text.length > 5000) return err("Comment must be 2–5000 characters");
    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    const [c] = await d.insert(comments).values({ itemId: item.id, userId: user.id, body: text, parentId }).returning();
    await bumpCommentCount(d, item.id, 1);
    return json({ comment: { ...c, user: user.login } }, { status: 201 });
  }

  if (action === "compat") {
    const agent = String(body.agent ?? "").toLowerCase();
    const status = body.status === "works" || body.status === "broken" ? body.status : null;
    if (!AGENTS.has(agent) || !status) return err(`agent must be one of ${[...AGENTS].join(", ")}; status works|broken`);
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    await d.insert(agentCompatReports).values({ itemId: item.id, userId: user.id, agent, status, note })
      .onConflictDoUpdate({ target: [agentCompatReports.itemId, agentCompatReports.userId, agentCompatReports.agent], set: { status, note, createdAt: new Date() } });
    return json({ ok: true });
  }
  return err("Not found", 404);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug, action } = parse([...(await ctx.params).slug]);
  if (action !== "vote") return err("Not found", 404);
  const { user } = await requestUser(req);
  if (!user) return err("Sign in required", 401);
  const item = await findItem(slug);
  if (!item) return err("Not found", 404);
  const d = await db();
  await d.delete(votes).where(and(eq(votes.userId, user.id), eq(votes.itemId, item.id)));
  const scores = await castVote(d, user.id, item.id, null);
  return json({ ok: true, ...scores });
}
