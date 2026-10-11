import { describe, it, expect, beforeAll } from "vitest";
import { createDb, items, type Db } from "@gitit/db";
import { search, parseQuery, explain, outlierRule, robustStats, OUTLIER_DEFAULTS, idfCoverage, idfWeight, chooseInstall } from "../src/search";
import { LocalEmbedder, itemEmbeddingText } from "../src/embeddings";

const e = new LocalEmbedder();
let db: Db;
const now = new Date();
const rows = [
  { slug: "ollama/ollama", name: "ollama", description: "Get up and running with large language models locally", topics: ["llm", "llama", "local"], language: "Go", stars: 160000 },
  { slug: "ggml-org/llama.cpp", name: "llama.cpp", description: "LLM inference in C/C++", topics: ["llm", "inference"], language: "C++", stars: 85000 },
  { slug: "freecodecamp/freecodecamp", name: "freecodecamp", description: "Learn to code for free, including running local LLM projects", topics: ["education"], language: "TypeScript", stars: 420000 },
  { slug: "drizzle-team/drizzle-orm", name: "drizzle-orm", packageName: "drizzle-orm", description: "Headless TypeScript ORM for Postgres, MySQL and SQLite", topics: ["orm", "postgres", "typescript"], language: "TypeScript", stars: 30000 },
  { slug: "go-gorm/gorm", name: "gorm", description: "The fantastic ORM library for Golang, supports Postgres", topics: ["orm", "go"], language: "Go", stars: 37000 },
  { slug: "localstack/localstack", name: "localstack", description: "A fully functional local AWS cloud stack", topics: ["aws"], language: "Python", stars: 60000, archived: true },
  { slug: "OptimalBits/bull", name: "bull", description: "Premium Queue package for handling distributed jobs and messages in NodeJS.", topics: ["job-queue", "rate-limiter", "nodejs"], language: "JavaScript", stars: 15000 },
  { slug: "encode/httpx-like", name: "pyhttp", description: "An async HTTP client", topics: ["http-client", "async"], language: null, packageEcosystem: "PyPI", packageName: "pyhttp", stars: 100 },
  { slug: "seanmonstar/reqwest", name: "reqwest", description: "An easy and powerful async HTTP client", topics: ["http-client"], language: "Rust", stars: 10000 },
  { slug: "pola-rs/polars", name: "polars", description: "Extremely fast query engine for DataFrames, written in Rust", topics: ["dataframe", "arrow"], language: "Rust", stars: 35000,
    packageEcosystem: "crates.io", packageName: "polars", installPackage: "polars", installKind: "package" as const,
    installOptions: [{ ecosystem: "crates.io", name: "polars" }, { ecosystem: "PyPI", name: "polars" }], readme: "A faster pandas replacement for data frames." },
  { slug: "acme/flags", name: "flags", description: "Redis client with feature-rich flags parsing", topics: ["redis"], language: "TypeScript", stars: 50 },
  { slug: "homelab/dashboard", name: "dashboard", description: "A self-hosted dashboard for your homelab services", topics: ["self-hosted", "homelab"], language: "TypeScript", stars: 20000 },
  { slug: "homelab/monitor", name: "monitor", description: "Lightweight self hosted server monitoring hub", topics: ["self-hosted", "monitoring"], language: "Go", stars: 15000 },
  { slug: "homelab/media", name: "media", description: "Self hosted media server", topics: ["self-hosted", "media"], language: "Go", stars: 9000 },
  { slug: "jsdoc/notes", name: "notes", description: "Personal notes", topics: [], language: null, stars: 10, readme: "this readme mentions orm once" },
];

beforeAll(async () => {
  db = await createDb({});
  const vecs = await e.embed(rows.map((r) => itemEmbeddingText(r)));
  await db.insert(items).values(rows.map((r, i) => ({
    kind: "repo" as const, owner: r.slug.split("/")[0], url: `https://github.com/${r.slug}`, healthScore: 0.8, pushedAt: now,
    archived: false, ...r, embedding: vecs[i], embeddedAt: now,
  })));
}, 60_000);

