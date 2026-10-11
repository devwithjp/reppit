import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, items, type Db } from "@gitit/db";
import { parseRepoBatchResponse } from "../src/graphql";
import { storeRepos, prepareGraphqlResults, emptyCounts } from "../src/ingest";
import { resolveItemBySlug } from "../src/identity";
import { LocalEmbedder } from "../src/embeddings";
import type { FetchLike } from "../src/signals";

// Recorded-shape fixture; the live GraphQL path has not been run (no token available).
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/graphql-repo-batch.json"), "utf8"));
const refs = [{ owner: "vercel", name: "next.js" }, { owner: "facebook", name: "react" }, { owner: "nobody", name: "does-not-exist-xyz" }];
const noRegistry: FetchLike = async () => new Response("", { status: 404 });

let db: Db;
beforeAll(async () => { db = await createDb({}); }, 60_000);

describe("GraphQL batch → database", () => {
  it("adopts the legacy facebook/react row, stores true issue counts, and keeps old slugs resolving", async () => {
    const [legacy] = await db.insert(items).values({ kind: "repo", slug: "facebook/react", owner: "facebook", name: "react", url: "u", openIssues: null, upvotes: 3 }).returning();
    const counts = emptyCounts();
    const prepared = prepareGraphqlResults(parseRepoBatchResponse(fixture, refs), counts, new Date("2026-10-08T12:00:00Z"));
    await storeRepos(db, new LocalEmbedder(), prepared, { checkSignals: true, fetch: noRegistry, now: new Date("2026-10-08T12:00:00Z") }, counts);

    expect(counts).toMatchObject({ inserted: 1, adopted: 1, missing: 1, signalsChecked: 2 });
    const react = await resolveItemBySlug(db, "facebook/react");
    expect(react).toMatchObject({ viaAlias: true, item: { id: legacy.id, slug: "react/react", githubId: 10270250, upvotes: 3 } });
    const [next] = await db.select().from(items).where(eq(items.githubId, 70107786));
    expect(next.openIssues).toBe(1072);
    expect(next.openPullRequests).toBe(2494);
    // Private root package.json: no package, so signals are unknown, but the check is recorded.
    expect(next.deprecated).toBeNull();
    expect(next.advisoriesOpen).toBeNull();
    expect(next.signalsCheckedAt).not.toBeNull();
    expect(next.embedding).not.toBeNull();
  });

  it("re-running the same batch is idempotent", async () => {
    const counts = emptyCounts();
    await storeRepos(db, new LocalEmbedder(), prepareGraphqlResults(parseRepoBatchResponse(fixture, refs), counts), {}, counts);
    expect(counts).toMatchObject({ inserted: 0, updated: 2, renamed: 0 });
    expect((await db.select().from(items)).length).toBe(2);
  });
});
