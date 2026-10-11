/**
 * Zero-user signals: registry deprecation and open advisories, for repos that publish a package.
 *
 * Rules (DECISIONS.md "Never render a missing advisory count as zero"):
 * - A field we could not check is null, never false/0.
 * - A package only counts as this repo's if the registry's repository link points back at the repo
 *   (by current slug or a known alias). Name collisions are common; an unverified match is ignored.
 * - Sources: npm registry, PyPI JSON, OSV.dev (CC-BY-4.0). ecosyste.ms is deliberately not used
 *   here because it is CC-BY-SA and these values feed the ranker.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const SIGNALS_USER_AGENT = "reppit-ingest (+https://reppit.dev)";

export interface PackageRef { ecosystem: "npm" | "PyPI"; name: string }

export interface PackageSignals {
  packageEcosystem: "npm" | "PyPI" | null;
  packageName: string | null;
  /** null when no verified package was found. */
  deprecated: boolean | null;
  deprecationMessage: string | null;
  /** null when no verified package, or the advisory lookup failed. */
  advisoriesOpen: number | null;
  signalsCheckedAt: Date;
}

/** `name` from a package.json, or null when absent, unparsable, or `private: true`. */
export function packageNameFromPackageJson(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text) as { name?: unknown; private?: unknown };
    if (j.private === true || typeof j.name !== "string" || !j.name.trim()) return null;
    return j.name.trim();
  } catch { return null; }
}

/** `[project] name` (PEP 621) or `[tool.poetry] name` from a pyproject.toml. Minimal TOML reading. */
export function packageNameFromPyproject(text: string | null | undefined): string | null {
  if (!text) return null;
  let section = "";
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { section = sec[1].trim(); continue; }
    const kv = line.match(/^name\s*=\s*["']([^"']+)["']$/);
    if (kv && (section === "project" || section === "tool.poetry") && !found[section]) found[section] = kv[1].trim();
  }
  return found["project"] ?? found["tool.poetry"] ?? null;
}

/** Normalise any GitHub repository reference to lower-case "owner/name", or null. */
export function githubSlugFromUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  const m =
    s.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/i) ??
    s.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i) ??
    s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/); // npm "user/repo" shorthand
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

function matchesRepo(candidates: unknown[], slugs: string[]): boolean {
  const want = new Set(slugs.map((s) => s.toLowerCase()));
  return candidates.some((c) => { const s = githubSlugFromUrl(c); return !!s && want.has(s); });
}

interface NpmLatest { name?: string; version?: string; deprecated?: unknown; repository?: unknown }

/** npm: the `latest` version manifest carries `deprecated` (a string when deprecated) and `repository`. */
export async function checkNpm(name: string, slugs: string[], f: FetchLike = fetch) {
  const path = name.startsWith("@") ? name.replace("/", "%2f") : encodeURIComponent(name);
  const res = await f(`https://registry.npmjs.org/${path}/latest`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`npm ${name} ${res.status}`);
  const j = (await res.json()) as NpmLatest;
  const repo = j.repository;
  const repoUrl = typeof repo === "string" ? repo : repo && typeof repo === "object" ? (repo as { url?: unknown }).url : null;
  if (!matchesRepo([repoUrl], slugs)) return null;
  const deprecated = typeof j.deprecated === "string" ? j.deprecated.trim() || "deprecated" : j.deprecated === true ? "deprecated" : null;
  return { ecosystem: "npm" as const, name, version: j.version ?? null, deprecated: deprecated !== null, deprecationMessage: deprecated };
}

interface PypiInfo { name?: string; version?: string; yanked?: boolean; yanked_reason?: string | null; classifiers?: string[]; project_urls?: Record<string, string> | null; home_page?: string | null }

