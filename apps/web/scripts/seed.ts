/**
 * Seed the index through the GitHub REST API: the no-token path.
 * Usage: pnpm seed [--limit 1000] [--no-readme] [--no-signals] [--skills]
 *
 * Without GITHUB_TOKEN GitHub allows 60 req/h and 10 searches/min; use --no-readme and a small --limit.
 * With a token, prefer scripts/backfill.ts (GraphQL, ~54x the throughput and true issue counts).
 *
 * Open issues are stored as null (unknown) on this path: REST open_issues_count includes open pull
 * requests, and health scoring ignores issue load when it is unknown. Package signals (npm/PyPI
 * deprecation, OSV advisories) are read from raw.githubusercontent.com manifests, which costs no
 * GitHub API quota.
 */
import { config } from "./vendor/dotenv-lite.js";
import { getDb, items } from "@gitit/db";
import {
  GitHubClient, repoToItem, ingestSkillsFromRepo, itemEmbeddingText, embedderFromEnv, storeRepos, emptyCounts, fetchManifestsRaw,
  type GhRepo,
} from "@gitit/core";
import path from "node:path";
import { TOPICS, LANGS, SKILL_REPOS } from "./topics";

config();
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(flag("--limit") ?? 300);
const withReadme = !args.includes("--no-readme");
const withSignals = !args.includes("--no-signals");
const withSkills = args.includes("--skills");

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const gh = new GitHubClient();
  const embedder = embedderFromEnv();
  const seenSlugs = new Set<string>();
  const seenIds = new Set<number>();
  for (const e of await db.select({ slug: items.slug, githubId: items.githubId }).from(items)) {
    seenSlugs.add(e.slug.toLowerCase());
    if (e.githubId) seenIds.add(e.githubId);
  }
  console.log(`existing: ${seenSlugs.size}, target: +${limit}, readme: ${withReadme}, signals: ${withSignals}, embedder: ${embedder.name}, token: ${!!process.env.GITHUB_TOKEN}`);
  if (process.env.GITHUB_TOKEN) console.log("GITHUB_TOKEN is set: scripts/backfill.ts is the faster, more complete path.");

  const queue: GhRepo[] = [];
  // Unauthenticated GitHub search allows 10 req/min; with a token, 30 req/min.
  const pauseMs = process.env.GITHUB_TOKEN ? 2100 : 6500;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Topic-major, no language filter: breadth first. Languages come from the repo metadata anyway.
  const queries = [
    ...TOPICS.map((t) => `topic:${t} stars:>300`),
    ...LANGS.map((l) => `language:${l} stars:>5000`),
  ];
  for (const q of queries) {
    if (queue.length >= limit) break;
    try {
      const found = await gh.search(q, 15);
      let added = 0;
      for (const r of found) {
        if (seenIds.has(r.id) || seenSlugs.has(r.full_name.toLowerCase())) continue;
        seenIds.add(r.id); seenSlugs.add(r.full_name.toLowerCase()); queue.push(r); added++;
      }
      console.log(`  ${q}: +${added} (queue ${queue.length})`);
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`  search "${q}" failed: ${msg.slice(0, 100)}`);
      if (/403|429|rate limit/i.test(msg)) { console.warn("  rate limited, waiting 65s"); await sleep(65_000); }
    }
    await sleep(pauseMs);
  }

  const counts = emptyCounts();
  for (let i = 0; i < queue.length; i += 20) {
    const batch = queue.slice(i, i + 20);
    const prepared = await Promise.all(batch.map(async (r) => {
      const readme = withReadme ? await gh.readme(r.owner.login, r.name).catch(() => null) : null;
      return { row: repoToItem(r, readme, null), manifests: () => fetchManifestsRaw(r.owner.login, r.name) };
    }));
    await storeRepos(db, embedder, prepared, { checkSignals: withSignals, log: (m) => console.log(m) }, counts);
    console.log(`stored ${Math.min(i + 20, queue.length)}/${queue.length} · ${JSON.stringify(counts)}`);
  }

  if (withSkills) {
    for (const [o, r] of SKILL_REPOS) {
      try {
        const rows = await ingestSkillsFromRepo(gh, o, r);
        if (!rows.length) continue;
        const vecs = await embedder.embed(rows.map(itemEmbeddingText));
        const res = await db.insert(items).values(rows.map((x, j) => ({ ...x, embedding: vecs[j], embeddingModel: embedder.name, embeddedAt: new Date() }))).onConflictDoNothing().returning({ id: items.id });
        console.log(`skills ${o}/${r}: +${res.length}`);
      } catch (e) { console.warn(`skills ${o}/${r} failed: ${(e as Error).message.slice(0, 120)}`); }
    }
  }
  console.log("done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
