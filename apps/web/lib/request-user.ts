import { createHash } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { apiKeys, users, type User } from "@gitit/db";
import { getViewerUser } from "./viewer";
import { db } from "./db";

/**
 * Resolve the acting user from a session cookie or `Authorization: Bearer <token>`. Token callers
 * also get the token's scopes; check writes with core's `writeRefusal`.
 */
export async function requestUser(req: Request): Promise<{ user: User | null; apiKeyId?: string; scopes?: string[] }> {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const key = authz.slice(7).trim();
    if (!key) return { user: null };
    const d = await db();
    const hash = createHash("sha256").update(key).digest("hex");
    const [row] = await d.select({ k: apiKeys, u: users }).from(apiKeys).innerJoin(users, eq(users.id, apiKeys.userId)).where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)));
    return row ? { user: row.u, apiKeyId: row.k.id, scopes: row.k.scopes ?? ["read"] } : { user: null };
  }
  return { user: await getViewerUser() };
}

export function suspensionRefusal(user: User): string | null {
  return user.suspendedAt ? "This account is suspended from community actions" : null;
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}
export const err = (message: string, status = 400) => json({ error: message }, { status });
