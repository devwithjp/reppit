import { describe, it, expect, beforeAll } from "vitest";
import { createDb, items, users, type Db } from "@gitit/db";
import { castVote, VoteError } from "../src/votes";
import { search } from "../src/search";
import { LocalEmbedder, itemEmbeddingText } from "../src/embeddings";

let db: Db;
let userId: string; let strongUserId: string; let a: string; let b: string;

beforeAll(async () => {
  db = await createDb({});
  const [u] = await db.insert(users).values({ login: "newbie", githubId: "1", githubCreatedAt: new Date(), publicRepos: 0 }).returning();
  const [s] = await db.insert(users).values({ login: "veteran", githubId: "2", githubCreatedAt: new Date("2015-01-01"), publicRepos: 60, followers: 300 }).returning();
  userId = u.id; strongUserId = s.id;
  const e = new LocalEmbedder();
  const rows = [
    { slug: "x/pdfplumber", owner: "x", name: "pdfplumber", url: "u1", description: "Extract text and tables from PDF files", language: "Python", topics: ["pdf", "table-extraction"], readme: "pdfplumber pdf tables text extraction python" },
    { slug: "y/express", owner: "y", name: "express", url: "u2", description: "Fast minimalist web framework for node", language: "JavaScript", topics: ["http", "server"], readme: "express web framework node routing" },
  ];
  const vecs = await e.embed(rows.map(itemEmbeddingText));
  const inserted = await db.insert(items).values(rows.map((r, i) => ({ ...r, kind: "repo" as const, embedding: vecs[i], embeddedAt: new Date(), healthScore: 0.8 }))).returning({ id: items.id, slug: items.slug });
  a = inserted.find((i) => i.slug === "x/pdfplumber")!.id; b = inserted.find((i) => i.slug === "y/express")!.id;
}, 60_000);

describe("castVote (pglite)", () => {
  it("rejects downvotes without a reason", async () => {
    await expect(castVote(db, userId, a, "down")).rejects.toBeInstanceOf(VoteError);
  });
  it("records an upvote and weights it by reputation", async () => {
    const r1 = await castVote(db, userId, a, "up");
    expect(r1.upvotes).toBe(1); expect(r1.weightedScore).toBeLessThan(0.5);
    const r2 = await castVote(db, strongUserId, a, "up");
    expect(r2.upvotes).toBe(2); expect(r2.weightedScore).toBeGreaterThan(r1.weightedScore + 1);
  });
  it("changes a vote in place and removes it with null", async () => {
    const r = await castVote(db, userId, a, "down", "unmaintained");
    expect(r.upvotes).toBe(1); expect(r.downvotes).toBe(1);
    const r2 = await castVote(db, userId, a, null);
    expect(r2.downvotes).toBe(0);
  });
});

describe("search (pglite + pgvector)", () => {
  it("ranks the relevant repo first and explains why", async () => {
    const res = await search(db, new LocalEmbedder(), "I need to extract tables from PDF files in Python");
    expect(res.length).toBe(2);
    expect(res[0].item.slug).toBe("x/pdfplumber");
    expect(res[0].why).toMatch(/match/);
  });
  it("filters by language", async () => {
    const res = await search(db, new LocalEmbedder(), "web server", { language: "javascript" });
    expect(res.map((r) => r.item.slug)).toEqual(["y/express"]);
  });
  it("surfaces downvote reasons", async () => {
    await castVote(db, strongUserId, b, "down", "unmaintained");
    const res = await search(db, new LocalEmbedder(), "node web framework");
    const ex = res.find((r) => r.item.slug === "y/express")!;
    expect(ex.downvoteReasons.unmaintained).toBe(1);
  });
});
