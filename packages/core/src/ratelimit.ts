/** Sliding-window rate limiter with a pluggable store. In-memory by default; Redis-backed in prod. */
export interface RateLimitStore {
  incr(key: string, windowMs: number): Promise<number>;
}

export class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;
  constructor(private now: () => number = Date.now, private sweepEveryMs = 60_000) {}
  get size() { return this.buckets.size; }
  async incr(key: string, windowMs: number) {
    const now = this.now();
    // Drop expired buckets periodically so one-off keys (IPs) do not accumulate forever.
    if (now - this.lastSweep >= this.sweepEveryMs) {
      this.lastSweep = now;
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    }
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) { this.buckets.set(key, { count: 1, resetAt: now + windowMs }); return 1; }
    b.count += 1; return b.count;
  }
}

export interface RateLimitRule { limit: number; windowMs: number }

export const RULES = {
  votePerUser: { limit: 60, windowMs: 60 * 60_000 },        // 60 votes / hour / user
  votePerIp: { limit: 120, windowMs: 60 * 60_000 },
  commentPerUser: { limit: 30, windowMs: 60 * 60_000 },
  submitPerUser: { limit: 10, windowMs: 24 * 60 * 60_000 },
  searchAnon: { limit: 30, windowMs: 60 * 60_000 },
  readPerIp: { limit: 600, windowMs: 60 * 60_000 },         // item list / detail reads / hour / ip         // anonymous search / hour / ip
  searchFreeKey: { limit: 1000, windowMs: 30 * 24 * 60 * 60_000 },
} satisfies Record<string, RateLimitRule>;

export class RateLimiter {
  constructor(private store: RateLimitStore = new MemoryStore()) {}
  async check(rule: RateLimitRule, key: string): Promise<{ ok: boolean; count: number; limit: number }> {
    const count = await this.store.incr(key, rule.windowMs);
    return { ok: count <= rule.limit, count, limit: rule.limit };
  }
}