describe("hybrid search", () => {
  it("pins an exact name match first", async () => {
    const { results: r } = await search(db, e, "ollama");
    expect(r[0].item.slug).toBe("ollama/ollama");
    expect(r[0].match).toBe("exact");
    expect(r[0].why).toMatch(/^Exact name match/);
    const { results: l } = await search(db, e, "llama.cpp");
    expect(l[0].item.slug).toBe("ggml-org/llama.cpp");
    expect((await search(db, e, "https://github.com/drizzle-team/drizzle-orm")).results[0].item.slug).toBe("drizzle-team/drizzle-orm");
  });
  it("returns nothing, flagged notIndexed, for gibberish and for names not in the index", async () => {
    for (const q of ["asdkjh qwpoeiru", "pdfplumber", "express-rate-limit"]) {
      const r = await search(db, e, q);
      expect(r).toEqual({ results: [], notIndexed: true });
    }
  });
  it("treats a language named in the query as a filter", async () => {
    const { results: r, notIndexed } = await search(db, e, "typescript orm for postgres");
    expect(r[0].item.slug).toBe("drizzle-team/drizzle-orm");
    expect(notIndexed).toBe(false);
    expect(r.map((x) => x.item.slug)).not.toContain("go-gorm/gorm");
    expect((await search(db, e, "orm for postgres in go")).results.map((x) => x.item.slug)).toEqual(["go-gorm/gorm"]);
  });
  it("admits the language's registry packages even when the repo language is unknown", async () => {
    const py = (await search(db, e, "async http client in python")).results.map((x) => x.item.slug);
    expect(py).toEqual(["encode/httpx-like"]);
    expect((await search(db, e, "async http client in rust")).results.map((x) => x.item.slug)).toEqual(["seanmonstar/reqwest"]);
  });
  it("an identifier query is a name lookup: two of its words in a topic list are not a match", async () => {
    // bull's topic "rate-limiter" covers "rate" and "limit" of express-rate-limit.
    expect(await search(db, e, "express-rate-limit")).toEqual({ results: [], notIndexed: true });
    expect((await search(db, e, "rate limiter for node jobs")).results.map((x) => x.item.slug)).toContain("OptimalBits/bull");
  });
  it("a one-word query is a name lookup: no fuzzy results, tagged items only as related", async () => {
    const r = await search(db, e, "orm", { limit: 10 });
    expect(r.results).toEqual([]);
    expect(r.notIndexed).toBe(true);
    const related = (r.related ?? []).map((x) => x.item.slug);
    expect(related).toContain("drizzle-team/drizzle-orm"); // tagged "orm"
    expect(related).not.toContain("jsdoc/notes"); // README mention only
    // A plain word that only appears in descriptions gives nothing at all.
    expect(await search(db, e, "requests")).toEqual({ results: [], notIndexed: true });
  });
  it("shows an archived project on an exact lookup but never in topic results", async () => {
    const { results: exact } = await search(db, e, "localstack");
    expect(exact[0]).toMatchObject({ item: { slug: "localstack/localstack", archived: true }, match: "exact" });
    expect(exact[0].why).toMatch(/archived/);
    expect(exact[0].trust.reason).toBe("archived");
    const { results: topic } = await search(db, e, "local aws cloud stack");
    expect(topic.map((x) => x.item.slug)).not.toContain("localstack/localstack");
  });
});

describe("problem queries", () => {
  it("drops qualifier words and finds the content: fast dataframe library", async () => {
    const r = await search(db, e, "fast dataframe library");
    expect(r.results[0]?.item.slug).toBe("pola-rs/polars");
  });
  it("matches synonyms: a data frame query finds the dataframe tag", async () => {
    expect((await search(db, e, "data frame engine")).results.map((x) => x.item.slug)).toContain("pola-rs/polars");
  });
  it("needs the content words in name, topics or description, not scattered", async () => {
    // drizzle-orm has "postgres" in its description but neither "feature" nor "flags": 1 of 3 content
    // words (coverage 0.33) is below the 0.6 floor for three-word queries.
    const r = await search(db, e, "postgres feature flags");
    expect(r.results.map((x) => x.item.slug)).not.toContain("drizzle-team/drizzle-orm");
  });
  it("picks the install for the language the query names", async () => {
    const py = await search(db, e, "dataframe library in python");
    expect(py.results[0]).toMatchObject({ item: { slug: "pola-rs/polars" }, install: { ecosystem: "PyPI", name: "polars" } });
    const rust = await search(db, e, "dataframe library in rust");
    expect(rust.results[0].install).toEqual({ ecosystem: "crates.io", name: "polars" });
    const plain = await search(db, e, "polars");
    expect(plain.results[0].install).toEqual({ ecosystem: "crates.io", name: "polars" });
  });
});

