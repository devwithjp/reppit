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
    return this.req<{ results: SearchResult[]; cached: boolean }>("GET", `/api/search?${q}`);
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
  reason?: "not enough data";
  base: number | null;
  voteAdjust: number;
  unknownCount: number;
  cells: { key: string; short: string; state: "good" | "slipping" | "failing" | "unknown"; label: string; points: number; max: number }[];
}

export interface SearchResult {
  item: {
    id: string; kind: "repo" | "skill" | "mcp"; slug: string; url: string; description: string | null; language: string | null;
    stars: number; installs: number; healthScore: number; upvotes: number; downvotes: number; license: string | null;
    archived?: boolean; deprecated?: boolean | null; advisoriesOpen?: number | null;
  };
  score: number; semantic: number; why: string;
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
  return t.score === null ? "trust: not enough data" : `trust ${t.score}/100`;
}

/** The install command an agent should run for a result. Libraries get a package-manager hint. */
export function installCommand(r: SearchResult["item"]): string {
  if (r.kind === "skill") return `npx skills add ${r.slug}`;
  if (r.kind === "mcp") return `# add to your MCP config: see ${r.url}`;
  const lang = (r.language ?? "").toLowerCase();
  const name = r.slug.split("/")[1];
  if (lang === "python") return `pip install ${name}   # verify the PyPI name at ${r.url}`;
  if (lang === "typescript" || lang === "javascript") return `npm install ${name}   # verify the npm name at ${r.url}`;
  if (lang === "rust") return `cargo add ${name}   # verify the crate name at ${r.url}`;
  if (lang === "go") return `go get github.com/${r.slug}`;
  return `git clone ${r.url}`;
}

export function formatResults(results: SearchResult[]): string {
  if (!results.length) return "No matches. Try different wording or submit the repo you end up using at reppit.dev.";
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
