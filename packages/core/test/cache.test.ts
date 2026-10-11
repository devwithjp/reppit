import { describe, it, expect } from "vitest";
import { TtlCache } from "../src/cache";
import { MemoryStore } from "../src/ratelimit";

describe("TtlCache", () => {
  it("expires entries and evicts least recently used past the bound", () => {
    let t = 0;
    const c = new TtlCache<number>(2, 1000, () => t);
    c.set("a", 1); c.set("b", 2);
    expect(c.get("a")).toBe(1); // a is now most recent
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.size).toBe(2);
    t = 1001;
    expect(c.get("a")).toBeUndefined();
  });
});

describe("MemoryStore", () => {
  it("sweeps expired buckets so one-off keys do not accumulate", async () => {
    let t = 0;
    const s = new MemoryStore(() => t, 10);
    for (let i = 0; i < 50; i++) await s.incr(`ip:${i}`, 5);
    t = 100;
    await s.incr("fresh", 5);
    expect(s.size).toBe(1);
  });
});
