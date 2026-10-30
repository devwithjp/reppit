import { ModerationError, setUserSuspended, writeRefusal } from "@gitit/core";
import { db } from "@/lib/db";
import { requestUser } from "@/lib/request-user";
import { route, json, err, readJsonObject, UUID_RE } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>("user suspension POST", async (req, ctx) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return err("User not found", 404);
  const { user, apiKeyId, scopes } = await requestUser(req);
  if (!user) return err("Sign in required", 401);
  const refused = writeRefusal({ apiKeyId, scopes });
  if (refused) return err(refused, 403);
  const body = await readJsonObject(req);
  if (!body || typeof body.suspended !== "boolean") return err("suspended must be true or false");
  try {
    return json(await setUserSuspended(await db(), user.id, id, body.suspended));
  } catch (error) {
    if (error instanceof ModerationError) return err(error.message, error.status);
    throw error;
  }
});
