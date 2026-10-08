/** Thin HTTP client shared by the MCP server and CLI. */
export interface GititClientOptions { baseUrl?: string; apiKey?: string }

export class GititClient {
  baseUrl: string; apiKey?: string;
  constructor(o: GititClientOptions = {}) {
    this.baseUrl = (o.baseUrl ?? process.env.GITIT_API_URL ?? "https://gitit.dev").replace(/\/$/, "");
    this.apiKey = o.apiKey ?? process.env.GITIT_API_KEY;
  }
  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { "content-type": "application/json", "user-agent": "gitit-mcp", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`gitit API ${res.status}: ${text}`);
    return JSON.parse(text) as T;
  }
  search(problem: string, opts: { language?: string; kind?: string; limit?: number } = {}) {
    const q = new URLSearchParams({ q: problem, ...(opts.language ? { language: opts.language } : {}), ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.limit ? { limit: String(opts.limit) } : {}) });
    return this.req<{ results: SearchResult[]; cached: boolean }>("GET", `/api/search?${q}`);
  }
  item(slug: string) { return this.req<ItemDetail>("GET", `/api/items/by-slug/${slug}`); }
  vote(slug: string, direction: "up" | "down", reason?: string) { return this.req<unknown>("POST", `/api/items/by-slug/${slug}/vote`, { direction, reason }); }
  reportCompat(slug: string, agent: string, status: "works" | "broken", note?: string) { return this.req<unknown>("POST", `/api/items/by-slug/${slug}/compat`, { agent, status, note }); }
}

export interface SearchResult {
  item: { id: string; kind: "repo" | "skill" | "mcp"; slug: string; url: string; description: string | null; language: string | null; stars: number; installs: number; healthScore: number; upvotes: number; downvotes: number; license: string | null };
  score: number; semantic: number; why: string;
  downvoteReasons: Record<string, number>;
  compat: Record<string, { works: number; broken: number }>;
}
export type ItemDetail = SearchResult["item"] & { readme?: string | null; topics: string[]; commentCount: number; comments?: { body: string; user: string; createdAt: string }[] };

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
  if (!results.length) return "No matches. Try different wording or submit the repo you end up using at gitit.";
  return results.map((r, i) => {
    const net = r.item.upvotes - r.item.downvotes;
    const flags = Object.entries(r.downvoteReasons).map(([k, v]) => `${k}×${v}`).join(", ");
    const compat = Object.entries(r.compat).map(([a, v]) => `${a}: ${v.works}✓/${v.broken}✗`).join(", ");
    return [
      `${i + 1}. ${r.item.slug} (${r.item.kind}) — ${r.item.url}`,
      `   ${r.item.description ?? ""}`,
      `   why: ${r.why}`,
      `   votes ${net >= 0 ? "+" : ""}${net} · health ${(r.item.healthScore * 100).toFixed(0)}% · ★${r.item.stars}${r.item.installs ? ` · ${r.item.installs} installs` : ""}${r.item.license ? ` · ${r.item.license}` : ""}`,
      flags ? `   flags: ${flags}` : null,
      compat ? `   agents: ${compat}` : null,
      `   install: ${installCommand(r.item)}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}
