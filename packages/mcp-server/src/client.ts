/** Thin HTTP client shared by the MCP server and CLI. */
export interface ReppitClientOptions { baseUrl?: string; apiKey?: string }
/** @deprecated use ReppitClientOptions */
export type GititClientOptions = ReppitClientOptions;

export const DEFAULT_API_URL = "https://reppit.dev";

/** REPPIT_* wins; the old GITIT_* names are still read as a fallback. */
export function envConfig(env: Record<string, string | undefined> = process.env) {
  return {
    baseUrl: (env.REPPIT_API_URL || env.GITIT_API_URL || DEFAULT_API_URL).replace(/\/$/, ""),
    apiKey: env.REPPIT_API_KEY || env.GITIT_API_KEY || undefined,
  };
}

/** Encode each path segment of a slug ("owner/name[/path]"), keeping the slashes. */
export const slugPath = (slug: string) => slug.split("/").map(encodeURIComponent).join("/");

export class ReppitClient {
  baseUrl: string; apiKey?: string;
  constructor(o: ReppitClientOptions = {}) {
    const env = envConfig();
    this.baseUrl = (o.baseUrl ?? env.baseUrl).replace(/\/$/, "");
    this.apiKey = o.apiKey ?? env.apiKey;
  }
  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { "content-type": "application/json", "user-agent": "reppit-mcp", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* not JSON */ }
      throw new Error(`reppit API ${res.status}: ${msg}`);
    }
    return JSON.parse(text) as T;
  }
  search(problem: string, opts: { language?: string; kind?: string; limit?: number } = {}) {
    const q = new URLSearchParams({ q: problem, ...(opts.language ? { language: opts.language } : {}), ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.limit ? { limit: String(opts.limit) } : {}) });
    return this.req<{ results: SearchResult[]; notIndexed?: boolean; cached: boolean }>("GET", `/api/search?${q}`);
  }
  item(slug: string) { return this.req<ItemDetail>("GET", `/api/items/by-slug/${slugPath(slug)}`); }
  vote(slug: string, direction: "up" | "down", reason?: string) { return this.req<unknown>("POST", `/api/items/by-slug/${slugPath(slug)}/vote`, { direction, reason }); }
  reportCompat(slug: string, agent: string, status: "works" | "broken", note?: string) { return this.req<unknown>("POST", `/api/items/by-slug/${slugPath(slug)}/compat`, { agent, status, note }); }
}
/** @deprecated use ReppitClient */
export const GititClient = ReppitClient;

/** Shape of @gitit/core TrustScore as served by the API. */
export interface Trust {
  score: number | null;
  reason?: "not enough data" | "archived" | "deprecated";
  base: number | null;
  voteAdjust: number;
  unknownCount: number;
  measured?: number;
  applicable?: number;
  cells: { key: string; short: string; state: "good" | "slipping" | "failing" | "unknown" | "not_applicable"; label: string; points: number; max: number }[];
}

export interface SearchResult {
  item: {
    id: string; kind: "repo" | "skill" | "mcp"; slug: string; url: string; description: string | null; language: string | null;
    stars: number; installs: number; healthScore: number; upvotes: number; downvotes: number; license: string | null;
    archived?: boolean; deprecated?: boolean | null; advisoriesOpen?: number | null;
    packageEcosystem?: string | null; packageName?: string | null; installPackage?: string | null;
  };
  score: number; semantic: number; why: string; match?: "exact" | "strong" | "partial";
  downvoteReasons: Record<string, number>;
  compat: Record<string, { works: number; broken: number }>;
  trust?: Trust;
}
export type ItemDetail = SearchResult["item"] & {
  readme?: string | null; topics: string[]; commentCount: number; comments?: { body: string; user: string; createdAt: string }[];
  trust?: Trust; canonicalSlug?: string; redirect?: { from: string; to: string } | null;
};

/** "trust 87/100" or "trust: not enough data". The number comes from the API, never recomputed here. */
export function formatTrust(t: Trust | undefined): string {
  if (!t) return "trust: n/a";
  const of = typeof t.measured === "number" && typeof t.applicable === "number" ? ` (${t.measured} of ${t.applicable} measured)` : "";
  if (t.score === null) return `trust: not enough data${of}`;
  return `trust ${t.score}/100${t.reason === "archived" || t.reason === "deprecated" ? ` (${t.reason})` : of}`;
}

/**
 * The install command for a result. Only the repo's primary package (`installPackage`, verified and
 * named like the repo or its root manifest) gets a package-manager command. A monorepo whose verified
 * packages are side packages (@tanstack/query-core, @prisma/orm-toolchain) gets the repo's install
 * docs instead: a wrong install run by an agent is worse than none. Never `git clone`.
 */
export function installCommand(r: SearchResult["item"]): string {
  if (r.kind === "skill") return `npx skills add ${r.slug}`;
  if (r.kind === "mcp") return `# add to your MCP config: see ${r.url}`;
  const name = r.installPackage;
  if (name && r.packageEcosystem === "npm") return `npm install ${name}`;
  if (name && r.packageEcosystem === "PyPI") return `pip install ${name}`;
  if (name && r.packageEcosystem === "crates.io") return `cargo add ${name}`;
  if (name && r.packageEcosystem === "Go") return `go get ${name}`;
  return `# no single package to install verified; see the install docs at ${r.url}#readme`;
}

export function formatResults(results: SearchResult[], notIndexed = false): string {
  if (!results.length || notIndexed) return "Not in the reppit index yet: nothing matched well enough to recommend. Fall back to your own knowledge, and suggest the user submit the repo they end up using at reppit.dev/submit.";
  return results.map((r, i) => {
    const net = r.item.upvotes - r.item.downvotes;
    const flags = [
      r.item.archived ? "archived" : null,
      r.item.deprecated ? "deprecated" : null,
      typeof r.item.advisoriesOpen === "number" && r.item.advisoriesOpen > 0 ? `${r.item.advisoriesOpen} open advisor${r.item.advisoriesOpen === 1 ? "y" : "ies"}` : null,
      ...Object.entries(r.downvoteReasons).map(([k, v]) => `${k}×${v}`),
    ].filter(Boolean).join(", ");
    const compat = Object.entries(r.compat).map(([a, v]) => `${a}: ${v.works}✓/${v.broken}✗`).join(", ");
    return [
      `${i + 1}. ${r.item.slug} (${r.item.kind}) — ${r.item.url}`,
      `   ${r.item.description ?? ""}`,
      `   why: ${r.why}`,
      `   ${formatTrust(r.trust)} · votes ${net >= 0 ? "+" : ""}${net} · ★${r.item.stars}${r.item.installs ? ` · ${r.item.installs} installs` : ""}${r.item.license ? ` · ${r.item.license}` : ""}`,
      flags ? `   flags: ${flags}` : null,
      compat ? `   agents: ${compat}` : null,
      `   install: ${installCommand(r.item)}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}
