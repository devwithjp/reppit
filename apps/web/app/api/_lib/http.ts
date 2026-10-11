/**
 * Shared API plumbing: consistent JSON errors, no stack traces to clients, input parsing helpers.
 * Private to the API (underscore folder = not a route).
 */
import { trustScore, type RateLimitRule } from "@gitit/core";
import type { Item } from "@gitit/db";
import { json, err } from "@/lib/request-user";
import { rateLimiter, clientIp } from "@/lib/services";

export { json, err };

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler: any thrown error becomes `500 {"error":"Internal error"}`; details go to the server log only. */
export function route<C>(name: string, h: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await h(req, ctx);
    } catch (e) {
      const ref = Math.random().toString(36).slice(2, 10);
      console.error(`[api ${name}] ${ref}`, e);
      return json({ error: "Internal error", ref }, { status: 500 });
    }
  };
}

const MAX_BODY_BYTES = 16_384;

/** Parse a JSON object body. Returns null (caller answers 400) for missing, oversized, non-JSON or non-object bodies. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return null;
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return null;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

/** Integer query param clamped to [min, max]; falls back on missing or garbage (NaN never reaches SQL). */
export function intParam(v: string | null, fallback: number, min: number, max: number): number {
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apply a rate-limit rule keyed by client IP; returns a 429 response or null. */
export async function limitByIp(req: Request, rule: RateLimitRule, scope: string): Promise<Response | null> {
  const rl = await rateLimiter().check(rule, `${scope}:ip:${clientIp(req)}`);
  return rl.ok ? null : json({ error: "Rate limit exceeded", limit: rl.limit }, { status: 429, headers: { "retry-after": String(Math.ceil(rule.windowMs / 1000)) } });
}

/** Public item shape: no embedding, plus the shared trust score (whose `cells` are the six-cell strip). */
export function itemPayload(item: Item) {
  const { embedding: _e, readme, ...rest } = item;
  return { ...rest, readme: readme?.slice(0, 20_000) ?? null, trust: trustScore(item) };
}
