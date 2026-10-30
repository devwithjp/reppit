import { voteComment, writeRefusal, CommentError, RULES, type CommentVoteDirection } from "@gitit/core";
import { db } from "@/lib/db";
import { requestUser, suspensionRefusal } from "@/lib/request-user";
import { rateLimiter, clientIp } from "@/lib/services";
import { route, json, err, readJsonObject, UUID_RE } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>("comment vote POST", async (req, ctx) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return err("Comment not found", 404);
  const { user, apiKeyId, scopes } = await requestUser(req);
  if (!user) return err(req.headers.get("authorization") ? "Invalid or revoked API token" : "Sign in required", 401);
  const suspended = suspensionRefusal(user);
  if (suspended) return err(suspended, 403);
  const refused = writeRefusal({ apiKeyId, scopes });
  if (refused) return err(refused, 403);
  const [byUser, byIp] = await Promise.all([
    rateLimiter().check(RULES.commentVotePerUser, `comment-vote:u:${user.id}`),
    rateLimiter().check(RULES.votePerIp, `comment-vote:ip:${clientIp(req)}`),
  ]);
  if (!byUser.ok || !byIp.ok) return err("Too many comment votes, slow down", 429);
  const body = await readJsonObject(req);
  if (!body) return err("Body must be a JSON object");
  const direction: CommentVoteDirection | undefined = body.direction === "up" || body.direction === "down"
    ? body.direction : body.direction === null ? null : undefined;
  if (direction === undefined) return err("direction must be up, down or null");
  try {
    return json({ ok: true, ...(await voteComment(await db(), user.id, id, direction)) });
  } catch (e) { if (e instanceof CommentError) return err(e.message, e.status); throw e; }
});
