/**
 * Add specific repos to the index through the existing ingest path (REST metadata, embed, upsert by
 * github_id, package signals). Works without a token, within GitHub's 60 requests an hour.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/add-repos.ts owner/name [owner/name ...]
 *
 * Cost: 2 GitHub API requests per repo (repository, latest release). The README and manifests come
 * from raw.githubusercontent.com, which spends no API quota. /rate_limit is checked first (it is
 * free); repos that would exceed the remaining budget are listed and skipped, not attempted.
 * Repos already in the index are refreshed (same github_id), never duplicated.
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { getDb } from "@gitit/db";
import { GitHubClient, repoToItem, parseRepoRef, embedderFromEnv, storeRepos, emptyCounts, fetchManifestsRaw, fetchReadmeRaw, type PreparedRepo } from "@gitit/core";

config();
const COST_PER_REPO = 2;

async function remainingCore(): Promise<{ remaining: number; reset: Date } | null> {
  try {
    const res = await fetch("https://api.github.com/rate_limit", {
      headers: { accept: "application/vnd.github+json", "user-agent": "reppit-ingest", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { resources: { core: { remaining: number; reset: number } } };
    return { remaining: j.resources.core.remaining, reset: new Date(j.resources.core.reset * 1000) };
  } catch { return null; }
}

async function main() {
  const refs = process.argv.slice(2).map((a) => ({ arg: a, ref: parseRepoRef(a) }));
  const bad = refs.filter((r) => !r.ref).map((r) => r.arg);
  if (bad.length) { console.error(`not owner/name: ${bad.join(", ")}`); process.exit(2); }
  if (!refs.length) { console.error("usage: add-repos.ts owner/name [owner/name ...]"); process.exit(2); }

  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const gh = new GitHubClient();
  const embedder = embedderFromEnv();
  const counts = emptyCounts();
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const { ref } of refs) {
    const slug = `${ref!.owner}/${ref!.name}`;
    const rl = await remainingCore();
    if (rl && rl.remaining < COST_PER_REPO) { skipped.push(slug); continue; }
    try {
      const r = await gh.repo(ref!.owner, ref!.name);
      if (!r) { failed.push(`${slug} (not found)`); continue; }
      const release = await gh.latestRelease(r.owner.login, r.name).catch(() => null);
      const readme = await fetchReadmeRaw(r.owner.login, r.name);
      const prepared: PreparedRepo = {
        row: repoToItem(r, readme, release?.published_at ? new Date(release.published_at) : null),
        requestedSlug: slug,
        manifests: () => fetchManifestsRaw(r.owner.login, r.name),
      };
      await storeRepos(db, embedder, [prepared], { checkSignals: true, log: (m) => console.log(m) }, counts);
      console.log(`added ${r.full_name} · ${JSON.stringify(counts)}`);
    } catch (e) {
      const msg = (e as Error).message;
      failed.push(`${slug} (${msg.slice(0, 80)})`);
      if (/ 403| 429/.test(msg)) { skipped.push(...refs.map((x) => `${x.ref!.owner}/${x.ref!.name}`).slice(refs.findIndex((x) => x.ref === ref) + 1)); break; }
    }
  }
  const rl = await remainingCore();
  console.log(`\ndone · ${JSON.stringify(counts)} · GitHub API remaining ${rl?.remaining ?? "?"}${rl ? ` (resets ${rl.reset.toISOString()})` : ""}`);
  if (failed.length) console.log(`could not fetch: ${failed.join("; ")}`);
  if (skipped.length) console.log(`skipped for rate limit, re-run later: ${skipped.join(", ")}`);
  process.exit(failed.length || skipped.length ? 1 : 0);
}
main().catch((e) => { console.error("add-repos failed:", (e as Error).message); process.exit(1); });
