import { describe, it, expect } from "vitest";
import { voteWeight, weightedScore, hotScore, healthScore, blendedRank } from "../src/ranking";

const now = new Date("2026-10-08T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("voteWeight", () => {
  it("is zero for shadow-banned users", () => {
    expect(voteWeight({ githubCreatedAt: daysAgo(2000), publicRepos: 50, followers: 500, shadowBanned: true }, now)).toBe(0);
  });
  it("gives brand-new empty accounts a small weight", () => {
    const w = voteWeight({ githubCreatedAt: now, publicRepos: 0, followers: 0, shadowBanned: false }, now);
    expect(w).toBeGreaterThan(0.1); expect(w).toBeLessThan(0.3);
  });
  it("gives established active accounts more weight than new ones", () => {
    const vet = voteWeight({ githubCreatedAt: daysAgo(2000), publicRepos: 40, followers: 200, shadowBanned: false }, now);
    const noob = voteWeight({ githubCreatedAt: daysAgo(10), publicRepos: 1, followers: 0, shadowBanned: false }, now);
    expect(vet).toBeGreaterThan(noob); expect(vet).toBeLessThanOrEqual(2);
  });
  it("treats unknown creation date as new", () => {
    expect(voteWeight({ githubCreatedAt: null, publicRepos: 0, followers: 0, shadowBanned: false }, now)).toBeLessThan(0.3);
  });
});

describe("weightedScore", () => {
  it("sums signed weights", () => {
    const s = weightedScore([
      { direction: "up", weight: 1, createdAt: now },
      { direction: "up", weight: 0.5, createdAt: now },
      { direction: "down", weight: 1, createdAt: now },
    ], now);
    expect(s).toBeCloseTo(0.5, 5);
  });
  it("halves a vote after 180 days", () => {
    expect(weightedScore([{ direction: "up", weight: 1, createdAt: daysAgo(180) }], now)).toBeCloseTo(0.5, 3);
  });
});

describe("hotScore", () => {
  it("ranks a newer item above an older one with the same net", () => {
    expect(hotScore(10, daysAgo(1))).toBeGreaterThan(hotScore(10, daysAgo(10)));
  });
  it("ranks a much more upvoted old item above a slightly newer one", () => {
    // 45k seconds (12.5h) of age ≈ one order of magnitude of votes
    expect(hotScore(1000, daysAgo(1))).toBeGreaterThan(hotScore(1, daysAgo(0.5)));
  });
  it("is negative for net-negative items", () => {
    expect(hotScore(-10, daysAgo(1))).toBeLessThan(hotScore(0, daysAgo(1)));
  });
});

describe("healthScore", () => {
  const base = { pushedAt: daysAgo(3), lastReleaseAt: daysAgo(20), openIssues: 10, stars: 5000, archived: false, license: "MIT" };
  it("is zero for archived repos", () => expect(healthScore({ ...base, archived: true }, now)).toBe(0));
  it("is high for active repos", () => expect(healthScore(base, now)).toBeGreaterThan(0.8));
  it("decays with time since last push", () => {
    expect(healthScore({ ...base, pushedAt: daysAgo(400) }, now)).toBeLessThan(healthScore(base, now) * 0.6);
  });
  it("penalises missing license", () => expect(healthScore({ ...base, license: null }, now)).toBeLessThan(healthScore(base, now)));
  it("penalises issue overload", () => expect(healthScore({ ...base, openIssues: 5000 }, now)).toBeLessThan(healthScore(base, now)));
  it("stays in [0,1]", () => {
    expect(healthScore({ pushedAt: null, lastReleaseAt: null, openIssues: 99999, stars: 0, archived: false, license: null }, now)).toBeGreaterThanOrEqual(0);
  });
});

describe("blendedRank", () => {
  it("prefers community-endorsed over equally relevant unknown", () => {
    const a = blendedRank({ semantic: 0.6, weightedScore: 20, health: 0.8, stars: 100, installs: 0 });
    const b = blendedRank({ semantic: 0.6, weightedScore: 0, health: 0.8, stars: 100, installs: 0 });
    expect(a).toBeGreaterThan(b);
  });
  it("lets strong relevance beat popularity", () => {
    const relevant = blendedRank({ semantic: 0.9, weightedScore: 0, health: 0.5, stars: 50, installs: 0 });
    const popular = blendedRank({ semantic: 0.2, weightedScore: 0, health: 0.5, stars: 100_000, installs: 0 });
    expect(relevant).toBeGreaterThan(popular);
  });
  it("clamps negative semantic to zero contribution", () => {
    expect(blendedRank({ semantic: -0.5, weightedScore: 0, health: 0, stars: 0, installs: 0 })).toBeCloseTo(0.15, 5);
  });
});
