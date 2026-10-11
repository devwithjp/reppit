import { describe, it, expect } from "vitest";
import { flags, band, ago, compact, type FlagInput } from "./trust";

const now = new Date("2026-10-11T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const base: FlagInput = { kind: "repo", pushedAt: daysAgo(2), archived: false, deprecated: false, advisoriesOpen: 0, license: "MIT" };

describe("flags", () => {
  it("raises nothing for a healthy repo", () => expect(flags(base, now)).toEqual([]));
  it("flags hard facts", () => {
    expect(flags({ ...base, archived: true }, now).map((f) => f.label)).toEqual(["archived"]);
    expect(flags({ ...base, deprecated: true }, now)[0].label).toBe("deprecated");
    expect(flags({ ...base, advisoriesOpen: 2 }, now)[0].label).toBe("2 advisories");
    expect(flags({ ...base, pushedAt: daysAgo(250) }, now)[0]).toEqual({ label: "slowing", warn: true });
    expect(flags({ ...base, pushedAt: daysAgo(400) }, now)[0]).toEqual({ label: "inactive", warn: false });
  });
  it("never flags an unchecked signal", () => {
    expect(flags({ ...base, deprecated: null, advisoriesOpen: null }, now)).toEqual([]);
  });
  it("treats licence as a flag, not a score", () => {
    expect(flags({ ...base, license: null }, now)[0].label).toBe("no licence");
    expect(flags({ ...base, kind: "skill", license: null }, now)).toEqual([]);
    expect(flags({ ...base, license: "NOASSERTION" }, now)[0]).toEqual({ label: "licence unclear", warn: true });
  });
});

describe("wording", () => {
  it("bands scores", () => { expect(band(80)).toBe("ok"); expect(band(50)).toBe("mid"); expect(band(10)).toBe("bad"); });
  it("words ages and counts", () => {
    expect(ago(daysAgo(2), now)).toBe("2 days ago");
    expect(ago(daysAgo(210), now)).toBe("7 months ago");
    expect(compact(24413)).toBe("24k");
    expect(compact(3200)).toBe("3.2k");
  });
});
