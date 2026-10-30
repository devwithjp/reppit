import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, items, users, votes, type Db } from "@gitit/db";
import { castVote, recomputeAllItemScores, VoteError } from "../src/votes";
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

describe("recomputeAllItemScores (pglite)", () => {
  it("advances vote decay and the stored trust score without a new vote", async () => {
    const votedAt = new Date("2026-01-01T00:00:00Z");
    const [voter] = await db.insert(users).values({ login: "decay-voter", githubId: "decay-voter" }).returning();
    const [item] = await db.insert(items).values({
      slug: "decay/clock", owner: "decay", name: "clock", url: "https://example.test/decay/clock",
      createdAt: votedAt, pushedAt: votedAt, lastReleaseAt: votedAt,
      packageName: "clock", packageEcosystem: "npm", deprecated: false, advisoriesOpen: 0,
      openIssues: 0, closedIssues: 100,
    }).returning();
    await db.insert(votes).values({ userId: voter.id, itemId: item.id, direction: "up", weight: 2, createdAt: votedAt });

    const refreshed = await recomputeAllItemScores(db, new Date("2026-06-30T00:00:00Z"));
    const [stored] = await db.select({
      upvotes: items.upvotes, weightedScore: items.weightedScore,
      hotScore: items.hotScore, trustScore: items.trustScore,
    }).from(items).where(eq(items.id, item.id));

    expect(refreshed).toBe(3);
    expect(stored).toEqual({ upvotes: 1, weightedScore: 1, hotScore: 0, trustScore: 95 });
  });
});

describe("search (pglite + pgvector)", () => {
  it("ranks the relevant repo first and explains why", async () => {
    const { results: res } = await search(db, new LocalEmbedder(), "I need to extract tables from PDF files in Python");
    // express shares no term with the query, so it falls below the relevance floor.
    expect(res.map((r) => r.item.slug)).toEqual(["x/pdfplumber"]);
    expect(res[0].why).toMatch(/^(Exact name match|Matches every term|Partial match)/);
  });
  it("filters by language", async () => {
    const { results: res } = await search(db, new LocalEmbedder(), "web server", { language: "javascript" });
    expect(res.map((r) => r.item.slug)).toEqual(["y/express"]);
  });
  it("surfaces downvote reasons", async () => {
    await castVote(db, strongUserId, b, "down", "unmaintained");
    const { results: res } = await search(db, new LocalEmbedder(), "node web framework");
    const ex = res.find((r) => r.item.slug === "y/express")!;
    expect(ex.downvoteReasons.unmaintained).toBe(1);
  });
});
