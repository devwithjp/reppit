import { describe, it, expect } from "vitest";
import { trustScore, signalCells, voteAdjust, SIGNAL_ORDER, TRUST_POINTS, type TrustItem } from "../src/trust";

const now = new Date("2026-10-11T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const healthy: TrustItem = {
  pushedAt: daysAgo(5), lastReleaseAt: daysAgo(20), archived: false, deprecated: false, advisoriesOpen: 0,
  openIssues: 100, closedIssues: 4900, packageName: "lib", packageEcosystem: "npm", weightedScore: 0,
};

describe("signalCells", () => {
  it("returns six cells in fixed order, worth 100 points", () => {
    const cells = signalCells(healthy, now);
    expect(cells.map((c) => c.key)).toEqual(SIGNAL_ORDER.map((s) => s.key));
    expect(Object.values(TRUST_POINTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(cells.every((c) => c.state === "good" && c.label.length > 0)).toBe(true);
  });
  it("marks missing data unknown, never good, and never says zero advisories when unchecked", () => {
    const cells = signalCells({ archived: false }, now);
    expect(cells.find((c) => c.key === "archived")!.state).toBe("good");
    expect(cells.filter((c) => c.state === "unknown").map((c) => c.key)).toEqual(["push", "release", "deprecated", "advisories", "issues"]);
    expect(cells.find((c) => c.key === "advisories")!.label).not.toMatch(/\b0\b|no open/);
  });
  it("accepts ISO strings from JSON", () => {
    expect(signalCells({ ...healthy, pushedAt: daysAgo(5).toISOString() }, now)[0].state).toBe("good");
  });
  it("grades issue load by open share, not by stars", () => {
    const share = (open: number, closed: number) => signalCells({ ...healthy, openIssues: open, closedIssues: closed }, now)[5].state;
    expect(share(100, 900)).toBe("good");      // 10%
    expect(share(300, 700)).toBe("slipping");  // 30%
    expect(share(600, 400)).toBe("failing");   // 60%
    expect(share(4, 2)).toBe("good");          // too few to judge a share
  });
});

describe("trustScore", () => {
  it("scores a healthy item near 100 with no votes", () => {
    const t = trustScore(healthy, undefined, now);
    expect(t.score).toBeGreaterThanOrEqual(95);
    expect(t.voteAdjust).toBe(0);
  });
  it("unknown signals score half their points", () => {
    const known = trustScore(healthy, 0, now).score!;
    const twoUnknown = trustScore({ ...healthy, deprecated: null, advisoriesOpen: null }, 0, now).score!;
    expect(known - twoUnknown).toBe(15); // (15 + 15) / 2 lost
  });
  it("reports measured and applicable counts", () => {
    expect(trustScore(healthy, 0, now)).toMatchObject({ measured: 6, applicable: 6, unknownCount: 0 });
  });
  it("needs at least 3 measured signals for a number", () => {
    const two = trustScore({ ...healthy, lastReleaseAt: null, deprecated: null, advisoriesOpen: null, openIssues: null }, 0, now);
    expect(two).toMatchObject({ score: null, reason: "too little measured", base: null, unknownCount: 4, measured: 2, applicable: 6 });
    expect(two.cells).toHaveLength(6);
    const three = trustScore({ ...healthy, deprecated: null, advisoriesOpen: null, openIssues: null }, 0, now);
    expect(three).toMatchObject({ measured: 3, applicable: 6 });
    expect(three.score).not.toBeNull();
  });
  it("does not take stars as an input", () => {
    const withStars = { ...healthy, stars: 1_000_000 } as TrustItem;
    expect(trustScore(withStars, 0, now)).toEqual(trustScore(healthy, 0, now));
  });
  it("caps archived and deprecated items at 25, votes included, and names the reason", () => {
    expect(trustScore({ ...healthy, archived: true }, 0, now)).toMatchObject({ score: 25, base: 25, reason: "archived" });
    expect(trustScore({ ...healthy, deprecated: true }, 0, now)).toMatchObject({ score: 25, reason: "deprecated" });
    expect(trustScore({ ...healthy, archived: true }, 1000, now).score).toBe(25);
    expect(trustScore({ ...healthy, archived: true }, -1000, now).score).toBe(13);
  });
  it("archived or deprecated overrides not enough data", () => {
    // localstack-shaped: archived, pushed months ago, nothing else known (4 unknowns).
    const t = trustScore({ archived: true, pushedAt: daysAgo(200) }, 0, now);
    expect(t.unknownCount).toBe(4);
    expect(t.score).not.toBeNull();
    expect(t.score!).toBeLessThanOrEqual(25);
    expect(t.reason).toBe("archived");
    const dep = trustScore({ deprecated: true, archived: false }, 0, now);
    expect(dep).toMatchObject({ reason: "deprecated" });
    expect(dep.score!).toBeLessThanOrEqual(25);
    // Not flagged and four unknowns: still no number.
    expect(trustScore({ archived: false, pushedAt: daysAgo(5) }, 0, now).score).toBeNull();
  });
  it("votes move the score by at most ±12", () => {
    expect(voteAdjust(1e9)).toBe(12);
    expect(voteAdjust(-1e9)).toBe(-12);
    expect(voteAdjust(0)).toBe(0);
    const mid = { ...healthy, pushedAt: daysAgo(200), lastReleaseAt: daysAgo(500) };
    const base = trustScore(mid, 0, now).score!;
    expect(trustScore(mid, 1000, now).score! - base).toBe(12);
    expect(trustScore(mid, -1000, now).score! - base).toBe(-12);
  });
  it("decays raw vote rows by age", () => {
    const fresh = trustScore({ ...healthy, pushedAt: daysAgo(500) }, [{ direction: "up", weight: 2, createdAt: now }, { direction: "up", weight: 2, createdAt: now }], now);
    const stale = trustScore({ ...healthy, pushedAt: daysAgo(500) }, [{ direction: "up", weight: 2, createdAt: daysAgo(720) }, { direction: "up", weight: 2, createdAt: daysAgo(720) }], now);
    expect(fresh.voteAdjust).toBeGreaterThan(stale.voteAdjust);
  });
});

describe("not applicable: confirmed to publish no package", () => {
  const app: TrustItem = { pushedAt: daysAgo(5), archived: false, packageEcosystem: "none", deprecated: null, advisoriesOpen: null, openIssues: null, closedIssues: null, lastReleaseAt: null };
  it("marks deprecation and advisories not_applicable with the label, in fixed order", () => {
    const cells = signalCells(app, now);
    expect(cells.map((c) => c.key)).toEqual(SIGNAL_ORDER.map((s) => s.key));
    for (const k of ["deprecated", "advisories"]) expect(cells.find((c) => c.key === k)).toMatchObject({ state: "not_applicable", label: "publishes no package", points: 7.5 });
  });
  it("push and archived alone are too little for a number, but the facts stay", () => {
    expect(trustScore(app, 0, now)).toMatchObject({ score: null, reason: "too little measured", measured: 2, applicable: 4 });
  });
  it("is scored on the six-signal scale with N/A at the neutral half: 3 measured, no package", () => {
    // push 25 + release 15 + archived 15 + deprecated 7.5 (N/A) + advisories 7.5 (N/A) + issues 7.5 (unknown) = 77.5
    const t = trustScore({ ...app, lastReleaseAt: daysAgo(10) }, 0, now);
    expect(t).toMatchObject({ score: 78, measured: 3, applicable: 4 });
  });
  it("a no-package repo never outranks an otherwise-equal packaged one through N/A", () => {
    const base = { pushedAt: daysAgo(3), lastReleaseAt: daysAgo(20), archived: false, openIssues: null, closedIssues: null };
    const anythingLlm = trustScore({ ...base, packageEcosystem: "none" }, 0, now).score!;
    const ollamaOneAdvisory = trustScore({ ...base, packageEcosystem: "Go", packageName: "github.com/ollama/ollama", deprecated: false, advisoriesOpen: 1 }, 0, now).score!;
    const ollamaClean = trustScore({ ...base, packageEcosystem: "Go", packageName: "x", deprecated: false, advisoriesOpen: 0 }, 0, now).score!;
    const ollamaMany = trustScore({ ...base, packageEcosystem: "Go", packageName: "x", deprecated: false, advisoriesOpen: 9 }, 0, now).score!;
    expect(ollamaOneAdvisory).toBeGreaterThan(anythingLlm);
    expect(ollamaClean).toBeGreaterThan(anythingLlm);
    expect(ollamaMany).toBeGreaterThanOrEqual(anythingLlm);
  });
  it("archived still decides, and shows below 3 measured", () => {
    expect(trustScore({ ...app, archived: true }, 0, now)).toMatchObject({ reason: "archived", applicable: 4 });
    expect(trustScore({ ...app, archived: true }, 0, now).score!).toBeLessThanOrEqual(25);
  });
});

describe("stale caps", () => {
  const lib: TrustItem = { lastReleaseAt: null, archived: false, deprecated: false, advisoriesOpen: 0, packageEcosystem: "npm", packageName: "redux-form", openIssues: null, closedIssues: null };
  it("caps at 50 after a year and 35 after two, votes included", () => {
    expect(trustScore({ ...lib, pushedAt: daysAgo(100) }, 0, now).reason).toBeUndefined();
    expect(trustScore({ ...lib, pushedAt: daysAgo(400) }, 0, now)).toMatchObject({ reason: "stale" });
    expect(trustScore({ ...lib, pushedAt: daysAgo(400) }, 0, now).score!).toBeLessThanOrEqual(50);
    // redux-form: two years untouched no longer reads 60.
    expect(trustScore({ ...lib, pushedAt: daysAgo(740) }, 1000, now)).toMatchObject({ score: 35, reason: "stale" });
  });
  it("does not cap when the push date is unknown or the score is already lower", () => {
    const low = trustScore({ ...lib, pushedAt: daysAgo(400), advisoriesOpen: 5 }, -1000, now);
    expect(low.score!).toBeLessThan(50);
    expect(low.reason).toBeUndefined();
  });
});
