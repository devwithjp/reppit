/**
 * Personal API tokens for the MCP server and CLI. Read-only by default; "write" (votes, compat
 * reports, submissions) is opt-in per token.
 * Only the SHA-256 of a token is stored; the raw token is shown once at creation.
 * Hashing matches apps/web/lib/request-user.ts, which authenticates `Authorization: Bearer <token>`.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, users, type Db, type User } from "@gitit/db";

export const API_KEY_PREFIX = "reppit_";

/** Token scopes, as stored in api_keys.scopes (text[]). "read" always; "write" is opt-in. */
export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Who is acting: a session (no apiKeyId) or a token with its scopes. */
export interface Actor { apiKeyId?: string; scopes?: readonly string[] }

export const WRITE_SCOPE_REQUIRED =
  "This token is read-only. Votes, agent reports and submissions need a token with write access; create one on your account page.";

/**
 * Null when the actor may write, else the plain-language refusal. Session users are never refused
 * here (they have no token); a token needs the "write" scope.
 */
export function writeRefusal(actor: Actor): string | null {
  if (!actor.apiKeyId) return null;
  return actor.scopes?.includes("write") ? null : WRITE_SCOPE_REQUIRED;
}
export const hashApiKey = (raw: string) => createHash("sha256").update(raw.trim()).digest("hex");

export async function createApiKey(db: Db, userId: string, label?: string | null, opts: { write?: boolean } = {}): Promise<{ id: string; token: string; scopes: TokenScope[] }> {
  const token = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const scopes: TokenScope[] = opts.write ? ["read", "write"] : ["read"];
  const [row] = await db.insert(apiKeys).values({ userId, keyHash: hashApiKey(token), label: label ?? null, scopes }).returning({ id: apiKeys.id });
  return { id: row.id, token, scopes };
}

/** Revoke one of the user's own keys. Returns false if it is not theirs or already revoked. */
export async function revokeApiKey(db: Db, userId: string, keyId: string): Promise<boolean> {
  const res = await db.update(apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  return res.length > 0;
}

/** The owner of a live (unrevoked) key, or null. Same lookup as request-user.ts. */
export async function userForApiKey(db: Db, raw: string): Promise<{ user: User; apiKeyId: string; scopes: string[] } | null> {
  if (!raw.trim()) return null;
  const [row] = await db.select({ k: apiKeys, u: users }).from(apiKeys).innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, hashApiKey(raw)), isNull(apiKeys.revokedAt)));
  return row ? { user: row.u, apiKeyId: row.k.id, scopes: row.k.scopes ?? ["read"] } : null;
}