describe("framework words", () => {
  it("imply their language but stay search terms", () => {
    const pq = parseQuery("jwt auth in fastapi");
    expect([...pq.languages]).toEqual(["python"]);
    expect(pq.terms).toContain("fastapi");
    expect([...parseQuery("charting library for react").languages].sort()).toEqual(["javascript", "typescript"]);
  });
  it("defer to a language named outright", () => {
    expect([...parseQuery("react bindings in rust").languages]).toEqual(["rust"]);
  });
});

describe("multi-word synonyms", () => {
  it("collapse into one term before matching", async () => {
    const { collapsePhrases } = await import("../src/search");
    expect(collapsePhrases("python data frame engine")).toBe("python dataframe engine");
    expect(collapsePhrases("command line argument parser")).toBe("cli argument parser");
    expect(collapsePhrases("terminal user interface toolkit")).toBe("terminal ui toolkit");
    expect(parseQuery("data frame engine").terms).toEqual(["dataframe", "engine"]);
  });
});

describe("IDF-weighted floor", () => {
  it("weights rare terms above frequent ones and needs the most distinctive one", () => {
    expect(idfWeight(1000, 2)).toBeGreaterThan(idfWeight(1000, 300));
    // "self hosted password manager": frequent self/hosted matched, rare password/manager not.
    const w = [idfWeight(1000, 300), idfWeight(1000, 280), idfWeight(1000, 4), idfWeight(1000, 30)];
    const generic = idfCoverage([2, 2, 0, 0], w);
    expect(w[generic.distinctive]).toBe(w[2]);
    expect(generic.coverage).toBeLessThan(0.4);
    expect(idfCoverage([2, 2, 2, 2], w).coverage).toBe(1);
    // A term in no head anywhere has the top weight and is required.
    expect(idfCoverage([2, 0], [1, idfWeight(1000, 0)]).distinctive).toBe(1);
  });
  it("generic shared words do not carry a query into an uncovered domain", async () => {
    expect(await search(db, e, "self hosted password manager")).toMatchObject({ results: [], notIndexed: true });
  });
});

describe("install for a query's language", () => {
  it("never offers another registry's command when the query names a language", () => {
    const npmOnly = { installPackage: "tui-cli", packageEcosystem: "npm", installKind: "package" as const, installOptions: [{ ecosystem: "npm", name: "tui-cli" }] };
    expect(chooseInstall(npmOnly, new Set(["PyPI"]))).toBeNull();
    expect(chooseInstall(npmOnly, new Set())).toEqual({ ecosystem: "npm", name: "tui-cli" });
  });
});

describe("query parsing and wording", () => {
  it("keeps names whole, separates language words, and builds exact keys", () => {
    const p = parseQuery("  React Hook Form ");
    expect(p.exactKeys).toEqual(expect.arrayContaining(["react hook form", "react-hook-form"]));
    const q = parseQuery("parse pdf tables in python");
    expect(q.terms).not.toContain("python");
    expect([...q.languages]).toEqual(["python"]);
  });
  it("never lets the local embedder admit on meaning; real embedders use the outlier rule", () => {
    expect(outlierRule("local", {})).toBeNull();
    expect(outlierRule("gte-small", {})).toEqual(OUTLIER_DEFAULTS);
    expect(outlierRule("gte-small", { SEARCH_OUTLIER_K: "4", SEARCH_OUTLIER_MARGIN: "0.05" })).toEqual({ k: 4, margin: 0.05 });
  });
  it("measures the pack robustly: one extreme value does not move the median or spread much", () => {
    const flat = Array.from({ length: 300 }, (_, i) => 0.8 + (i % 10) * 0.001);
    const a = robustStats(flat);
    const b = robustStats([...flat.slice(1), 0.99]);
    expect(a.median).toBeCloseTo(0.8045, 3);
    expect(Math.abs(a.spread - b.spread)).toBeLessThan(0.001);
    expect(robustStats([])).toEqual({ median: 0, spread: 0 });
  });
  it("explanations carry decision facts, not stars or 'good match'", () => {
    const w = explain({ archived: false, deprecated: false, advisoriesOpen: 0, pushedAt: new Date(Date.now() - 3 * 86_400_000), lastReleaseAt: null,
      packageName: "ws", installPackage: "ws", packageEcosystem: "npm", upvotes: 0, downvotes: 0, stars: 22000, installs: 0, deprecationMessage: null } as never, "strong", {}, {});
    expect(w).toMatch(/^Matches every term: last push 3 days ago, npm: ws, no open advisories\.$/);
    expect(w).not.toMatch(/stars|good match/i);
  });
});
