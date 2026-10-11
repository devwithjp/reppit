/**
 * Bounded TTL cache with LRU eviction. In-process only; swap for Redis when running more than one
 * instance. Expired entries are dropped on read and when the size bound is hit, so memory stays
 * bounded under a long tail of unique queries.
 */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private maxEntries = 1000, private defaultTtlMs = 10 * 60_000, private now: () => number = Date.now) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= this.now()) { this.m.delete(k); return undefined; }
    this.m.delete(k); this.m.set(k, e); // refresh recency
    return e.v;
  }
  set(k: string, v: V, ttlMs = this.defaultTtlMs) {
    this.m.delete(k);
    this.m.set(k, { v, exp: this.now() + ttlMs });
    if (this.m.size > this.maxEntries) {
      const t = this.now();
      for (const [key, e] of this.m) if (e.exp <= t) this.m.delete(key);
      while (this.m.size > this.maxEntries) this.m.delete(this.m.keys().next().value as string);
    }
  }
  get size() { return this.m.size; }
}
