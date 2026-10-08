import { RateLimiter, embedderFromEnv } from "@gitit/core";
const g = globalThis as unknown as { __rl?: RateLimiter; __emb?: ReturnType<typeof embedderFromEnv>; __cache?: Map<string, { v: unknown; exp: number }> };
export const rateLimiter = () => (g.__rl ??= new RateLimiter());
export const embedder = () => (g.__emb ??= embedderFromEnv());
/** Tiny TTL cache for hot search queries. Redis-backed in production; see DECISIONS.md. */
export const cache = {
  get<T>(k: string): T | undefined { const e = (g.__cache ??= new Map()).get(k); if (!e) return; if (e.exp < Date.now()) { g.__cache!.delete(k); return; } return e.v as T; },
  set(k: string, v: unknown, ttlMs = 10 * 60_000) { (g.__cache ??= new Map()).set(k, { v, exp: Date.now() + ttlMs }); },
};
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
}
