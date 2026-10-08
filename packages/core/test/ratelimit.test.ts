import { describe, it, expect } from "vitest";
import { RateLimiter, RULES } from "../src/ratelimit";

describe("RateLimiter", () => {
  it("allows up to the limit then blocks", async () => {
    const rl = new RateLimiter();
    const rule = { limit: 3, windowMs: 60_000 };
    expect((await rl.check(rule, "k")).ok).toBe(true);
    expect((await rl.check(rule, "k")).ok).toBe(true);
    expect((await rl.check(rule, "k")).ok).toBe(true);
    expect((await rl.check(rule, "k")).ok).toBe(false);
    expect((await rl.check(rule, "other")).ok).toBe(true);
  });
  it("has sane default rules", () => {
    expect(RULES.votePerUser.limit).toBeGreaterThan(10);
    expect(RULES.searchFreeKey.limit).toBe(1000);
  });
});
