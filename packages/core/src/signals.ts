/**
 * Zero-user signals: registry deprecation and open advisories, for repos that publish a package.
 *
 * Rules (DECISIONS.md "Never render a missing advisory count as zero"):
 * - A field we could not check is null, never false/0.
 * - A package only counts as this repo's if the registry's repository link points back at the repo
 *   (by current slug or a known alias). Name collisions are common; an unverified match is ignored.
 * - Sources: npm registry, PyPI JSON, crates.io API, OSV.dev (CC-BY-4.0). None needs a key, and none
 *   spends GitHub API quota (manifests come from raw.githubusercontent.com). ecosyste.ms is deliberately not used
 *   here because it is CC-BY-SA and these values feed the ranker.
 */

import { NO_PACKAGE } from "./trust";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const norm = (n: string) => n.toLowerCase().replace(/[-_.]+/g, "-");

export const SIGNALS_USER_AGENT = "reppit-ingest (+https://reppit.dev)";

/** Ecosystem names exactly as OSV spells them. */
export type Ecosystem = "npm" | "PyPI" | "crates.io" | "Go";
export interface PackageRef { ecosystem: Ecosystem; name: string }

export interface PackageSignals {
  /** An ecosystem, "none" (confirmed: publishes no package), or null (unknown). */
  packageEcosystem: Ecosystem | typeof NO_PACKAGE | null;
  packageName: string | null;
  /** null when no verified package was found. */
  deprecated: boolean | null;
  deprecationMessage: string | null;
  /** null when no verified package, or the advisory lookup failed. */
  advisoriesOpen: number | null;
  signalsCheckedAt: Date;
  /** Licence the verified package declares (SPDX-looking only). Used when GitHub detected none. */
  registryLicense?: string | null;
  /** The package to install (primary only), or null. */
  installPackage?: string | null;
  /** Every verified package; null = not checked, [] = none. */
  publishedPackages?: { ecosystem: string; name: string }[] | null;
  installOptions?: { ecosystem: string; name: string }[] | null;
  installKind?: InstallKind | null;
  /** From the install package's registry publish times. Absent = leave the stored value. */
  lastReleaseAt?: Date;
  releasesLastYear?: number;
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

/** `[metadata] name` from a setup.cfg. */
export function packageNameFromSetupCfg(text: string | null | undefined): string | null {
  if (!text) return null;
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+[#;].*$/, "").trim();
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { section = sec[1].trim(); continue; }
    const kv = line.match(/^name\s*[=:]\s*([A-Za-z0-9][A-Za-z0-9._-]*)$/);
    if (kv && section === "metadata") return kv[1];
  }
  return null;
}

/** A literal `name="..."` inside `setup(...)` in a setup.py. Computed names are not guessed. */
export function packageNameFromSetupPy(text: string | null | undefined): string | null {
  if (!text) return null;
  const call = text.indexOf("setup(");
  if (call < 0) return null;
  const m = text.slice(call).match(/\bname\s*=\s*["']([A-Za-z0-9][A-Za-z0-9._-]*)["']/);
  return m ? m[1] : null;
}

/** `[package] name` from a Cargo.toml. A workspace-only root (no [package]) has no name. */
export function packageNameFromCargoToml(text: string | null | undefined): string | null {
  if (!text) return null;
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { section = sec[1].trim(); continue; }
    const kv = line.match(/^name\s*=\s*["']([A-Za-z0-9_-]+)["']$/);
    if (kv && section === "package") return kv[1];
  }
  return null;
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

interface NpmLatest { name?: string; version?: string; deprecated?: unknown; repository?: unknown; license?: unknown }

/** A declared licence that looks like an SPDX id or expression, else null. Free text is not trusted. */
export function spdxish(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string" ? String((v as { type: string }).type).trim() : "";
  if (!s || s.length > 60 || /^(unknown|unlicensed|see license|proprietary|other)$/i.test(s)) return null;
  return /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/.test(s.replace(/[()]/g, "")) ? s : null;
}

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
  return { ecosystem: "npm" as const, name, version: j.version ?? null, deprecated: deprecated !== null, deprecationMessage: deprecated, license: spdxish(j.license) };
}

interface PypiInfo { name?: string; version?: string; yanked?: boolean; yanked_reason?: string | null; classifiers?: string[]; project_urls?: Record<string, string> | null; home_page?: string | null; license?: string | null; license_expression?: string | null }

/**
 * PyPI: deprecated when every release is yanked (PyPI's `info` then describes a yanked release), or
 * the project declares "Development Status :: 7 - Inactive".
 */
export async function checkPypi(name: string, slugs: string[], f: FetchLike = fetch) {
  const res = await f(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pypi ${name} ${res.status}`);
  const body = (await res.json()) as { info?: PypiInfo; releases?: Record<string, { yanked?: boolean }[]> };
  const info = body.info ?? {};
  if (!matchesRepo([...Object.values(info.project_urls ?? {}), info.home_page], slugs)) return null;
  const published = Object.values(body.releases ?? {}).filter((files) => files.length > 0);
  const allYanked = info.yanked === true || (published.length > 0 && published.every((files) => files.every((x) => x.yanked === true)));
  const inactive = (info.classifiers ?? []).some((c) => /^Development Status :: 7 - Inactive/.test(c));
  const message = allYanked ? `every release yanked${info.yanked_reason ? `: ${info.yanked_reason}` : ""}` : inactive ? "Development Status :: 7 - Inactive" : null;
  const stableReleases = Object.entries(body.releases ?? {}).filter(([v, files]) => files.length > 0 && !PRERELEASE.test(v)).length;
  return { ecosystem: "PyPI" as const, name: info.name ?? name, version: info.version ?? null, deprecated: message !== null, deprecationMessage: message, license: spdxish(info.license_expression) ?? spdxish(info.license), stableReleases };
}

/**
 * npm search fallback for monorepos whose package name differs from the repo and its folders:
 * the top hits for the repo name whose `links.repository` points back at the repo. Names only;
 * the caller verifies each with checkNpm.
 */
export async function npmSearchByRepo(repoName: string, slugs: string[], f: FetchLike = fetch): Promise<string[]> {
  const res = await f(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(repoName)}&size=10`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`npm search ${repoName} ${res.status}`);
  const j = (await res.json()) as { objects?: { package?: { name?: string; links?: { repository?: string } } }[] };
  return (j.objects ?? []).map((o) => o.package).filter((p) => p?.name && matchesRepo([p.links?.repository], slugs)).map((p) => p!.name!);
}

/** `module` path from a go.mod, and its `// Deprecated:` notice (Go's own deprecation convention). */
export function goModInfo(text: string | null | undefined): { module: string; deprecated: string | null } | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /^\s*module\s+/.test(l));
  if (i < 0) return null;
  const module = lines[i].replace(/\/\/.*$/, "").replace(/^\s*module\s+/, "").trim().replace(/^"|"$/g, "");
  if (!module) return null;
  // The comment block directly above the module line, or a trailing comment on it.
  const block: string[] = [];
  for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) block.unshift(lines[j].replace(/^\s*\/\/\s?/, ""));
  const trailing = lines[i].match(/\/\/\s?(.*)$/)?.[1];
  if (trailing) block.push(trailing);
  const dep = block.map((l) => l.match(/^Deprecated:\s*(.*)$/)?.[1]).find((x) => x !== undefined);
  return { module, deprecated: dep === undefined ? null : dep.trim() || "deprecated" };
}

/** proxy.golang.org path escaping: each upper-case letter becomes "!" + lower-case. */
export const goProxyEscape = (m: string) => m.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);

