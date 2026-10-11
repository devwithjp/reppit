import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, items, itemAliases, users, type Db, type NewItem } from "@gitit/db";
import { upsertRepoItem, resolveItemBySlug, applySignals, findItemByGithubId } from "../src/identity";
import { castVote } from "../src/votes";
import { search } from "../src/search";
import { LocalEmbedder, itemEmbeddingText } from "../src/embeddings";

let db: Db;
let voter: string;
const now = new Date("2026-10-11T00:00:00Z");

const repo = (githubId: number, slug: string, extra: Partial<NewItem> = {}): NewItem => {
  const [owner, name] = slug.split("/");
  return { kind: "repo", githubId, slug, owner, name, url: `https://github.com/${slug}`, description: `${name} repo`, stars: 100, pushedAt: now, healthScore: 0.9, ...extra };
};

beforeAll(async () => {
  db = await createDb({});
  const [u] = await db.insert(users).values({ login: "veteran", githubId: "77", githubCreatedAt: new Date("2015-01-01"), publicRepos: 60, followers: 300 }).returning();
  voter = u.id;
}, 60_000);

describe("upsertRepoItem: identity is github_id", () => {
  it("inserts, then follows a transfer (facebook/react -> react/react) without a new row", async () => {
    const a = await upsertRepoItem(db, repo(10270250, "facebook/react"), { now });
    expect(a.action).toBe("inserted");
    await castVote(db, voter, a.id, "up");

    const later = new Date("2026-10-12T00:00:00Z");
    const b = await upsertRepoItem(db, repo(10270250, "react/react", { owner: "react" }), { requestedSlug: "facebook/react", now: later });
    expect(b).toMatchObject({ id: a.id, action: "renamed", previousSlug: "facebook/react", slug: "react/react" });

    const rows = await db.select().from(items).where(eq(items.githubId, 10270250));
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("react/react");
    expect(rows[0].upvotes).toBe(1); // vote graph survives the rename
    const aliases = await db.select().from(itemAliases).where(eq(itemAliases.itemId, a.id));
    expect(aliases.map((x) => [x.slug, x.seenUntil.toISOString()])).toEqual([["facebook/react", later.toISOString()]]);
  });

  it("resolves the old slug through the alias, case-insensitively, with a redirect hint", async () => {
    const r = await resolveItemBySlug(db, "Facebook/React");
    expect(r?.viaAlias).toBe(true);
    expect(r?.item.slug).toBe("react/react");
    const live = await resolveItemBySlug(db, "REACT/react");
    expect(live?.viaAlias).toBe(false);
    expect(await resolveItemBySlug(db, "nobody/nothing")).toBeNull();
  });

  it("records the slug we asked for as an alias even if we never stored it (prisma/prisma -> prisma/orm)", async () => {
    const r = await upsertRepoItem(db, repo(192925833, "prisma/orm"), { requestedSlug: "prisma/prisma", now });
    expect(r.action).toBe("inserted");
    expect((await resolveItemBySlug(db, "prisma/prisma"))?.item.id).toBe(r.id);
  });

  it("adopts a legacy row (no github_id) found at the requested slug instead of duplicating it", async () => {
    const [legacy] = await db.insert(items).values({ kind: "repo", slug: "fabian-hiller/valibot", owner: "fabian-hiller", name: "valibot", url: "u" }).returning();
    const r = await upsertRepoItem(db, repo(495014986, "open-circle/valibot"), { requestedSlug: "fabian-hiller/valibot", now });
    expect(r).toMatchObject({ id: legacy.id, action: "adopted", previousSlug: "fabian-hiller/valibot" });
    expect((await findItemByGithubId(db, 495014986))?.slug).toBe("open-circle/valibot");
    expect((await resolveItemBySlug(db, "fabian-hiller/valibot"))?.item.id).toBe(legacy.id);
  });

  it("relabels a stale row that holds the canonical slug, so the unique slug never blocks the truth", async () => {
    const [stale] = await db.insert(items).values({ kind: "repo", githubId: 555, slug: "acme/tool", owner: "acme", name: "tool", url: "u" }).returning();
    const r = await upsertRepoItem(db, repo(556, "acme/tool"), { now });
    expect(r.displaced).toEqual([stale.id]);
    expect((await resolveItemBySlug(db, "acme/tool"))?.item.githubId).toBe(556); // live slug beats the stale row's alias
    const [s] = await db.select().from(items).where(eq(items.id, stale.id));
    expect(s.slug).toBe(`acme/tool~${stale.id.slice(0, 8)}`);
  });

  it("renaming back removes the alias that would shadow the live slug", async () => {
    const id = (await upsertRepoItem(db, repo(777, "a/one"), { now })).id;
    await upsertRepoItem(db, repo(777, "a/two"), { now });
    await upsertRepoItem(db, repo(777, "a/one"), { now });
    const aliases = await db.select({ slug: itemAliases.slug }).from(itemAliases).where(eq(itemAliases.itemId, id));
    expect(aliases.map((a) => a.slug)).toEqual(["a/two"]);
  });

  it("keeps signals and recomputes health from the merged row on re-ingest", async () => {
    const { id } = await upsertRepoItem(db, repo(888, "dep/lib", { openIssues: 1, lastReleaseAt: now }), { now });
    await applySignals(db, id, { packageEcosystem: "npm", packageName: "lib", deprecated: true, deprecationMessage: "use x", advisoriesOpen: null, signalsCheckedAt: now }, now);
    // A later hydration does not carry signals and computed healthScore without them.
    await upsertRepoItem(db, repo(888, "dep/lib", { openIssues: 1, lastReleaseAt: now, healthScore: 0.99 }), { now });
    const row = await findItemByGithubId(db, 888);
    expect(row?.deprecated).toBe(true);
    expect(row?.healthScore).toBe(0);
  });

  it("rejects rows without a github_id", async () => {
    await expect(upsertRepoItem(db, { ...repo(1, "x/y"), githubId: null })).rejects.toThrow(/githubId/);
  });
});

