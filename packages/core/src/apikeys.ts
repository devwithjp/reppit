/**
 * Personal API tokens for in-agent writes (votes, compat reports) from the MCP server and CLI.
 * Only the SHA-256 of a token is stored; the raw token is shown once at creation.
 * Hashing matches apps/web/lib/request-user.ts, which authenticates `Authorization: Bearer <token>`.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, users, type Db, type User } from "@gitit/db";

export const API_KEY_PREFIX = "reppit_";
export const hashApiKey = (raw: string) => createHash("sha256").update(raw.trim()).digest("hex");

export async function createApiKey(db: Db, userId: string, label?: string | null): Promise<{ id: string; token: string }> {
  const token = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(apiKeys).values({ userId, keyHash: hashApiKey(token), label: label ?? null }).returning({ id: apiKeys.id });
  return { id: row.id, token };
}

/** Revoke one of the user's own keys. Returns false if it is not theirs or already revoked. */
export async function revokeApiKey(db: Db, userId: string, keyId: string): Promise<boolean> {
  const res = await db.update(apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  return res.length > 0;
}

/** The owner of a live (unrevoked) key, or null. Same lookup as request-user.ts. */
export async function userForApiKey(db: Db, raw: string): Promise<{ user: User; apiKeyId: string } | null> {
  if (!raw.trim()) return null;
  const [row] = await db.select({ k: apiKeys, u: users }).from(apiKeys).innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, hashApiKey(raw)), isNull(apiKeys.revokedAt)));
  return row ? { user: row.u, apiKeyId: row.k.id } : null;
}