/** PyPI: latest release yanked, or "Development Status :: 7 - Inactive", counts as deprecated. */
export async function checkPypi(name: string, slugs: string[], f: FetchLike = fetch) {
  const res = await f(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pypi ${name} ${res.status}`);
  const info = ((await res.json()) as { info?: PypiInfo }).info ?? {};
  if (!matchesRepo([...Object.values(info.project_urls ?? {}), info.home_page], slugs)) return null;
  const inactive = (info.classifiers ?? []).some((c) => /^Development Status :: 7 - Inactive/.test(c));
  const message = info.yanked ? `latest release yanked${info.yanked_reason ? `: ${info.yanked_reason}` : ""}` : inactive ? "Development Status :: 7 - Inactive" : null;
  return { ecosystem: "PyPI" as const, name: info.name ?? name, version: info.version ?? null, deprecated: message !== null, deprecationMessage: message };
}

interface OsvVuln { id: string; aliases?: string[]; withdrawn?: string }

/**
 * Distinct, non-withdrawn OSV advisories affecting `version`. OSV lists one vulnerability under
 * several ids (GHSA-…, PYSEC-…), so ids are merged through their `aliases` before counting.
 * Returns null on any failure: an unanswered check is unknown, not zero.
 */
export async function osvOpenAdvisories(pkg: PackageRef, version: string, f: FetchLike = fetch): Promise<number | null> {
  try {
    const res = await f("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": SIGNALS_USER_AGENT },
      body: JSON.stringify({ queries: [{ package: { name: pkg.name, ecosystem: pkg.ecosystem }, version }] }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { vulns?: { id: string }[]; next_page_token?: string }[] };
    const r = j.results?.[0];
    if (!r) return null;
    if (r.next_page_token) return null; // more than one page: we would undercount, so say unknown
    const ids = (r.vulns ?? []).map((v) => v.id);
    if (ids.length === 0) return 0;
    const details = await Promise.all(ids.map(async (id) => {
      const d = await f(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { headers: { "user-agent": SIGNALS_USER_AGENT } });
      if (!d.ok) throw new Error(`osv ${id} ${d.status}`);
      return (await d.json()) as OsvVuln;
    }));
    return countDistinctAdvisories(details);
  } catch { return null; }
}

/** Union-find over ids and aliases; withdrawn entries are dropped. */
export function countDistinctAdvisories(vulns: OsvVuln[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let p = parent.get(x) ?? x; if (p !== x) { p = find(p); parent.set(x, p); } return p; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const live = vulns.filter((v) => !v.withdrawn);
  for (const v of live) { parent.set(v.id, find(v.id)); for (const a of v.aliases ?? []) union(v.id, a); }
  return new Set(live.map((v) => find(v.id))).size;
}

export interface RepoManifests { packageJson?: string | null; pyproject?: string | null }

/**
 * Check one repo's zero-user signals. `slugs` = current slug plus known aliases (all lower-cased
 * internally). Returns null when a registry call failed outright, so callers leave existing values
 * untouched rather than overwrite them with unknowns.
 */
export async function checkPackageSignals(slugs: string[], manifests: RepoManifests, f: FetchLike = fetch, now = new Date()): Promise<PackageSignals | null> {
  const none: PackageSignals = { packageEcosystem: null, packageName: null, deprecated: null, deprecationMessage: null, advisoriesOpen: null, signalsCheckedAt: now };
  try {
    const npmName = packageNameFromPackageJson(manifests.packageJson);
    const pyName = packageNameFromPyproject(manifests.pyproject);
    const hit = (npmName ? await checkNpm(npmName, slugs, f) : null) ?? (pyName ? await checkPypi(pyName, slugs, f) : null);
    if (!hit) return none;
    const advisoriesOpen = hit.version ? await osvOpenAdvisories({ ecosystem: hit.ecosystem, name: hit.name }, hit.version, f) : null;
    return { packageEcosystem: hit.ecosystem, packageName: hit.name, deprecated: hit.deprecated, deprecationMessage: hit.deprecationMessage, advisoriesOpen, signalsCheckedAt: now };
  } catch {
    return null;
  }
}

/** No-token path: read manifests from raw.githubusercontent.com, which does not spend API quota. */
export async function fetchManifestsRaw(owner: string, name: string, f: FetchLike = fetch): Promise<RepoManifests> {
  const get = async (file: string) => {
    try {
      const r = await f(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`, { headers: { "user-agent": SIGNALS_USER_AGENT } });
      return r.ok ? (await r.text()).slice(0, 200_000) : null;
    } catch { return null; }
  };
  const [packageJson, pyproject] = await Promise.all([get("package.json"), get("pyproject.toml")]);
  return { packageJson, pyproject };
}
