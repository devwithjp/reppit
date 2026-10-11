/**
 * Fill what needs no GitHub API call: published package, registry deprecation, open advisories, and
 * missing READMEs (re-embedding those items). Works with no GITHUB_TOKEN.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/signals.ts [--recheck-days 7] [--all] [--limit N] [--no-readme] [--dry-run]
 *
 * Per repo:
 *   1. Root manifests from raw.githubusercontent.com (content CDN, not the rate-limited API):
 *      package.json, pyproject.toml, setup.cfg, setup.py, Cargo.toml, go.mod (plus monorepo folders
 *      named like the repo when the root package.json is private).
 *   2. The registry entry (npm, PyPI, crates.io, proxy.golang.org). It only counts if the registry
 *      links back at this repo (current slug or a known alias).
 *   3. Deprecated: npm latest version's `deprecated`; PyPI every release yanked or
 *      "Development Status :: 7 - Inactive"; crates.io latest version yanked.
 *   4. Open advisories from OSV.dev querybatch (one call per chunk): distinct, non-withdrawn
 *      advisories affecting the latest published version.
 *
 * No verified package, confirmed (every manifest answered found/404, every registry lookup
 * answered, and no root manifest of an ecosystem we cannot check: pom.xml, build.gradle, Gemfile,
 * composer.json, Package.swift, pubspec.yaml, mix.exs): package_ecosystem = 'none', and the trust score treats deprecation and advisories as
 * not applicable. Unconfirmed: they stay null (unknown), never false/0. Either way
 * signals_checked_at is set so the repo is not re-fetched until --recheck-days passes.
 * A transport failure, 429 or 5xx leaves the row untouched, so a re-run retries it.
 *
 * READMEs: repos with no stored README get one from raw.githubusercontent.com (README.md, readme.md,
 * README.rst, README, ... at HEAD), truncated to 60,000 characters like the REST ingester, and are
 * re-embedded with the configured embedder (EMBEDDING_PROVIDER). A repo with no README file stays
 * null and is tried again on the next run.
 *
 * Releases: for repos with a primary install package, the newest stable release date and the count
 * of stable releases in the past year come from deps.dev (registry publish times; npm, PyPI,
 * crates.io, Go). Side packages never set them.
 *
 * Licence: when GitHub detected none (null or NOASSERTION), the verified package's declared SPDX
 * licence fills it (date-fns: no licence file GitHub recognises, npm says MIT).
 *
 * Resumable and safe to re-run: by default it only visits repos never checked or checked more than
 * --recheck-days ago, and writes after every chunk. --all rechecks everything.
 * Pacing: per-host request spacing (crates.io 1/s per its policy; the others 4-8/s), User-Agent
 * "reppit-ingest (+https://reppit.dev)".
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { and, eq, or, desc, inArray, sql } from "drizzle-orm";
import { getDb, items, itemAliases, type Db } from "@gitit/db";
import {
  fetchManifestsRaw, resolvePackages, combinePackageSignals, osvOpenAdvisoriesBatch, applySignals, noPackageSignals, trustScore,
  fetchReadmeRaw, embedderFromEnv, itemEmbeddingText, confirmNoPackage, registryReleases,
  type FetchLike, type ResolvedPackage, type ResolvedPackages,
} from "@gitit/core";

config();
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const recheckDays = Number(flag("--recheck-days") ?? 7);
const all = args.includes("--all");
const limit = flag("--limit") ? Number(flag("--limit")) : undefined;
const dryRun = args.includes("--dry-run");
const withReadme = !args.includes("--no-readme");
const CHUNK = 40;
const CONCURRENCY = 4;

/** Minimum spacing between requests to one host, in ms. */
const SPACING: Record<string, number> = {
  "raw.githubusercontent.com": 125, // 8/s
  "registry.npmjs.org": 250,
  "pypi.org": 250,
  "crates.io": 1000, // crates.io crawler policy: 1 req/s
  "api.osv.dev": 250,
  "proxy.golang.org": 250,
  "api.deps.dev": 250,
};
/** Stored README cap for this pass (disk budget for ~3,000 repos). */
const README_CHARS = 16_384;
const nextSlot = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const counts = { requests: 0, retries: 0 };

