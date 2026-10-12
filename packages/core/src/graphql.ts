/**
 * Batched GitHub GraphQL ingestion (docs/architecture/data-sources.md §1.2, §4).
 *
 * One query aliases up to 30 `repository(owner, name)` lookups and costs 1 rate-limit point
 * regardless of batch size. Batch size is bounded by GitHub's ~10 s gateway timeout, not quota:
 * a 502/504 means "too much work in one query", so the batch is halved and retried.
 *
 * Unlike REST, this path returns the true open issue count (`issues(states:OPEN)`, PRs excluded),
 * the numeric `databaseId` that is our repo identity, and the canonical `nameWithOwner` after any
 * rename or transfer (facebook/react resolves to react/react).
 */
import type { NewItem } from "@gitit/db";
import { healthScore } from "./ranking";
import type { FetchLike, RepoManifests } from "./signals";

export const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
export const DEFAULT_BATCH_SIZE = 30;
export const README_CANDIDATES = ["README.md", "readme.md", "README.rst", "README", "README.txt", "docs/README.md"] as const;

const README_SELECTION = README_CANDIDATES
  .map((p, i) => `readme${i}: object(expression: ${JSON.stringify(`HEAD:${p}`)}) { ... on Blob { text } }`)
  .join("\n  ");

export const REPO_FRAGMENT = `fragment Repo on Repository {
  databaseId
  nameWithOwner
  name
  owner { login }
  url
  description
  primaryLanguage { name }
  licenseInfo { spdxId }
  stargazerCount
  forkCount
  issues(states: OPEN) { totalCount }
  closedIssues: issues(states: CLOSED) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  pushedAt
  isArchived
  repositoryTopics(first: 25) { nodes { topic { name } } }
  latestRelease { publishedAt }
  ${README_SELECTION}
  packageJson: object(expression: "HEAD:package.json") { ... on Blob { text } }
  pyproject: object(expression: "HEAD:pyproject.toml") { ... on Blob { text } }
}`;

export interface RepoRef { owner: string; name: string }

export interface GqlRepoNode {
  databaseId: number;
  nameWithOwner: string;
  name: string;
  owner: { login: string };
  url: string;
  description: string | null;
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string | null } | null;
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number } | null;
  closedIssues?: { totalCount: number } | null;
  pullRequests: { totalCount: number } | null;
  pushedAt: string | null;
  isArchived: boolean;
  repositoryTopics: { nodes: { topic: { name: string } }[] } | null;
  latestRelease: { publishedAt: string | null } | null;
  packageJson?: { text: string | null } | null;
  pyproject?: { text: string | null } | null;
  [readme: `readme${number}`]: { text: string | null } | null | undefined;
}

export interface GqlError { type?: string; path?: (string | number)[]; message: string }
export interface GqlResponse<T> { data?: T | null; errors?: GqlError[] }

const SAFE = /^[A-Za-z0-9_.-]+$/;

/** Aliased batch query: r0..rN. Owner/name are validated and JSON-quoted, never interpolated raw. */
export function buildRepoBatchQuery(refs: RepoRef[]): string {
  const aliases = refs.map((r, i) => {
    if (!SAFE.test(r.owner) || !SAFE.test(r.name)) throw new Error(`invalid repo ref ${r.owner}/${r.name}`);
    return `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { ...Repo }`;
  });
  return `query { rateLimit { cost remaining resetAt }\n${aliases.join("\n")}\n}\n${REPO_FRAGMENT}`;
}

export interface RepoBatchResult {
  requested: RepoRef;
  node: GqlRepoNode | null;
  /** e.g. NOT_FOUND. A missing repo does not fail its batch: other aliases still resolve. */
  error?: string;
}

/** Split a batch response back into per-request results, in request order. */
export function parseRepoBatchResponse(json: GqlResponse<Record<string, unknown>>, refs: RepoRef[]): RepoBatchResult[] {
  const data = json.data ?? {};
  const errByAlias = new Map<string, string>();
  for (const e of json.errors ?? []) {
    const alias = e.path?.[0];
    if (typeof alias === "string") errByAlias.set(alias, e.type ?? e.message);
  }
  return refs.map((requested, i) => {
    const node = (data[`r${i}`] as GqlRepoNode | null | undefined) ?? null;
    const error = errByAlias.get(`r${i}`) ?? (node ? undefined : "NOT_FOUND");
    return { requested, node, ...(error ? { error } : {}) };
  });
}

