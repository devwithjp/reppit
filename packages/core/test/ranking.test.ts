import { describe, it, expect } from "vitest";
import { voteWeight, weightedScore, hotScore, healthScore, blendedRank, rankTier, compareRank, ADVISORY_HEALTH_FACTOR, type RankInputs } from "../src/ranking";

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
  it("ramps email-only accounts by reppit age: 0.2 at day 0 to 1.0 at 60 days, capped", () => {
    const email = (days: number) => voteWeight({ githubCreatedAt: null, createdAt: daysAgo(days), publicRepos: 0, followers: 0, shadowBanned: false }, now);
    expect(email(0)).toBeCloseTo(0.2, 3);
    expect(email(30)).toBeCloseTo(0.6, 3);
    expect(email(60)).toBe(1);
    expect(email(2000)).toBe(1);
    expect(voteWeight({ githubCreatedAt: null, createdAt: daysAgo(2000), publicRepos: 0, followers: 0, shadowBanned: true }, now)).toBe(0);
  });
  it("keeps the GitHub curve, up to 2.0, for GitHub-backed accounts regardless of reppit age", () => {
    const gh = voteWeight({ githubCreatedAt: daysAgo(3000), createdAt: now, publicRepos: 100, followers: 1000, shadowBanned: false }, now);
    expect(gh).toBeGreaterThan(1.5); expect(gh).toBeLessThanOrEqual(2);
    expect(voteWeight({ githubCreatedAt: now, createdAt: daysAgo(400), publicRepos: 0, followers: 0, shadowBanned: false }, now)).toBeLessThan(0.3);
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

describe("healthScore with unknown inputs", () => {
  const known = { pushedAt: daysAgo(3), lastReleaseAt: daysAgo(20), stars: 5000, archived: false, license: "MIT" };
  it("unknown issue load lies strictly between the best and worst known issue load", () => {
    const unknown = healthScore({ ...known, openIssues: null }, now);
    const best = healthScore({ ...known, openIssues: 0 }, now);
    const worst = healthScore({ ...known, openIssues: 100_000 }, now);
    expect(unknown).toBeLessThan(best);
    expect(unknown).toBeGreaterThan(worst);
  });
  it("unknown issue load equals the weighted mean of the known components (no imputed value)", () => {
    // pushed and released today: both known components are 1.0, so unknown issues must give exactly 1.
    expect(healthScore({ ...known, pushedAt: now, lastReleaseAt: now, openIssues: null }, now)).toBe(1);
    // If the issue component happens to equal the mean of the others, knowing it changes nothing.
    const recency = Math.exp(-3 / 180), release = Math.exp(-20 / 365);
    const mean = (0.55 * recency + 0.2 * release) / 0.75; // target (1 - load)
    const openIssues = (1 - mean) * (5000 * 0.1 + 10);
    expect(healthScore({ ...known, openIssues }, now)).toBeCloseTo(healthScore({ ...known, openIssues: null }, now), 3);
  });
  it("does not punish a missing release as if it were ten years old", () => {
    const noRelease = healthScore({ ...known, lastReleaseAt: null, openIssues: 10 }, now);
    const ancient = healthScore({ ...known, lastReleaseAt: daysAgo(3650), openIssues: 10 }, now);
    expect(noRelease).toBeGreaterThan(ancient);
  });
  it("is a neutral 0.5 when nothing is known", () => {
    expect(healthScore({ pushedAt: null, lastReleaseAt: null, openIssues: null, stars: 0, archived: false, license: "MIT" }, now)).toBe(0.5);
  });
  it("does not treat zero stars as half-overloaded", () => {
    expect(healthScore({ pushedAt: now, lastReleaseAt: null, openIssues: 0, stars: 0, archived: false, license: "MIT" }, now)).toBe(1);
  });
});

describe("healthScore zero-user signals", () => {
  const base = { pushedAt: daysAgo(3), lastReleaseAt: daysAgo(20), openIssues: 10, stars: 5000, archived: false, license: "MIT" };
  it("is zero for deprecated packages", () => expect(healthScore({ ...base, deprecated: true }, now)).toBe(0));
  it("unknown deprecation is not a penalty", () => {
    expect(healthScore({ ...base, deprecated: null }, now)).toBe(healthScore({ ...base, deprecated: false }, now));
  });
  it("open advisories scale health down; unknown and zero do not", () => {
    const clean = healthScore({ ...base, advisoriesOpen: 0 }, now);
    expect(healthScore({ ...base, advisoriesOpen: null }, now)).toBe(clean);
    expect(healthScore(base, now)).toBe(clean);
    expect(healthScore({ ...base, advisoriesOpen: 3 }, now)).toBeCloseTo(clean * ADVISORY_HEALTH_FACTOR, 3);
  });
});

describe("rank tiering for flagged items", () => {
  const sort = (xs: { name: string; tier: number; score: number }[]) => [...xs].sort(compareRank).map((x) => x.name);
  const healthy: RankInputs = { semantic: 0.3, weightedScore: 0, health: 0.8, stars: 200, installs: 0 };
  const deprecatedButRelevant = { semantic: 0.95, weightedScore: 0, health: 0, stars: 100_000, installs: 0, deprecated: true };
  const archivedButRelevant = { semantic: 0.95, weightedScore: 0, health: 0, stars: 100_000, installs: 0, archived: true };
  it("a deprecated item scores higher on blend alone but still sorts below a healthy one", () => {
    expect(blendedRank(deprecatedButRelevant)).toBeGreaterThan(blendedRank(healthy));
    expect(sort([
      { name: "deprecated", tier: rankTier(deprecatedButRelevant), score: blendedRank(deprecatedButRelevant) },
      { name: "healthy", tier: rankTier(healthy), score: blendedRank(healthy) },
    ])).toEqual(["healthy", "deprecated"]);
  });
  it("same for archived, even with heavy community support", () => {
    const a = { ...archivedButRelevant, weightedScore: 40 };
    expect(sort([
      { name: "archived", tier: rankTier(a), score: blendedRank(a) },
      { name: "healthy", tier: rankTier(healthy), score: blendedRank(healthy) },
    ])).toEqual(["healthy", "archived"]);
  });
  it("unknown deprecation is not a flag", () => {
    expect(rankTier({ deprecated: null })).toBe(0);
    expect(rankTier({ deprecated: false, archived: false })).toBe(0);
    expect(rankTier({ deprecated: true })).toBe(1);
  });
  it("flagged items still order by score among themselves", () => {
    expect(sort([{ name: "a", tier: 1, score: 0.2 }, { name: "b", tier: 1, score: 0.5 }, { name: "c", tier: 0, score: 0.1 }])).toEqual(["c", "b", "a"]);
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