/** fetch with per-host pacing and one retry (after a pause) on 429/5xx or a network error. */
const paced: FetchLike = async (url, init) => {
  const host = new URL(url).host;
  const gap = SPACING[host] ?? 250;
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + gap);
    if (at > now) await sleep(at - now);
    counts.requests++;
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        counts.retries++;
        await sleep(Math.min(30_000, 1000 * Number(res.headers.get("retry-after") ?? 5)));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === 0) { counts.retries++; await sleep(3000); continue; }
      throw e;
    }
  }
};

type Row = {
  id: string; slug: string; name: string; description: string | null; language: string | null; topics: string[] | null;
  needsReadme: boolean; signalsDue: boolean;
};

async function trustCensus(db: Db) {
  const rows = await db.select({
    pushedAt: items.pushedAt, lastReleaseAt: items.lastReleaseAt, archived: items.archived, deprecated: items.deprecated,
    advisoriesOpen: items.advisoriesOpen, openIssues: items.openIssues, closedIssues: items.closedIssues, weightedScore: items.weightedScore,
    packageName: items.packageName, packageEcosystem: items.packageEcosystem, releasesLastYear: items.releasesLastYear,
  }).from(items).where(eq(items.kind, "repo"));
  const scored = rows.map((r) => trustScore(r));
  const values = scored.flatMap((t) => (t.score === null ? [] : [t.score]));
  const hist = new Map<number, number>();
  for (const v of values) hist.set(v, (hist.get(v) ?? 0) + 1);
  const common = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => `${v}×${n}`).join(", ");
  return { repos: rows.length, notEnough: scored.filter((t) => t.score === null).length, scored: values.length, at85: hist.get(85) ?? 0, distinct: hist.size, common };
}

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const before = await trustCensus(db);
  console.log(`before: ${before.repos} repos · ${before.scored} scored · ${before.notEnough} too little measured · ${before.at85} at exactly 85 · ${before.distinct} distinct scores · most common ${before.common}`);

  const cutoff = new Date(Date.now() - recheckDays * 86_400_000);
  const dueSql = all ? sql<boolean>`true` : sql<boolean>`(${items.signalsCheckedAt} is null or ${items.signalsCheckedAt} < ${cutoff})`;
  const readmeSql = withReadme ? sql<boolean>`(${items.readme} is null or ${items.readme} = '')` : sql<boolean>`false`;
  let q = db.select({
    id: items.id, slug: items.slug, name: items.name, description: items.description, language: items.language, topics: items.topics,
    needsReadme: readmeSql, signalsDue: dueSql,
  }).from(items).where(and(eq(items.kind, "repo"), or(dueSql, readmeSql))).orderBy(desc(items.stars)).$dynamic();
  if (limit) q = q.limit(limit);
  const todo: Row[] = await q;
  const embedder = embedderFromEnv();
  console.log(`visiting ${todo.length} repos: ${todo.filter((r) => r.signalsDue).length} due a signals check, ${todo.filter((r) => r.needsReadme).length} missing a README · embedder ${embedder.name}${dryRun ? " · DRY RUN" : ""}`);

  const tally = { noPackage: 0, readmes: 0, readmeMissing: 0, checked: 0, failed: 0, packages: 0, npm: 0, PyPI: 0, "crates.io": 0, Go: 0, installable: 0, apps: 0, releaseDated: 0, releasesFailed: 0, deprecated: 0, withAdvisories: 0, advisoriesUnknown: 0 };
  const osvCache = new Map();
  const t0 = Date.now();

  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const aliasRows = await db.select({ itemId: itemAliases.itemId, slug: itemAliases.slug }).from(itemAliases).where(inArray(itemAliases.itemId, chunk.map((r) => r.id)));

    // 1-3: manifests and registry, CONCURRENCY repos at a time (pacing is per host, below this).
    const resolved: { row: Row; res: ResolvedPackages; complete: boolean }[] = [];
    const readmes: { row: Row; readme: string }[] = [];
    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      await Promise.all(chunk.slice(j, j + CONCURRENCY).map(async (row) => {
        const slug = row.slug.replace(/~[0-9a-f]{8}$/, "");
        const [owner, name] = slug.split("/");
        const slugs = [slug, ...aliasRows.filter((a) => a.itemId === row.id).map((a) => a.slug)];
        if (row.needsReadme) {
          try {
            const readme = await fetchReadmeRaw(owner, name, paced, { strict: true, maxChars: README_CHARS });
            if (readme) readmes.push({ row, readme }); else tally.readmeMissing++;
          } catch (e) { console.warn(`  ${row.slug}: README left for a later run (${(e as Error).message.slice(0, 80)})`); }
        }
        if (!row.signalsDue) return;
        try {
          const manifests = await fetchManifestsRaw(owner, name, paced, { strict: true });
          const res = await resolvePackages(slugs, manifests, paced, { language: row.language });
          resolved.push({ row, res, complete: res.packages.length ? false : await confirmNoPackage(slug, manifests, paced) });
        } catch (e) {
          tally.failed++;
          console.warn(`  ${row.slug}: left for a later run (${(e as Error).message.slice(0, 80)})`);
        }
      }));
    }

    // 4: one OSV call for every package in the chunk (all packages of every repo).
    const flat = resolved.flatMap((r) => r.res.packages.filter((p) => p.version).map((p) => ({ id: r.row.id, p })));
    const adv = await osvOpenAdvisoriesBatch(flat.map(({ p }) => ({ ecosystem: p.ecosystem, name: p.name, version: p.version! })), paced, osvCache);
    const advOf = (id: string, p: ResolvedPackage) => { const k = flat.findIndex((x) => x.id === id && x.p === p); return k >= 0 ? adv[k] : null; };

    // 5: release cadence from registry publish times, install package only (never a side package).
    const now = new Date();
    const releases = new Map<string, Awaited<ReturnType<typeof registryReleases>>>();
    for (const { row, res } of resolved) {
      if (!res.install) continue;
      try { releases.set(row.id, await registryReleases(res.install.ecosystem, res.install.name, paced, now)); }
      catch (e) { tally.releasesFailed++; console.warn(`  ${row.slug}: release dates left for a later run (${(e as Error).message.slice(0, 80)})`); }
    }

    for (const { row, res, complete } of resolved) {
      const s = res.packages.length
        ? combinePackageSignals(res, res.packages.map((p) => advOf(row.id, p)), now, releases.get(row.id) ?? null)
        : noPackageSignals(now, complete);
      if (!res.packages.length && complete) tally.noPackage++;
      if (res.packages.length) {
        const lead = res.install ?? res.packages[0];
        tally.packages++; tally[lead.ecosystem]++;
        if (res.install) tally.installable++;
        if (res.installKind === "app") tally.apps++;
        if (releases.get(row.id)) tally.releaseDated++;
        if (s.deprecated) tally.deprecated++;
        if (s.advisoriesOpen === null) tally.advisoriesUnknown++; else if (s.advisoriesOpen > 0) tally.withAdvisories++;
      }
      if (!dryRun) await applySignals(db, row.id, s, now);
      tally.checked++;
    }
    // README + re-embed, one embedder call per chunk.
    if (readmes.length) {
      const vecs = await embedder.embed(readmes.map(({ row, readme }) => itemEmbeddingText({ ...row, readme })));
      if (!dryRun) {
        for (const [k, { row, readme }] of readmes.entries()) {
          await db.update(items).set({ readme, embedding: vecs[k], embeddedAt: now, updatedAt: now }).where(eq(items.id, row.id));
        }
      }
      tally.readmes += readmes.length;
    }

    const done = Math.min(i + CHUNK, todo.length);
    const rate = done / Math.max(1, (Date.now() - t0) / 1000);
    console.log(`${done}/${todo.length} · ${JSON.stringify(tally)} · ${counts.requests} requests · ${rate.toFixed(1)} repos/s`);
  }

  const after = await trustCensus(db);
  console.log(`\nafter:  ${after.repos} repos · ${after.scored} scored · ${after.notEnough} too little measured · ${after.at85} at exactly 85 · ${after.distinct} distinct scores · most common ${after.common}`);
  console.log(`moved to a real score: ${before.notEnough - after.notEnough}`);
  console.log(`READMEs filled and re-embedded: ${tally.readmes} · no README file found: ${tally.readmeMissing}`);
  console.log(`confirmed no package ${tally.noPackage} · primary package to install ${tally.installable} · apps ${tally.apps} · registry release dates ${tally.releaseDated} (failed ${tally.releasesFailed})`);
  console.log(`packages verified ${tally.packages} (npm ${tally.npm}, PyPI ${tally.PyPI}, crates.io ${tally["crates.io"]}, Go ${tally.Go}) · deprecated ${tally.deprecated} · with open advisories ${tally.withAdvisories} · advisories unknown ${tally.advisoriesUnknown} · failed ${tally.failed} · retries ${counts.retries} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(0);
}
main().catch((e) => { console.error("signals failed:", (e as Error).message); process.exit(1); });