/** First README candidate with real content (>200 chars, so pointer files lose); else the longest found. */
export function pickReadme(node: GqlRepoNode): string | null {
  const texts = README_CANDIDATES.map((_, i) => node[`readme${i}`]?.text ?? null).filter((t): t is string => !!t && t.trim().length > 0);
  const text = texts.find((t) => t.length > 200) ?? texts.sort((a, b) => b.length - a.length)[0] ?? null;
  return text ? text.slice(0, 60_000) : null;
}

export function manifestsOf(node: GqlRepoNode): RepoManifests {
  return { packageJson: node.packageJson?.text ?? null, pyproject: node.pyproject?.text ?? null };
}

/** Shape a GraphQL repository node as an item row (without embedding or package signals). */
export function graphqlNodeToItem(node: GqlRepoNode, now: Date = new Date()): NewItem {
  const pushedAt = node.pushedAt ? new Date(node.pushedAt) : null;
  const lastReleaseAt = node.latestRelease?.publishedAt ? new Date(node.latestRelease.publishedAt) : null;
  const license = node.licenseInfo?.spdxId ?? null;
  const openIssues = typeof node.issues?.totalCount === "number" ? node.issues.totalCount : null;
  const closedIssues = typeof node.closedIssues?.totalCount === "number" ? node.closedIssues.totalCount : null;
  const openPullRequests = typeof node.pullRequests?.totalCount === "number" ? node.pullRequests.totalCount : null;
  return {
    kind: "repo",
    githubId: node.databaseId,
    slug: node.nameWithOwner,
    owner: node.owner.login,
    name: node.name,
    url: node.url,
    description: node.description,
    readme: pickReadme(node),
    language: node.primaryLanguage?.name ?? null,
    topics: (node.repositoryTopics?.nodes ?? []).map((n) => n.topic.name),
    license,
    stars: node.stargazerCount,
    forks: node.forkCount,
    openIssues,
    closedIssues,
    openPullRequests,
    pushedAt,
    lastReleaseAt,
    archived: node.isArchived,
    healthScore: healthScore({ pushedAt, lastReleaseAt, openIssues, stars: node.stargazerCount, archived: node.isArchived, license }, now),
  };
}

export class GraphQLHttpError extends Error {
  constructor(public status: number, message: string, public resetAt?: Date) { super(message); }
  /** 502/504 = the query did too much work for GitHub's 10 s gateway; a smaller batch will pass. */
  get isGatewayTimeout() { return this.status === 502 || this.status === 504; }
  get isRateLimited() { return this.status === 403 || this.status === 429; }
}

export interface GraphQLClientOptions {
  fetch?: FetchLike;
  endpoint?: string;
  userAgent?: string;
  /** Per-request timeout. GitHub's gateway gives up at ~10 s; past that we treat it as a 502. */
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export interface BatchStats { queries: number; halvings: number; failed: number; cost: number; remaining: number | null }

export class GitHubGraphQL {
  private f: FetchLike;
  private endpoint: string;
  private ua: string;
  private timeoutMs: number;
  private log: (msg: string) => void;
  readonly stats: BatchStats = { queries: 0, halvings: 0, failed: 0, cost: 0, remaining: null };

