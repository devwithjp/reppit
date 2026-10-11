import { describe, it, expect, beforeAll } from "vitest";
import { createDb, items, type Db } from "@gitit/db";
import { search, parseQuery, explain, semanticFloor } from "../src/search";
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
  it("labels a README-only hit partial, never strong", async () => {
    const { results: r } = await search(db, e, "orm", { limit: 10 });
    const notes = r.find((x) => x.item.slug === "jsdoc/notes");
    if (notes) expect(notes.match).toBe("partial");
    expect(r.find((x) => x.item.slug === "drizzle-team/drizzle-orm")!.match).not.toBe("partial");
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

describe("query parsing and wording", () => {
  it("keeps names whole, separates language words, and builds exact keys", () => {
    const p = parseQuery("  React Hook Form ");
    expect(p.exactKeys).toEqual(expect.arrayContaining(["react hook form", "react-hook-form"]));
    const q = parseQuery("parse pdf tables in python");
    expect(q.terms).not.toContain("python");
    expect([...q.languages]).toEqual(["python"]);
  });
  it("never lets the local embedder match on similarity alone", () => {
    expect(semanticFloor("local-hash-256", {})).toBe(Number.POSITIVE_INFINITY);
    expect(semanticFloor("openai:text-embedding-3-small", {})).toBe(0.45);
    expect(semanticFloor("local", { SEARCH_SEMANTIC_FLOOR: "0.3" })).toBe(0.3);
  });
  it("explanations carry decision facts, not stars or 'good match'", () => {
    const w = explain({ archived: false, deprecated: false, advisoriesOpen: 0, pushedAt: new Date(Date.now() - 3 * 86_400_000), lastReleaseAt: null,
      packageName: "ws", installPackage: "ws", packageEcosystem: "npm", upvotes: 0, downvotes: 0, stars: 22000, installs: 0, deprecationMessage: null } as never, "strong", {}, {});
    expect(w).toMatch(/^Matches every term: last push 3 days ago, npm: ws, no open advisories\.$/);
    expect(w).not.toMatch(/stars|good match/i);
  });
});
