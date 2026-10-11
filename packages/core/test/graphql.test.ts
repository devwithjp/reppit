import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildRepoBatchQuery, parseRepoBatchResponse, graphqlNodeToItem, pickReadme, manifestsOf, GitHubGraphQL, GraphQLHttpError,
  DEFAULT_BATCH_SIZE, type RepoRef, type GqlRepoNode,
} from "../src/graphql";

// NOTE: no GitHub token was available; this path is proven only against the recorded response shape.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/graphql-repo-batch.json"), "utf8"));
const refs: RepoRef[] = [{ owner: "vercel", name: "next.js" }, { owner: "facebook", name: "react" }, { owner: "nobody", name: "does-not-exist-xyz" }];

describe("buildRepoBatchQuery", () => {
  it("aliases one repository lookup per ref and asks for true issue and PR counts", () => {
    const q = buildRepoBatchQuery(refs);
    expect(q).toContain('r0: repository(owner: "vercel", name: "next.js") { ...Repo }');
    expect(q).toContain('r2: repository(owner: "nobody", name: "does-not-exist-xyz")');
    expect(q).toContain("issues(states: OPEN) { totalCount }");
    expect(q).toContain("pullRequests(states: OPEN) { totalCount }");
    expect(q).toContain("databaseId");
    expect(q).toContain("rateLimit { cost remaining resetAt }");
  });
  it("rejects refs that could inject into the query", () => {
    expect(() => buildRepoBatchQuery([{ owner: 'a") { x } #', name: "b" }])).toThrow(/invalid repo ref/);
  });
});