  constructor(private token: string, opts: GraphQLClientOptions = {}) {
    if (!token) throw new Error("GitHubGraphQL requires a token: GitHub GraphQL has no unauthenticated access.");
    this.f = opts.fetch ?? fetch;
    this.endpoint = opts.endpoint ?? GRAPHQL_ENDPOINT;
    this.ua = opts.userAgent ?? "reppit-ingest (+https://reppit.dev)";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.log = opts.log ?? (() => {});
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<GqlResponse<T>> {
    this.stats.queries++;
    let res: Response;
    try {
      res = await this.f(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", "user-agent": this.ua },
        body: JSON.stringify(variables ? { query, variables } : { query }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // A client-side timeout is the same condition as a gateway 502: too much work per query.
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") throw new GraphQLHttpError(504, "client timeout");
      throw e;
    }
    if (!res.ok) {
      const reset = res.headers.get("x-ratelimit-reset");
      throw new GraphQLHttpError(res.status, `github graphql ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`, reset ? new Date(Number(reset) * 1000) : undefined);
    }
    // A 200 whose body is cut off mid-stream is the gateway giving up partway: treat it like a 504.
    let json: GqlResponse<T>;
    try { json = (await res.json()) as GqlResponse<T>; } catch { throw new GraphQLHttpError(504, "truncated response"); }
    const rl = (json.data as { rateLimit?: { cost: number; remaining: number } } | null | undefined)?.rateLimit;
    if (rl) { this.stats.cost += rl.cost; this.stats.remaining = rl.remaining; }
    if (!json.data && json.errors?.length) {
      const rateLimited = json.errors.some((e) => e.type === "RATE_LIMITED");
      throw new GraphQLHttpError(rateLimited ? 429 : 400, `github graphql: ${json.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    }
    return json;
  }

  /** Hydrate repos in aliased batches of `batchSize` (default 30), halving on 502/504. */
  async fetchRepos(refs: RepoRef[], batchSize = DEFAULT_BATCH_SIZE): Promise<RepoBatchResult[]> {
    const out: RepoBatchResult[] = [];
    for (let i = 0; i < refs.length; i += batchSize) out.push(...(await this.fetchChunk(refs.slice(i, i + batchSize))));
    return out;
  }

  private async fetchChunk(refs: RepoRef[]): Promise<RepoBatchResult[]> {
    try {
      const json = await this.query<Record<string, unknown>>(buildRepoBatchQuery(refs));
      return parseRepoBatchResponse(json, refs);
    } catch (e) {
      if (!(e instanceof GraphQLHttpError) || !e.isGatewayTimeout) throw e;
      if (refs.length === 1) {
        this.stats.failed++;
        this.log(`  gateway timeout on single repo ${refs[0].owner}/${refs[0].name}; skipping`);
        return [{ requested: refs[0], node: null, error: `HTTP ${e.status}` }];
      }
      const mid = Math.ceil(refs.length / 2);
      this.stats.halvings++;
      this.log(`  ${e.status} on batch of ${refs.length}; retrying as ${mid} + ${refs.length - mid}`);
      return [...(await this.fetchChunk(refs.slice(0, mid))), ...(await this.fetchChunk(refs.slice(mid)))];
    }
  }

  /**
   * One page of repository search. Returns refs only; hydration goes through fetchRepos so every
   * row is written from the same field set. `first` halves on 502 (first:100 times out, 50 is safe).
   */
  async searchRepos(q: string, opts: { first?: number; after?: string | null } = {}): Promise<{ refs: (RepoRef & { databaseId: number })[]; endCursor: string | null; hasNextPage: boolean; total: number }> {
    let first = opts.first ?? 50;
    for (;;) {
      try {
        const json = await this.query<{ search: { repositoryCount: number; pageInfo: { endCursor: string | null; hasNextPage: boolean }; nodes: ({ databaseId: number; name: string; owner: { login: string } } | Record<string, never> | null)[] } }>(
          `query($q: String!, $first: Int!, $after: String) { rateLimit { cost remaining resetAt }
            search(query: $q, type: REPOSITORY, first: $first, after: $after) {
              repositoryCount pageInfo { endCursor hasNextPage }
              nodes { ... on Repository { databaseId name owner { login } } }
            } }`,
          { q, first, after: opts.after ?? null },
        );
        const s = json.data!.search;
        const refs = s.nodes
          .filter((n): n is { databaseId: number; name: string; owner: { login: string } } => !!n && typeof (n as { databaseId?: unknown }).databaseId === "number")
          .map((n) => ({ owner: n.owner.login, name: n.name, databaseId: n.databaseId }));
        return { refs, endCursor: s.pageInfo.endCursor, hasNextPage: s.pageInfo.hasNextPage, total: s.repositoryCount };
      } catch (e) {
        if (e instanceof GraphQLHttpError && e.isGatewayTimeout && first > 5) { first = Math.ceil(first / 2); this.stats.halvings++; continue; }
        throw e;
      }
    }
  }
}
