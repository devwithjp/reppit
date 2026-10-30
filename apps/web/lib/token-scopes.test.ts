import { describe, it, expect, vi, beforeEach } from "vitest";

// The vote/compat route with its I/O mocked: only the auth decision is under test.
const actor = vi.hoisted(() => ({ current: {} as { user: unknown; apiKeyId?: string; scopes?: string[] } }));
vi.mock("@/lib/request-user", () => {
  const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  return { requestUser: async () => actor.current, suspensionRefusal: () => null, json, err: (message: string, status = 400) => json({ error: message }, { status }) };
});
vi.mock("@/lib/db", () => ({ db: async () => { throw new Error("db reached"); } }));
vi.mock("@/lib/services", () => ({ rateLimiter: () => ({ check: async () => ({ ok: true, limit: 0 }) }), clientIp: () => "127.0.0.1", embedder: () => null }));

const { POST, DELETE } = await import("@/app/api/items/by-slug/[...slug]/route");
const user = { id: "u1", login: "someone" };
const call = (method: "POST" | "DELETE", action: string) => {
  const req = new Request(`http://x/api/items/by-slug/a/b/${action}`, { method, headers: { "content-type": "application/json", authorization: "Bearer reppit_x" }, body: method === "POST" ? JSON.stringify({ direction: "up" }) : undefined });
  const ctx = { params: Promise.resolve({ slug: ["a", "b", action] }) };
  return method === "POST" ? POST(req, ctx) : DELETE(req, ctx);
};

describe("token scopes on write routes", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("refuses a read-only token on vote with a plain error", async () => {
    actor.current = { user, apiKeyId: "k1", scopes: ["read"] };
    const res = await call("POST", "vote");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "This token is read-only. Votes, agent reports and submissions need a token with write access; create one on your account page." });
    expect((await call("POST", "compat")).status).toBe(403);
    expect((await call("DELETE", "vote")).status).toBe(403);
  });
  it("lets a write token through the scope check", async () => {
    actor.current = { user, apiKeyId: "k2", scopes: ["read", "write"] };
    const res = await call("POST", "vote");
    expect(res.status).not.toBe(403); // reaches the (mocked, failing) database
  });
  it("leaves session users unaffected", async () => {
    actor.current = { user };
    expect((await call("POST", "vote")).status).not.toBe(403);
  });
});
