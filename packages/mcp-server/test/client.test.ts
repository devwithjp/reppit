import { describe, it, expect } from "vitest";
import { envConfig, slugPath, formatTrust, installCommand, formatResults, DEFAULT_API_URL } from "../src/client";

describe("envConfig", () => {
  it("defaults to api.reppit.dev", () => expect(envConfig({})).toEqual({ baseUrl: DEFAULT_API_URL, apiKey: undefined }));
  it("prefers REPPIT_* and falls back to GITIT_*", () => {
    expect(envConfig({ GITIT_API_URL: "http://old/", GITIT_API_KEY: "k1" })).toEqual({ baseUrl: "http://old", apiKey: "k1" });
    expect(envConfig({ REPPIT_API_URL: "http://new", GITIT_API_URL: "http://old", REPPIT_API_KEY: "k2", GITIT_API_KEY: "k1" })).toEqual({ baseUrl: "http://new", apiKey: "k2" });
  });
});
describe("helpers", () => {
  it("encodes slug segments but keeps slashes", () => expect(slugPath("a b/c?d")).toBe("a%20b/c%3Fd"));
  it("shows the API's trust number or says there is not enough data", () => {
    expect(formatTrust({ score: 87, base: 80, voteAdjust: 7, unknownCount: 0, cells: [] })).toBe("trust 87/100");
    expect(formatTrust({ score: null, reason: "not enough data", base: null, voteAdjust: 0, unknownCount: 3, cells: [] })).toBe("trust: not enough data");
    expect(formatTrust({ score: 79, base: 79, voteAdjust: 0, unknownCount: 2, measured: 2, applicable: 4, cells: [] })).toBe("trust 79/100 (2 of 4 measured)");
    expect(formatTrust({ score: 20, reason: "archived", base: 20, voteAdjust: 0, unknownCount: 0, measured: 4, applicable: 4, cells: [] })).toBe("trust 20/100 (archived)");
  });
});

describe("installCommand", () => {
  const base = { id: "1", kind: "repo" as const, slug: "drizzle-team/drizzle-orm", url: "https://github.com/drizzle-team/drizzle-orm", description: null, language: "TypeScript", stars: 0, installs: 0, healthScore: 1, upvotes: 0, downvotes: 0, license: null };
  it("uses only the primary install package, never git clone", () => {
    expect(installCommand({ ...base, packageEcosystem: "npm", packageName: "drizzle-orm", installPackage: "drizzle-orm" })).toBe("npm install drizzle-orm");
    expect(installCommand({ ...base, packageEcosystem: "PyPI", packageName: "docling", installPackage: "docling" })).toBe("pip install docling");
    expect(installCommand({ ...base, packageEcosystem: "crates.io", packageName: "clap", installPackage: "clap" })).toBe("cargo add clap");
    expect(installCommand({ ...base, packageEcosystem: "Go", packageName: "gorm.io/gorm", installPackage: "gorm.io/gorm" })).toBe("go get gorm.io/gorm");
    // A verified side package (monorepo) is never offered as the install.
    expect(installCommand({ ...base, slug: "TanStack/query", url: "https://github.com/TanStack/query", packageEcosystem: "npm", packageName: "@tanstack/query-core", installPackage: null }))
      .toBe("# no single package to install verified; see the install docs at https://github.com/TanStack/query#readme");
    expect(installCommand(base)).not.toMatch(/git clone|npm install/);
    expect(installCommand({ ...base, kind: "skill", slug: "o/r/skills/x" })).toBe("npx reppit add o/r/skills/x --yes");
  });
  it("follows the query's registry choice and sends apps to their docs", () => {
    const polars = { ...base, slug: "pola-rs/polars", url: "https://github.com/pola-rs/polars", packageEcosystem: "crates.io", installPackage: "polars", installKind: "package" as const };
    expect(installCommand(polars)).toBe("cargo add polars");
    expect(installCommand(polars, { ecosystem: "PyPI", name: "polars" })).toBe("pip install polars");
    const ollama = { ...base, slug: "ollama/ollama", url: "https://github.com/ollama/ollama", packageEcosystem: "Go", packageName: "github.com/ollama/ollama", installPackage: null, installKind: "app" as const };
    expect(installCommand(ollama)).toBe("# an application, not a library: install it from https://github.com/ollama/ollama#readme");
  });
  it("says not indexed instead of listing weak matches", () => {
    expect(formatResults([], true)).toMatch(/Not in the reppit index yet/);
  });
});
