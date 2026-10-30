import { deleteComment, writeRefusal, CommentError, RULES } from "@gitit/core";
import { db } from "@/lib/db";
import { requestUser } from "@/lib/request-user";
import { rateLimiter } from "@/lib/services";
import { route, json, err, UUID_RE } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>("comment DELETE", async (req, ctx) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return err("Comment not found", 404);
  const { user, apiKeyId, scopes } = await requestUser(req);
  if (!user) return err(req.headers.get("authorization") ? "Invalid or revoked API token" : "Sign in required", 401);
  const refused = writeRefusal({ apiKeyId, scopes });
  if (refused) return err(refused, 403);
  const limited = await rateLimiter().check(RULES.commentPerUser, `comment-delete:${user.id}`);
  if (!limited.ok) return err("Too many comment changes, slow down", 429);
  try {
    return json(await deleteComment(await db(), user.id, id, user.isDev));
  } catch (e) { if (e instanceof CommentError) return err(e.message, e.status); throw e; }
});
