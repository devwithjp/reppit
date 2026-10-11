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
  it("returns no number when three or more signals are unknown", () => {
    const t = trustScore({ ...healthy, deprecated: null, advisoriesOpen: null, openIssues: null }, 0, now);
    expect(t).toMatchObject({ score: null, reason: "not enough data", base: null, unknownCount: 3 });
    expect(t.cells).toHaveLength(6);
  });
  it("does not take stars as an input", () => {
    const withStars = { ...healthy, stars: 1_000_000 } as TrustItem;
    expect(trustScore(withStars, 0, now)).toEqual(trustScore(healthy, 0, now));
  });
  it("caps archived and deprecated items at 25 before votes", () => {
    expect(trustScore({ ...healthy, archived: true }, 0, now).base).toBe(25);
    expect(trustScore({ ...healthy, deprecated: true }, 0, now).base).toBe(25);
  });
  it("votes move the score by at most ±12", () => {
    expect(voteAdjust(1e9)).toBe(12);
    expect(voteAdjust(-1e9)).toBe(-12);
    expect(voteAdjust(0)).toBe(0);
    const mid = { ...healthy, pushedAt: daysAgo(500), lastReleaseAt: daysAgo(500) };
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