/**
 * Go module: the repo's own module, published on proxy.golang.org (no key). The link back is the
 * proxy's `Origin.URL` for the latest version, which also covers vanity paths (gorm.io/gorm →
 * github.com/go-gorm/gorm); without an Origin, the module path must be github.com/<owner>/<name>
 * (optionally /vN). 404/410 means never published. Deprecated when go.mod at HEAD carries a
 * `// Deprecated:` notice, Go's own convention.
 */
export async function checkGo(goMod: string | null | undefined, slugs: string[], f: FetchLike = fetch) {
  const info = goModInfo(goMod);
  if (!info) return null;
  const res = await f(`https://proxy.golang.org/${goProxyEscape(info.module)}/@latest`, { headers: { "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`goproxy ${info.module} ${res.status}`);
  const j = (await res.json()) as { Version?: string; Origin?: { URL?: string } };
  const byPath = info.module.match(/^github\.com\/([^/]+\/[^/]+?)(?:\/v\d+)?$/i)?.[1];
  const linked = j.Origin?.URL ? matchesRepo([j.Origin.URL], slugs) : !!byPath && slugs.some((s) => s.toLowerCase() === byPath.toLowerCase());
  if (!linked) return null;
  return { ecosystem: "Go" as const, name: info.module, version: j.Version ?? null, deprecated: info.deprecated !== null, deprecationMessage: info.deprecated, license: null };
}

/**
 * Root manifests of ecosystems this resolver cannot check yet (Maven, Gradle, RubyGems, Composer,
 * Swift, Dart, Mix, .NET). If one exists, "no package found" is not a confirmed absence.
 */
export const UNSUPPORTED_MANIFESTS = ["pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "Package.swift", "pubspec.yaml", "mix.exs", "Directory.Build.props"];

interface CratesResponse {
  crate?: { name?: string; repository?: string | null; homepage?: string | null; max_version?: string; max_stable_version?: string | null };
  versions?: { num: string; yanked: boolean; created_at: string; license?: string | null; bin_names?: string[] | null }[];
}

/**
 * crates.io: deprecated when the most recently published version is yanked (this also covers a
 * crate whose every version is yanked). The OSV lookup uses the newest non-yanked version.
 * crates.io asks for a descriptive User-Agent and at most one request per second.
 */
export async function checkCrates(name: string, slugs: string[], f: FetchLike = fetch) {
  const res = await f(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`crates ${name} ${res.status}`);
  const j = (await res.json()) as CratesResponse;
  if (!matchesRepo([j.crate?.repository, j.crate?.homepage], slugs)) return null;
  const versions = [...(j.versions ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const newest = versions[0];
  const live = j.crate?.max_stable_version || (j.crate?.max_version && j.crate.max_version !== "0.0.0" ? j.crate.max_version : null) || versions.find((v) => !v.yanked)?.num || newest?.num || null;
  const deprecated = !!newest?.yanked;
  const stableReleases = versions.filter((v) => !v.yanked && !PRERELEASE.test(v.num)).length;
  const binNames = (newest?.bin_names ?? []).filter(Boolean);
  const crateName = j.crate?.name ?? name;
  // A crate whose binary carries its own name (hurl) is a tool you install, not a dependency you add.
  const kind = binNames.some((b) => norm(b) === norm(crateName)) ? "app" as const : "package" as const;
  return { ecosystem: "crates.io" as const, name: crateName, version: live, deprecated, deprecationMessage: deprecated ? `latest version ${newest.num} yanked` : null, license: spdxish(newest?.license), stableReleases, binNames, kind };
}

interface OsvVuln { id: string; aliases?: string[]; withdrawn?: string }

/**
 * Distinct, non-withdrawn OSV advisories affecting `version`. OSV lists one vulnerability under
 * several ids (GHSA-…, PYSEC-…), so ids are merged through their `aliases` before counting.
 * Returns null on any failure: an unanswered check is unknown, not zero.
 */
export async function osvOpenAdvisories(pkg: PackageRef, version: string, f: FetchLike = fetch): Promise<number | null> {
  return (await osvOpenAdvisoriesBatch([{ ...pkg, version }], f))[0];
}

/**
 * What the count means: advisories OSV says affect the LATEST published version (the version passed
 * in), not advisories ever filed against the package. Withdrawn entries are dropped and aliases
 * merged. One querybatch call per 1000 packages; vulnerability details are fetched once per id
 * (`detailCache` can be shared across calls). Per package: a number, or null when that package's
 * answer was incomplete (paged result, or a detail fetch failed). A failed batch call makes every
 * entry null. Never 0 for something unchecked.
 */
export async function osvOpenAdvisoriesBatch(
  pkgs: (PackageRef & { version: string })[], f: FetchLike = fetch,
  detailCache: Map<string, OsvVuln> = new Map(), concurrency = 6,
): Promise<(number | null)[]> {
  const out: (number | null)[] = pkgs.map(() => null);
  for (let start = 0; start < pkgs.length; start += 1000) {
    const part = pkgs.slice(start, start + 1000);
    let results: { vulns?: { id: string }[]; next_page_token?: string }[];
    try {
      const res = await f("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": SIGNALS_USER_AGENT },
        body: JSON.stringify({ queries: part.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) }),
      });
      if (!res.ok) continue;
      results = ((await res.json()) as { results?: typeof results }).results ?? [];
    } catch { continue; }
    const need = [...new Set(results.flatMap((r) => (r?.vulns ?? []).map((v) => v.id)))].filter((id) => !detailCache.has(id));
    const failed = new Set<string>();
    for (let i = 0; i < need.length; i += concurrency) {
      await Promise.all(need.slice(i, i + concurrency).map(async (id) => {
        try {
          const d = await f(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { headers: { "user-agent": SIGNALS_USER_AGENT } });
          if (!d.ok) throw new Error(String(d.status));
          detailCache.set(id, (await d.json()) as OsvVuln);
        } catch { failed.add(id); }
      }));
    }
    part.forEach((_, i) => {
      const r = results[i];
      if (!r || r.next_page_token) return; // missing or paged: we would undercount, so unknown
      const ids = (r.vulns ?? []).map((v) => v.id);
      if (ids.some((id) => failed.has(id))) return;
      out[start + i] = countDistinctAdvisories(ids.map((id) => detailCache.get(id)!));
    });
  }
  return out;
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

export interface RepoManifests {
  packageJson?: string | null; pyproject?: string | null; setupCfg?: string | null; setupPy?: string | null; cargoToml?: string | null;
  goMod?: string | null;
  /** package.json files from monorepo folders named like the repo (`<name>/`, `packages/<name>/`). */
  subPackageJsons?: (string | null)[];
  /** The root directory is a Go `main` package (main.go at the root): the module is an app. */
  goRootIsMain?: boolean;
  /**
   * True only when every manifest file (root, and monorepo folders when the root is private) was
   * fetched with a definite answer: found, or 404. Only then can "no package" be a confirmed absence.
   */
  complete?: boolean;
}

export interface ResolvedPackage {
  ecosystem: Ecosystem; name: string; version: string | null; deprecated: boolean; deprecationMessage: string | null; license?: string | null;
  /** Non-prerelease versions published, when the registry response already carries them. */
  stableReleases?: number;
  /** crates.io: binaries the latest version builds. */
  binNames?: string[];
  /** "app" when the package is an application rather than a library to depend on. */
  kind?: "package" | "app";
}

const PRERELEASE = /[-+](alpha|beta|rc|pre|dev|canary|next|nightly)|(a|b|rc|dev)\d+$/i;
export const ESTABLISHED_MIN_RELEASES = 3;

/** Stable versions on npm, from the abbreviated packument (smaller than the full document). */
export async function npmStableReleases(name: string, f: FetchLike = fetch): Promise<number> {
  const path = name.startsWith("@") ? name.replace("/", "%2f") : encodeURIComponent(name);
  const res = await f(`https://registry.npmjs.org/${path}`, { headers: { accept: "application/vnd.npm.install-v1+json", "user-agent": SIGNALS_USER_AGENT } });
  if (!res.ok) throw new Error(`npm packument ${name} ${res.status}`);
  const j = (await res.json()) as { versions?: Record<string, unknown> };
  return Object.keys(j.versions ?? {}).filter((v) => !PRERELEASE.test(v)).length;
}

/** Primary repo languages each registry plausibly publishes. Unknown language: no restriction. */
const ECOSYSTEM_LANGUAGES: Record<Exclude<Ecosystem, "Go">, string[]> = {
  npm: ["javascript", "typescript", "coffeescript", "vue", "svelte", "astro", "html", "css", "scss", "mdx"],
  PyPI: ["python", "jupyter notebook", "cython"],
  "crates.io": ["rust"],
};
const fitsLanguage = (eco: Ecosystem, language?: string | null) =>
  eco === "Go" || !language || ECOSYSTEM_LANGUAGES[eco].includes(language.toLowerCase());

export type InstallKind = "package" | "app" | "docs";

export interface ResolvedPackages {
  /** Every verified package this repo publishes (registry links back), primary first. */
  packages: ResolvedPackage[];
  /** The package to install, or null when none is demonstrably the repo's primary one or it is an app. */
  install: ResolvedPackage | null;
  /** Installable primary packages, one per registry, the repo language's registry first. */
  options: ResolvedPackage[];
  /**
   * "package": `install` is the thing to add. "app": the primary package is an application (a Go main
   * package at the root, a crate whose binary carries its name): install it from the repo's docs.
   * "docs": the repo publishes packages but none is demonstrably the one to install (monorepo side
   * packages). null: no package found.
   */
  installKind: InstallKind | null;
}

/**
 * The packages a repo publishes, and separately the one to install. Every candidate must be
 * confirmed by its registry entry linking back to one of `slugs`, so a name collision never counts.
 * Candidates:
 *   0. a Go module from the root go.mod, published on proxy.golang.org, whose Origin is this repo;
 *   1. the repo's own name, in each ecosystem the repo has a root manifest for;
 *   2. names from root manifests: package.json, pyproject.toml, setup.cfg, setup.py, Cargo.toml;
 *   3. package.json in monorepo folders named like the repo (drizzle-orm/, packages/react/);
 *   4. only when nothing primary was found: npm search for the repo name, filtered by repository
 *      link (up to 5), so signals still see a monorepo's packages.
 * Steps 1 and 4 are not grounded in the repo's own files, and a registry's repository field is
 * self-declared (npm "rails" is an unrelated 2022 beta claiming rails/rails). So when the ecosystem
 * does not fit the repo's primary language, those candidates must also be established: at least 3
 * non-prerelease versions (typescript, electron, uv pass; the rails squat does not).
 *
 * Install: a package that links back only proves it belongs to the repo, and in a monorepo every
 * package links back (@prisma/orm-toolchain, @tanstack/query-core, @react-pdf/types,
 * @openhands/agent-canvas). So `install` is set only for a primary package: its name equals the repo
 * name, or `@<owner>/<repo>`, or it is the root manifest's own published name (root package.json when
 * not private, root pyproject/setup.cfg/setup.py, root Cargo.toml [package], root go.mod) in an
 * ecosystem that fits the repo's language. Preference in that order. Otherwise null, and the install
 * line points at the repo's docs.
 * Throws when a registry call fails, so callers can tell "none" from "could not check".
 */
export async function resolvePackages(slugs: string[], m: RepoManifests, f: FetchLike = fetch, opts: { language?: string | null } = {}): Promise<ResolvedPackages> {
  const [owner = "", repoRaw = ""] = (slugs[0] ?? "").replace(/~[0-9a-f]{8}$/, "").split("/");
  const repoName = repoRaw.toLowerCase();
  const hasNpm = !!m.packageJson || (m.subPackageJsons ?? []).some(Boolean);
  const hasPy = !!(m.pyproject || m.setupCfg || m.setupPy);
  const hasCargo = !!m.cargoToml;
  const rootNames = {
    npm: packageNameFromPackageJson(m.packageJson),
    py: [packageNameFromPyproject(m.pyproject), packageNameFromSetupCfg(m.setupCfg), packageNameFromSetupPy(m.setupPy)].filter((x): x is string => !!x),
    cargo: packageNameFromCargoToml(m.cargoToml),
  };
  const grounded = new Set([rootNames.npm, ...(m.subPackageJsons ?? []).map(packageNameFromPackageJson), ...rootNames.py, rootNames.cargo]
    .filter((x): x is string => !!x).map(norm));

  /** 0 = repo name, 1 = @owner/repo, 2 = root manifest's own name, null = not primary. */
  const primaryRank = (p: ResolvedPackage): number | null => {
    const n = norm(p.name);
    if (p.ecosystem === "Go") return 2; // only ever from the root go.mod
    if (n === norm(repoName)) return 0;
    if (p.ecosystem === "npm" && n === norm(`@${owner}/${repoName}`)) return 1;
    // The root manifest's own name counts only in an ecosystem that fits the repo's language: a Python
    // agent app whose root package.json publishes a UI (@openhands/agent-canvas) is not installed with npm.
    const root = p.ecosystem === "npm" ? [rootNames.npm] : p.ecosystem === "PyPI" ? rootNames.py : [rootNames.cargo];
    return root.some((r) => r && norm(r) === n) && fitsLanguage(p.ecosystem, opts.language) ? 2 : null;
  };

  const found: ResolvedPackage[] = [];
  const tried = new Set<string>();
  const attempt = async (eco: Ecosystem, name: string | null): Promise<ResolvedPackage | null> => {
    if (!name) return null;
    const key = `${eco}:${norm(name)}`;
    if (tried.has(key)) return null;
    tried.add(key);
    if (eco === "npm" && !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) return null; // not a valid npm name
    return eco === "npm" ? checkNpm(name, slugs, f) : eco === "PyPI" ? checkPypi(name, slugs, f) : eco === "crates.io" ? checkCrates(name, slugs, f) : null;
  };
  const keep = (hit: ResolvedPackage | null) => { if (hit && !found.some((x) => x.ecosystem === hit.ecosystem && norm(x.name) === norm(hit.name))) found.push(hit); };
  const ungrounded = async (eco: Ecosystem, name: string) => {
    const hit = await attempt(eco, name);
    if (!hit || fitsLanguage(eco, opts.language) || grounded.has(norm(hit.name))) return hit;
    const stable = hit.stableReleases ?? (eco === "npm" ? await npmStableReleases(hit.name, f) : 0);
    return stable >= ESTABLISHED_MIN_RELEASES ? hit : null;
  };

  if (m.goMod) { const go = await checkGo(m.goMod, slugs, f); keep(go ? { ...go, kind: m.goRootIsMain ? "app" : "package" } : null); }
  // The repo's own name is tried in every registry once the repo has any package manifest: polars is
  // a Rust repo whose PyPI package (the one Python users install) has no root pyproject. The
  // ungrounded rule above keeps squats out.
  const hasAny = hasNpm || hasPy || hasCargo || !!m.goMod;
  if (repoName && hasAny) {
    keep(await ungrounded("npm", repoName));
    if (hasNpm) keep(await ungrounded("npm", `@${owner.toLowerCase()}/${repoName}`));
    keep(await ungrounded("PyPI", repoName));
    keep(await ungrounded("crates.io", repoName));
  }
  keep(await attempt("npm", rootNames.npm));
  for (const py of rootNames.py) keep(await attempt("PyPI", py));
  keep(await attempt("crates.io", rootNames.cargo));
  for (const sub of m.subPackageJsons ?? []) keep(await attempt("npm", packageNameFromPackageJson(sub)));
  if (hasNpm && repoName && !found.some((p) => primaryRank(p) !== null)) {
    for (const name of (await npmSearchByRepo(repoName, slugs, f)).slice(0, 5)) keep(await ungrounded("npm", name));
  }

  // Primary packages, best rank first; one per registry.
  const primaries = found.map((p) => ({ p, r: primaryRank(p) })).filter((x) => x.r !== null).sort((a, b) => a.r! - b.r!).map((x) => x.p);
  const perRegistry = primaries.filter((p, i) => primaries.findIndex((q) => q.ecosystem === p.ecosystem) === i);
  // Installable options exclude apps; the repo language's registry goes first.
  const libs = perRegistry.filter((p) => p.kind !== "app");
  const options = [...libs.filter((p) => fitsLanguage(p.ecosystem, opts.language) && opts.language), ...libs.filter((p) => !(fitsLanguage(p.ecosystem, opts.language) && opts.language))];
  const install = options[0] ?? null;
  const installKind: InstallKind | null = install ? "package" : perRegistry.length ? "app" : found.length ? "docs" : null;
  const lead = install ?? perRegistry[0] ?? null;
  const packages = lead ? [lead, ...found.filter((p) => p !== lead)] : found;
  return { packages, install, options, installKind };
}

/** The install package, else the first verified one. Kept for callers that need a single package. */
export async function resolvePackage(slugs: string[], m: RepoManifests, f: FetchLike = fetch, opts: { language?: string | null } = {}): Promise<ResolvedPackage | null> {
  const r = await resolvePackages(slugs, m, f, opts);
  return r.install ?? r.packages[0] ?? null;
}

const DEPS_DEV_SYSTEM: Record<Ecosystem, string> = { npm: "npm", PyPI: "pypi", "crates.io": "cargo", Go: "go" };

/** Pre-release or pseudo-version: semver "-" suffixes (npm, cargo, Go), PEP 440 a/b/rc/dev for PyPI. */
export function isPrerelease(eco: Ecosystem, version: string): boolean {
  return eco === "PyPI" ? /(a|b|rc|dev)\d*$|\.dev|alpha|beta/i.test(version) : version.includes("-");
}

export interface ReleaseInfo { lastReleaseAt: Date; releasesLastYear: number }

/**
 * Release cadence from registry publish times via deps.dev (no key, one call covers npm, PyPI,
 * crates.io and Go): the newest stable version's publish date, and how many stable versions were
 * published in the 365 days before `now`. Null when the package has no dated stable release.
 */
export async function registryReleases(eco: Ecosystem, name: string, f: FetchLike = fetch, now = new Date()): Promise<ReleaseInfo | null> {
  const res = await f(`https://api.deps.dev/v3/systems/${DEPS_DEV_SYSTEM[eco]}/packages/${encodeURIComponent(name)}`, { headers: { accept: "application/json", "user-agent": SIGNALS_USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`deps.dev ${eco} ${name} ${res.status}`);
  const j = (await res.json()) as { versions?: { versionKey?: { version?: string }; publishedAt?: string }[] };
  const yearAgo = now.getTime() - 365 * 86_400_000;
  const stable = (j.versions ?? [])
    .map((v) => ({ v: v.versionKey?.version ?? "", t: v.publishedAt ? Date.parse(v.publishedAt) : NaN }))
    .filter((x) => x.v && Number.isFinite(x.t) && x.t <= now.getTime() && !isPrerelease(eco, x.v));
  if (!stable.length) return null;
  const last = Math.max(...stable.map((x) => x.t));
  return { lastReleaseAt: new Date(last), releasesLastYear: stable.filter((x) => x.t >= yearAgo).length };
}

/**
 * Signals from everything a repo publishes. `advisories[i]` is the OSV count for `packages[i]`
 * (null = unknown).
 *   - Advisories: summed over every verified package, since an advisory in anything the repo ships
 *     is real; null if any package's count is unknown.
 *   - Deprecation and releases: the primary package only (the install package, or an app's own
 *     package). With no primary package (install_kind "docs": monorepo side packages only),
 *     deprecation is unknown and releases are left as they were.
 */
export function combinePackageSignals(r: ResolvedPackages, advisories: (number | null)[], now: Date, releases?: ReleaseInfo | null): PackageSignals {
  const lead = r.install ?? r.packages[0];
  const sum = advisories.length === r.packages.length && advisories.every((n) => typeof n === "number") ? advisories.reduce<number>((a, n) => a + (n as number), 0) : null;
  const primary = r.installKind === "package" || r.installKind === "app" ? lead : null;
  const deprecated = primary ? primary.deprecated : null;
  const message = primary ? primary.deprecationMessage : null;
  return {
    packageEcosystem: lead.ecosystem, packageName: lead.name,
    installPackage: r.install?.name ?? null,
    installOptions: r.options.map((p) => ({ ecosystem: p.ecosystem, name: p.name })),
    installKind: r.installKind,
    publishedPackages: r.packages.map((p) => ({ ecosystem: p.ecosystem, name: p.name })),
    // Release cadence comes from the install package only, never a side package.
    ...(r.install && releases ? { lastReleaseAt: releases.lastReleaseAt, releasesLastYear: releases.releasesLastYear } : {}),
    deprecated, deprecationMessage: message, advisoriesOpen: sum, signalsCheckedAt: now,
    registryLicense: (r.install ?? lead).license ?? null,
  };
}

/**
 * Check one repo's zero-user signals. `slugs` = current slug plus known aliases (all lower-cased
 * internally). Returns null when a registry call failed outright, so callers leave existing values
 * untouched rather than overwrite them with unknowns.
 */
export async function checkPackageSignals(slugs: string[], manifests: RepoManifests, f: FetchLike = fetch, now = new Date(), opts: { language?: string | null } = {}): Promise<PackageSignals | null> {
  try {
    const r = await resolvePackages(slugs, manifests, f, opts);
    if (!r.packages.length) return noPackageSignals(now, await confirmNoPackage(slugs[0] ?? "", manifests, f));
    const adv = await osvOpenAdvisoriesBatch(r.packages.map((p) => ({ ecosystem: p.ecosystem, name: p.name, version: p.version ?? "" })), f);
    const releases = r.install ? await registryReleases(r.install.ecosystem, r.install.name, f, now).catch(() => null) : null;
    return combinePackageSignals(r, r.packages.map((p, i) => (p.version ? adv[i] : null)), now, releases);
  } catch {
    return null;
  }
}

/**
 * Whether "no package found" is a confirmed absence: every supported manifest was fetched with a
 * definite answer, and the repo has no root manifest of an ecosystem we cannot check yet. Any error
 * answers false (unknown), never true.
 */
export async function confirmNoPackage(slug: string, manifests: RepoManifests, f: FetchLike = fetch): Promise<boolean> {
  if (manifests.complete !== true) return false;
  const [owner, name] = slug.replace(/~[0-9a-f]{8}$/, "").split("/");
  if (!owner || !name) return false;
  try {
    for (const file of UNSUPPORTED_MANIFESTS) {
      const r = await f(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`, { method: "HEAD", headers: { "user-agent": SIGNALS_USER_AGENT } });
      if (r.ok) return false;
      if (r.status !== 404) return false;
    }
    return true;
  } catch { return false; }
}

/**
 * No verified package. `confirmed` (every manifest fetched with a definite answer, and every registry
 * lookup answered) stores package_ecosystem = 'none', which makes deprecation and advisories not
 * applicable in the trust score. Unconfirmed leaves them unknown.
 */
export const noPackageSignals = (now: Date, confirmed = false): PackageSignals =>
  ({ packageEcosystem: confirmed ? NO_PACKAGE : null, packageName: null, installPackage: null, installOptions: null, installKind: null, publishedPackages: confirmed ? [] : null, deprecated: null, deprecationMessage: null, advisoriesOpen: null, signalsCheckedAt: now });

export const MANIFEST_FILES: Record<Exclude<keyof RepoManifests, "subPackageJsons" | "complete" | "goRootIsMain">, string> = {
  packageJson: "package.json", pyproject: "pyproject.toml", setupCfg: "setup.cfg", setupPy: "setup.py", cargoToml: "Cargo.toml", goMod: "go.mod",
};

/**
 * No-token path: read root manifests from raw.githubusercontent.com (the content CDN, which does not
 * spend GitHub API quota). A missing file is null. A transport failure or a 429/5xx also reads as
 * null here; pass `strict` to have those throw instead, so a batch job can retry the repo later.
 */
export async function fetchManifestsRaw(owner: string, name: string, f: FetchLike = fetch, opts: { strict?: boolean } = {}): Promise<RepoManifests> {
  let complete = true;
  const get = async (file: string) => {
    try {
      const r = await f(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`, { headers: { "user-agent": SIGNALS_USER_AGENT } });
      if (r.ok) return (await r.text()).slice(0, 200_000);
      if (r.status !== 404) {
        complete = false;
        if (opts.strict && (r.status === 429 || r.status >= 500)) throw new Error(`raw ${owner}/${name}/${file} ${r.status}`);
      }
      return null;
    } catch (e) { complete = false; if (opts.strict) throw e; return null; }
  };
  const keys = Object.keys(MANIFEST_FILES) as (keyof typeof MANIFEST_FILES)[];
  const texts = await Promise.all(keys.map((k) => get(MANIFEST_FILES[k])));
  const out = Object.fromEntries(keys.map((k, i) => [k, texts[i]])) as RepoManifests;
  // Monorepo: a private root package.json (or none beside a workspace file) means the package lives
  // in a folder. Only folders named like the repo are fetched, to keep this to two requests.
  if (out.packageJson && packageNameFromPackageJson(out.packageJson) === null) {
    out.subPackageJsons = await Promise.all([`${name}/package.json`, `packages/${name}/package.json`].map(get));
  }
  if (out.goMod) {
    const mainGo = await get("main.go");
    out.goRootIsMain = !!mainGo && /^package\s+main\b/m.test(mainGo);
  }
  out.complete = complete;
  return out;
}
