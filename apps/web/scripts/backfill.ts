/**
 * Backfill the index through GitHub GraphQL (docs/architecture/data-sources.md §4.1).
 *
 *   GITHUB_TOKEN=... pnpm --filter @gitit/web exec tsx scripts/backfill.ts [options]
 *
 * Discovery: GraphQL search per topic/language query (50 per page, 1 point per page).
 * Hydration: aliased repository batches of 30 (1 point per batch), halving on 502/504.
 * Writes:    upsert by github_id; renames and transfers update the slug and record an alias.
 * Signals:   npm / PyPI deprecation and OSV advisories for repos whose root manifest names a
 *            package that links back to the repo. Unknown stays null.
 *
 * Options:
 *   --existing       re-hydrate every repo already in the index (assigns github_id to legacy rows,
 *                    replaces REST issue counts with true ones, detects renames). Run this once after
 *                    the 0001 migration.
 *   --stars <expr>   star filter appended to discovery queries (default ">300")
 *   --pages <n>      search pages per query, 50 repos each (default 2)
 *   --limit <n>      stop discovery after n new repos (default 5000)
 *   --batch <n>      hydration batch size (default 30)
 *   --query <q>      a single custom discovery query instead of the topic list (repeatable)
 *   --no-signals     skip registry/advisory checks
 *   --dry-run        discover and hydrate, write nothing
 *
 * Requires GITHUB_TOKEN (no scopes needed). GitHub GraphQL has no unauthenticated access; without a
 * token this exits non-zero. Use `pnpm seed` for the token-less REST path.
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { sql, eq } from "drizzle-orm";
import { getDb, items } from "@gitit/db";
import {
  GitHubGraphQL, GraphQLHttpError, DEFAULT_BATCH_SIZE, embedderFromEnv, storeRepos, prepareGraphqlResults, emptyCounts,
  type RepoRef,
} from "@gitit/core";
import { TOPICS, LANGS } from "./topics";

config();
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flags = (n: string) => args.flatMap((a, i) => (a === n && args[i + 1] ? [args[i + 1]] : []));
const intFlag = (n: string, d: number) => { const v = Number(flag(n) ?? d); if (!Number.isInteger(v) || v <= 0) { console.error(`${n} must be a positive integer`); process.exit(2); } return v; };

const token = process.env.GITHUB_TOKEN?.trim();
if (!token) {
  console.error([
    "backfill: GITHUB_TOKEN is not set.",
    "",
    "The GraphQL ingestion path needs a token: GitHub allows no unauthenticated GraphQL calls.",
    "A classic PAT with no scopes, or a fine-grained token with \"Public repositories: read\", is enough.",
    "",
    "  GITHUB_TOKEN=ghp_... pnpm --filter @gitit/web exec tsx scripts/backfill.ts",
    "",
    "Without a token, `pnpm seed` runs the REST path (60 requests/hour, open issue counts stored as unknown).",
  ].join("\n"));
  process.exit(1);
}

const stars = flag("--stars") ?? ">300";
const pages = intFlag("--pages", 2);
const limit = intFlag("--limit", 5000);
const batchSize = intFlag("--batch", DEFAULT_BATCH_SIZE);
const existingMode = args.includes("--existing");
const checkSignals = !args.includes("--no-signals");
const dryRun = args.includes("--dry-run");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (e instanceof GraphQLHttpError && e.status === 401) { console.error("backfill: GitHub rejected the token (401). Check GITHUB_TOKEN."); process.exit(1); }
      if (e instanceof GraphQLHttpError && e.isRateLimited && attempt < 3) {
        const waitMs = Math.min(3_600_000, Math.max(60_000, (e.resetAt?.getTime() ?? Date.now() + 60_000) - Date.now() + 5_000));
        console.warn(`  rate limited (${e.status}); waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const gh = new GitHubGraphQL(token!, { log: (m) => console.log(m) });
  const embedder = embedderFromEnv();
  console.log(`backfill: mode=${existingMode ? "existing" : "discover"} batch=${batchSize} signals=${checkSignals} embedder=${embedder.name}${dryRun ? " DRY RUN" : ""}`);

  const known = new Set((await db.select({ githubId: items.githubId }).from(items).where(sql`${items.githubId} is not null`)).map((r) => r.githubId!));
  let refs: RepoRef[] = [];

  if (existingMode) {
    const rows = await db.select({ slug: items.slug }).from(items).where(eq(items.kind, "repo"));
    refs = rows.map((r) => r.slug.replace(/~[0-9a-f]{8}$/, "").split("/")).filter((p) => p.length === 2).map(([owner, name]) => ({ owner, name }));
    console.log(`re-hydrating ${refs.length} existing repos`);
  } else {
    const queries = flags("--query").length ? flags("--query") : [...TOPICS.map((t) => `topic:${t} stars:${stars}`), ...LANGS.map((l) => `language:${l} stars:>5000`)];
    const seen = new Set<number>(known);
    for (const q of queries) {
      if (refs.length >= limit) break;
      let after: string | null = null;
      let added = 0;
      for (let p = 0; p < pages && refs.length < limit; p++) {
        const page = await withRateLimitRetry(() => gh.searchRepos(`${q} sort:stars`, { first: 50, after }));
        for (const r of page.refs) if (!seen.has(r.databaseId)) { seen.add(r.databaseId); refs.push({ owner: r.owner, name: r.name }); added++; }
        if (!page.hasNextPage) break;
        after = page.endCursor;
      }
      console.log(`  ${q}: +${added} (queue ${refs.length})`);
    }
  }

  const counts = emptyCounts();
  const t0 = Date.now();
  // Hydrate in chunks of 10 batches so progress is written as we go.
  const chunk = batchSize * 10;
  for (let i = 0; i < refs.length; i += chunk) {
    const slice = refs.slice(i, i + chunk);
    const results = await withRateLimitRetry(() => gh.fetchRepos(slice, batchSize));
    const prepared = prepareGraphqlResults(results, counts);
    if (!dryRun) await storeRepos(db, embedder, prepared, { checkSignals, log: (m) => console.log(m) }, counts);
    console.log(`hydrated ${Math.min(i + chunk, refs.length)}/${refs.length} · points ${gh.stats.cost} (remaining ${gh.stats.remaining ?? "?"}) · 502 halvings ${gh.stats.halvings} · ${JSON.stringify(counts)}`);
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${JSON.stringify(counts)} · queries ${gh.stats.queries} · failed singles ${gh.stats.failed}`);
  if (counts.missing) console.log(`${counts.missing} repo(s) did not resolve (deleted, private, or renamed with no redirect). Their rows were left untouched.`);
  process.exit(0);
}
main().catch((e) => { console.error("backfill failed:", (e as Error).message); process.exit(1); });
