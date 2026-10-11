import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { createDb, users, items, type Db } from "@gitit/db";
import { createApiKey, revokeApiKey, userForApiKey, writeRefusal, TOKEN_SCOPES, WRITE_SCOPE_REQUIRED } from "../src/apikeys";
import { castVote } from "../src/votes";

let db: Db; let owner: string; let other: string; let item: string;
beforeAll(async () => {
  db = await createDb({});
  owner = (await db.insert(users).values({ login: "owner", githubCreatedAt: new Date("2015-01-01"), publicRepos: 30 }).returning())[0].id;
  other = (await db.insert(users).values({ login: "other" }).returning())[0].id;
  item = (await db.insert(items).values({ kind: "repo", slug: "a/b", owner: "a", name: "b", url: "u" }).returning())[0].id;
}, 60_000);

describe("personal API tokens", () => {
  it("authenticates a live token to its owner, stores only the hash, and the write is attributed to them", async () => {
    const { token } = await createApiKey(db, owner, "claude code");
    expect(token).toMatch(/^reppit_/);
    const hit = await userForApiKey(db, token);
    expect(hit?.user.id).toBe(owner);
    // Same hash as apps/web/lib/request-user.ts computes for the Bearer header.
    expect(createHash("sha256").update(token).digest("hex")).toHaveLength(64);
    const r = await castVote(db, hit!.user.id, item, "up");
    expect(r.upvotes).toBe(1);
  });
  it("refuses a revoked token, and only the owner can revoke", async () => {
    const { id, token } = await createApiKey(db, owner);
    expect(await revokeApiKey(db, other, id)).toBe(false);
    expect(await userForApiKey(db, token)).not.toBeNull();
    expect(await revokeApiKey(db, owner, id)).toBe(true);
    expect(await userForApiKey(db, token)).toBeNull();
    expect(await revokeApiKey(db, owner, id)).toBe(false);
  });
  it("refuses unknown and empty tokens", async () => {
    expect(await userForApiKey(db, "reppit_nope")).toBeNull();
    expect(await userForApiKey(db, "  ")).toBeNull();
  });
});

describe("token scopes", () => {
  it("creates read-only tokens by default and write tokens only on request", async () => {
    expect(TOKEN_SCOPES).toEqual(["read", "write"]);
    const ro = await createApiKey(db, owner, "agent");
    expect(ro.scopes).toEqual(["read"]);
    expect((await userForApiKey(db, ro.token))?.scopes).toEqual(["read"]);
    const rw = await createApiKey(db, owner, "agent", { write: true });
    expect((await userForApiKey(db, rw.token))?.scopes).toEqual(["read", "write"]);
  });
  it("refuses writes for a read token with a plain error, never for a session", async () => {
    expect(writeRefusal({ apiKeyId: "k", scopes: ["read"] })).toBe(WRITE_SCOPE_REQUIRED);
    expect(writeRefusal({ apiKeyId: "k" })).toBe(WRITE_SCOPE_REQUIRED);
    expect(writeRefusal({ apiKeyId: "k", scopes: ["read", "write"] })).toBeNull();
    expect(writeRefusal({})).toBeNull();
  });
});