describe("parseRepoBatchResponse (recorded shape)", () => {
  const results = parseRepoBatchResponse(fixture, refs);
  it("returns results in request order, with partial failure isolated to its alias", () => {
    expect(results.map((r) => r.node?.nameWithOwner ?? null)).toEqual(["vercel/next.js", "react/react", null]);
    expect(results[2].error).toBe("NOT_FOUND");
    expect(results[0].error).toBeUndefined();
  });
  it("follows the facebook/react transfer: identity is the databaseId, slug is the new name", () => {
    const item = graphqlNodeToItem(results[1].node!, new Date("2026-10-08T12:00:00Z"));
    expect(results[1].requested).toEqual({ owner: "facebook", name: "react" });
    expect(item.githubId).toBe(10270250);
    expect(item.slug).toBe("react/react");
    expect(item.owner).toBe("react");
  });
  it("stores true open issues, not issues + PRs", () => {
    const item = graphqlNodeToItem(results[0].node!, new Date("2026-10-08T12:00:00Z"));
    expect(item.openIssues).toBe(1072);
    expect(item.openPullRequests).toBe(2494);
    expect(item.openIssues! + item.openPullRequests!).toBe(3566); // the REST figure
    expect(item.closedIssues).toBe(24310);
    expect(item.lastReleaseAt?.toISOString()).toBe("2026-10-06T18:35:31.000Z");
    expect(item.topics).toEqual(["react", "nextjs"]);
    expect(item.healthScore).toBeGreaterThan(0.8);
  });
  it("picks a real README over a pointer file, and exposes manifests for package signals", () => {
    expect(pickReadme(results[1].node!)).toMatch(/^# React/);
    expect(pickReadme(results[0].node!)).toBe("packages/next/README.md"); // only candidate found: kept, better than nothing
    expect(manifestsOf(results[0].node!).packageJson).toContain("nextjs-project");
  });
  it("treats a missing issues connection as unknown, not zero", () => {
    const node = { ...(results[0].node as GqlRepoNode), issues: null, pullRequests: null };
    expect(graphqlNodeToItem(node).openIssues).toBeNull();
  });
});

/** Fake GitHub GraphQL endpoint: answers each alias from a node factory, 502s above `maxOk` aliases. */
function fakeGitHub(maxOk: number, opts: { failAlways?: Set<string> } = {}) {
  const calls: number[] = [];
  const f = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    const aliases = [...body.query.matchAll(/r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)];
    calls.push(aliases.length);
    if (aliases.length > maxOk || aliases.some((a) => opts.failAlways?.has(`${a[2]}/${a[3]}`))) return new Response("<html>502 Bad Gateway</html>", { status: 502 });
    const data: Record<string, unknown> = { rateLimit: { cost: 1, remaining: 4000, resetAt: "2026-10-08T13:00:00Z" } };
    for (const [, i, owner, name] of aliases) data[`r${i}`] = { ...fixture.data.r0, databaseId: 1000 + Number(name.slice(1)), nameWithOwner: `${owner}/${name}`, name, owner: { login: owner } };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { f, calls };
}
const many = (n: number): RepoRef[] => Array.from({ length: n }, (_, i) => ({ owner: "o", name: `n${i}` }));

describe("GitHubGraphQL.fetchRepos", () => {
  it("refuses to run without a token", () => {
    expect(() => new GitHubGraphQL("")).toThrow(/requires a token/);
  });
  it("batches 30 per query by default", async () => {
    const { f, calls } = fakeGitHub(1000);
    const gh = new GitHubGraphQL("t", { fetch: f });
    const res = await gh.fetchRepos(many(65));
    expect(DEFAULT_BATCH_SIZE).toBe(30);
    expect(calls).toEqual([30, 30, 5]);
    expect(res).toHaveLength(65);
    expect(gh.stats.cost).toBe(3);
  });
  it("halves the batch on 502 until it fits, keeping every repo in order", async () => {
    const { f, calls } = fakeGitHub(8);
    const gh = new GitHubGraphQL("t", { fetch: f });
    const res = await gh.fetchRepos(many(30));
    expect(calls).toEqual([30, 15, 8, 7, 15, 8, 7]);
    expect(res.map((r) => r.node?.name)).toEqual(many(30).map((r) => r.name));
    expect(res.every((r) => !r.error)).toBe(true);
    expect(gh.stats.halvings).toBe(3);
  });
  it("gives up on a single repo that always 502s without losing the rest of the batch", async () => {
    const { f } = fakeGitHub(1000, { failAlways: new Set(["o/n3"]) });
    const gh = new GitHubGraphQL("t", { fetch: f });
    const res = await gh.fetchRepos(many(6));
    expect(res.filter((r) => r.node).length).toBe(5);
    expect(res[3]).toMatchObject({ requested: { name: "n3" }, node: null, error: "HTTP 502" });
    expect(gh.stats.failed).toBe(1);
  });
  it("does not retry non-gateway errors (e.g. bad credentials)", async () => {
    const gh = new GitHubGraphQL("t", { fetch: async () => new Response('{"message":"Bad credentials"}', { status: 401 }) });
    await expect(gh.fetchRepos(many(3))).rejects.toBeInstanceOf(GraphQLHttpError);
  });
});

describe("GitHubGraphQL.searchRepos", () => {
  it("returns refs and cursor, halving `first` on 502", async () => {
    const seen: number[] = [];
    const gh = new GitHubGraphQL("t", {
      fetch: async (_u, init) => {
        const { variables } = JSON.parse(String(init?.body)) as { variables: { first: number } };
        seen.push(variables.first);
        if (variables.first > 25) return new Response("", { status: 502 });
        return new Response(JSON.stringify({ data: { rateLimit: { cost: 1, remaining: 1 }, search: {
          repositoryCount: 5616, pageInfo: { endCursor: "Y3Vyc29yOjI1", hasNextPage: true },
          nodes: [{ databaseId: 1, name: "a", owner: { login: "x" } }, {}, { databaseId: 2, name: "b", owner: { login: "y" } }],
        } } }), { status: 200 });
      },
    });
    const page = await gh.searchRepos("topic:mcp-server stars:>300");
    expect(seen).toEqual([50, 25]);
    expect(page.refs).toEqual([{ owner: "x", name: "a", databaseId: 1 }, { owner: "y", name: "b", databaseId: 2 }]);
    expect(page).toMatchObject({ endCursor: "Y3Vyc29yOjI1", hasNextPage: true, total: 5616 });
  });
});
