import { healthScore } from "./ranking";
import type { NewItem } from "@gitit/db";

/** Minimal GitHub REST client for ingestion. Uses GITHUB_TOKEN when present (5000 req/h vs 60). */
export class GitHubClient {
  constructor(private token = process.env.GITHUB_TOKEN, private base = "https://api.github.com") {}

  async get<T>(path: string, accept = "application/vnd.github+json"): Promise<T | null> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { accept, "user-agent": "gitit-ingest", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async repo(owner: string, name: string) {
    return this.get<GhRepo>(`/repos/${owner}/${name}`);
  }
  async readme(owner: string, name: string): Promise<string | null> {
    const res = await fetch(`${this.base}/repos/${owner}/${name}/readme`, {
      headers: { accept: "application/vnd.github.raw+json", "user-agent": "gitit-ingest", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, README_MAX_CHARS);
  }
  async latestRelease(owner: string, name: string) {
    return this.get<{ published_at: string }>(`/repos/${owner}/${name}/releases/latest`);
  }
  async trending(language: string, since = "weekly", perPage = 30) {
    const date = new Date(Date.now() - (since === "daily" ? 1 : since === "monthly" ? 30 : 7) * 86_400_000).toISOString().slice(0, 10);
    const q = encodeURIComponent(`language:${language} created:>${date}`);
    const json = await this.get<{ items: GhRepo[] }>(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`);
    return json?.items ?? [];
  }
  async search(query: string, perPage = 30) {
    const json = await this.get<{ items: GhRepo[] }>(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`);
    return json?.items ?? [];
  }
}

export interface GhRepo {
  /** Numeric databaseId. REST follows 301s for renamed/transferred repos, so this is canonical. */
  id: number;
  full_name: string; name: string; owner: { login: string }; html_url: string; description: string | null;
  language: string | null; topics?: string[]; license: { spdx_id: string } | null; stargazers_count: number;
  forks_count: number; open_issues_count: number; pushed_at: string; archived: boolean;
}

/** Fetch everything we need for one repo and shape it as an item row (without embedding). */
export async function ingestRepo(gh: GitHubClient, owner: string, name: string): Promise<NewItem | null> {
  const r = await gh.repo(owner, name);
  if (!r) return null;
  const [readme, release] = await Promise.all([gh.readme(owner, name), gh.latestRelease(owner, name).catch(() => null)]);
  return repoToItem(r, readme, release?.published_at ? new Date(release.published_at) : null);
}

/**
 * Shape a REST repo as an item row. REST `open_issues_count` counts open pull requests as issues
 * (vercel/next.js: 3,566 = 1,072 issues + 2,494 PRs, measured 2026-10-08), and there is no cheap
 * REST call for the true number, so on this path openIssues is stored as null (unknown) and the
 * health score ignores issue load. The GraphQL path (graphqlNodeToItem) stores the true count.
 */
export function repoToItem(r: GhRepo, readme: string | null, lastReleaseAt: Date | null): NewItem {
  const pushedAt = r.pushed_at ? new Date(r.pushed_at) : null;
  const license = r.license?.spdx_id ?? null;
  return {
    kind: "repo",
    githubId: r.id,
    slug: r.full_name,
    owner: r.owner.login,
    name: r.name,
    url: r.html_url,
    description: r.description,
    readme,
    language: r.language,
    topics: r.topics ?? [],
    license,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: null,
    closedIssues: null,
    openPullRequests: null,
    pushedAt,
    lastReleaseAt,
    archived: r.archived,
    healthScore: healthScore({ pushedAt, lastReleaseAt, openIssues: null, stars: r.stargazers_count, archived: r.archived, license }),
  };
}

export function parseRepoRef(input: string): { owner: string; name: string } | null {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

/** Discover SKILL.md folders in a repo (e.g. anthropics/skills → skills/<name>/SKILL.md) and shape them as skill items. */
export async function ingestSkillsFromRepo(gh: GitHubClient, owner: string, repo: string, dir = "skills"): Promise<NewItem[]> {
  const r = await gh.repo(owner, repo);
  if (!r) return [];
  const entries = await gh.get<{ name: string; type: string; path: string; html_url: string }[]>(`/repos/${owner}/${repo}/contents/${dir}`).catch(() => null);
  if (!entries) return [];
  const out: NewItem[] = [];
  for (const e of entries) {
    if (e.type !== "dir") continue;
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${e.path}/SKILL.md`, { headers: { "user-agent": "gitit-ingest" } });
    if (!res.ok) continue;
    const md = await res.text();
    const fm = parseFrontmatter(md);
    const pushedAt = r.pushed_at ? new Date(r.pushed_at) : null;
    out.push({
      kind: "skill",
      slug: `${owner}/${repo}/${e.path}`,
      owner,
      name: fm.name ?? e.name,
      url: e.html_url,
      description: fm.description ?? null,
      readme: md.slice(0, 20_000),
      language: null,
      topics: ["agent-skill", ...(fm.description ? [] : [])],
      license: r.license?.spdx_id ?? null,
      // A skill is one folder in a repo: the repo's stars and forks are not the skill's own, and
      // showing them (296k on a single skill) floods popularity-weighted results. Unknown is 0 here.
      stars: 0,
      forks: 0,
      // Skills are paths inside a repo: no github_id of their own, and the repo's issue count is not
      // the skill's. Unknown, not zero.
      openIssues: null,
      pushedAt,
      lastReleaseAt: null,
      archived: r.archived,
      healthScore: healthScore({ pushedAt, lastReleaseAt: null, openIssues: null, stars: r.stargazers_count, archived: r.archived, license: r.license?.spdx_id ?? null }),
    });
  }
  return out;
}

export function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Stored README length, shared by the REST ingester and the raw-CDN path. */
export const README_MAX_CHARS = 60_000;
export const README_FILES = ["README.md", "readme.md", "README.rst", "README", "Readme.md", "README.markdown"];

/**
 * README from raw.githubusercontent.com at HEAD (the content CDN, no API quota). Tries the usual
 * file names in order and returns the first, truncated like the REST ingester. Null when none exists.
 * With `strict`, a 429/5xx or network error throws so a batch job can retry the repo later.
 */
export async function fetchReadmeRaw(owner: string, name: string, f: (url: string, init?: RequestInit) => Promise<Response> = fetch, opts: { strict?: boolean } = {}): Promise<string | null> {
  for (const file of README_FILES) {
    let r: Response;
    try {
      r = await f(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`, { headers: { "user-agent": "reppit-ingest (+https://reppit.dev)" } });
    } catch (e) { if (opts.strict) throw e; return null; }
    if (r.ok) { const text = await r.text(); if (text.trim()) return text.slice(0, README_MAX_CHARS); continue; }
    if (opts.strict && (r.status === 429 || r.status >= 500)) throw new Error(`raw ${owner}/${name}/${file} ${r.status}`);
  }
  return null;
}