describe("search demotes deprecated items (pglite)", () => {
  it("a deprecated exact match ranks below a healthy weaker match", async () => {
    const e = new LocalEmbedder();
    const rows = [
      { slug: "request/request", text: "simplified http request client for node http requests" , deprecated: true },
      { slug: "sindresorhus/got", text: "human friendly http request library for node", deprecated: false },
    ];
    const vecs = await e.embed(rows.map((r) => itemEmbeddingText({ name: r.slug.split("/")[1], description: r.text })));
    for (const [i, r] of rows.entries()) {
      const { id } = await upsertRepoItem(db, repo(9000 + i, r.slug, { description: r.text, embedding: vecs[i], stars: r.deprecated ? 26000 : 14000 }), { now });
      await applySignals(db, id, { packageEcosystem: "npm", packageName: r.slug.split("/")[1], deprecated: r.deprecated, deprecationMessage: r.deprecated ? "request has been deprecated" : null, advisoriesOpen: r.deprecated ? 1 : 0, signalsCheckedAt: now }, now);
    }
    const { results: res } = await search(db, e, "http request library for node", { candidates: 50, limit: 10 });
    const slugs = res.map((r) => r.item.slug);
    expect(res.find((r) => r.item.slug === "request/request")!.semantic).toBeGreaterThan(res.find((r) => r.item.slug === "sindresorhus/got")!.semantic);
    expect(slugs.indexOf("sindresorhus/got")).toBeLessThan(slugs.indexOf("request/request"));
    const req = res.find((r) => r.item.slug === "request/request")!;
    expect(req.why).toMatch(/deprecated on npm/);
    expect(req.why).toMatch(/1 open security advisory/);
    expect(res.find((r) => r.item.slug === "sindresorhus/got")!.why).not.toMatch(/open security advisor/);
  });
});

describe("applySignals licence fill", () => {
  it("fills a missing or NOASSERTION licence from the registry but never overrides GitHub's", async () => {
    const mk = async (gid: number, slug: string, license: string | null) => (await upsertRepoItem(db, repo(gid, slug, { license }), { now })).id;
    const none = await mk(9100, "date-fns/date-fns", null);
    const unclear = await mk(9101, "acme/unclear", "NOASSERTION");
    const known = await mk(9102, "acme/known", "Apache-2.0");
    const s = { packageEcosystem: "npm", packageName: "x", deprecated: false, deprecationMessage: null, advisoriesOpen: 0, signalsCheckedAt: now, registryLicense: "MIT" };
    for (const id of [none, unclear, known]) await applySignals(db, id, s, now);
    const lic = async (id: string) => (await db.select({ l: items.license }).from(items).where(eq(items.id, id)))[0].l;
    expect([await lic(none), await lic(unclear), await lic(known)]).toEqual(["MIT", "MIT", "Apache-2.0"]);
  });
});
