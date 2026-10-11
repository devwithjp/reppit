/**
 * Hit-rate eval: for each fixture query, is an expected repo in the top 5? Target: 25/30.
 *
 *   pnpm --filter @gitit/web eval [--offline] [--fix-fixtures] [--verbose]
 *
 * Expected repos are matched by identity, not by slug text, so a rename or transfer can never score a
 * hit as a miss. Each expected slug is resolved in order:
 *   1. the index: live slug or item_aliases (case-insensitive);
 *   2. eval/identity-cache.json: slug -> GitHub databaseId -> items.github_id;
 *   3. GitHub (skipped with --offline): GraphQL when GITHUB_TOKEN is set, else REST, which follows the
 *      301 a renamed repo returns. Answers are written back to the cache.
 *
 * Alongside hit@5 it prints the ceiling: how many queries have at least one expected repo in the index
 * at all. A query whose expected repos are all missing cannot hit, however good the ranking is.
 * --fix-fixtures rewrites eval/queries.json with canonical slugs from the cache.
 */
import { config } from "./vendor/dotenv-lite.js";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@gitit/db";
import { search, embedderFromEnv, resolveItemBySlug, findItemByGithubId, GitHubGraphQL } from "@gitit/core";

config();
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const fixFixtures = args.includes("--fix-fixtures");
const verbose = args.includes("--verbose");
const FIXTURES = path.resolve("eval/queries.json");
const CACHE = path.resolve("eval/identity-cache.json");

/** negative: a junk query that must return nothing (keyboard mash, random words). */
type Fixture = { q: string; expect: string[]; negative?: boolean };
type Identity = { githubId: number; nameWithOwner: string; checkedAt: string } | { missing: true; checkedAt: string };
const allFixtures = JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as Fixture[];
const fixtures = allFixtures.filter((f) => !f.negative);
const negatives = allFixtures.filter((f) => f.negative);
const cache: Record<string, Identity> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const key = (s: string) => s.trim().toLowerCase();

/** Ask GitHub who these slugs are now. Returns how many were answered. */
async function lookupOnGitHub(slugs: string[]): Promise<number> {
  const todo = slugs.filter((s) => !cache[key(s)]);
  if (!todo.length || offline) return 0;
  const now = new Date().toISOString();
  let answered = 0;
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    const gh = new GitHubGraphQL(token);
    for (let i = 0; i < todo.length; i += 30) {
      const part = todo.slice(i, i + 30);
      const q = `query { ${part.map((s, j) => { const [o, n] = s.split("/"); return `r${j}: repository(owner: ${JSON.stringify(o)}, name: ${JSON.stringify(n)}) { databaseId nameWithOwner }`; }).join(" ")} }`;
      const res = await gh.query<Record<string, { databaseId: number; nameWithOwner: string } | null>>(q);
      part.forEach((s, j) => {
        const node = res.data?.[`r${j}`];
        cache[key(s)] = node ? { githubId: node.databaseId, nameWithOwner: node.nameWithOwner, checkedAt: now } : { missing: true, checkedAt: now };
        answered++;
      });
    }
    return answered;
  }
  for (const s of todo) {
    const res = await fetch(`https://api.github.com/repos/${s}`, { headers: { accept: "application/vnd.github+json", "user-agent": "reppit-eval" } });
    if (res.status === 403 || res.status === 429) {
      console.warn(`GitHub REST rate limit reached after ${answered} lookups (60/h without a token); ${todo.length - answered} slugs left unresolved. Re-run later or set GITHUB_TOKEN.`);
      break;
    }
    if (res.status === 404) cache[key(s)] = { missing: true, checkedAt: now };
    else if (res.ok) { const j = (await res.json()) as { id: number; full_name: string }; cache[key(s)] = { githubId: j.id, nameWithOwner: j.full_name, checkedAt: now }; }
    else continue;
    answered++;
  }
  return answered;
}

interface Resolution { id: string | null; via: "slug" | "alias" | "github-id" | "github-name" | null; canonical?: string }

async function resolveExpected(db: Db, slug: string): Promise<Resolution> {
  const direct = await resolveItemBySlug(db, slug, { kind: "repo" });
  if (direct) return { id: direct.item.id, via: direct.viaAlias ? "alias" : "slug", canonical: direct.item.slug };
  const c = cache[key(slug)];
  if (c && "githubId" in c) {
    const byId = await findItemByGithubId(db, c.githubId);
    if (byId) return { id: byId.id, via: "github-id", canonical: byId.slug };
    const byName = await resolveItemBySlug(db, c.nameWithOwner, { kind: "repo" });
    if (byName) return { id: byName.item.id, via: "github-name", canonical: byName.item.slug };
    return { id: null, via: null, canonical: c.nameWithOwner };
  }
  return { id: null, via: null };
}

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const embedder = embedderFromEnv();

  // Resolve every expected slug once. Only ask GitHub about slugs the index cannot place.
  const all = [...new Set(fixtures.flatMap((f) => f.expect))];
  const unplaced: string[] = [];
  for (const s of all) if (!(await resolveItemBySlug(db, s, { kind: "repo" }))) unplaced.push(s);
  const looked = await lookupOnGitHub(unplaced);
  if (looked) fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2) + "\n");
  const resolved = new Map<string, Resolution>();
  for (const s of all) resolved.set(s, await resolveExpected(db, s));

  let hits = 0, hits1 = 0, ceiling = 0, empty = 0;
  const t0 = Date.now();
  for (const f of fixtures) {
    const expectedIds = new Set(f.expect.map((e) => resolved.get(e)!.id).filter((x): x is string => !!x));
    if (expectedIds.size) ceiling++;
    const { results: res } = await search(db, embedder, f.q, { limit: 5 });
    const hit = res.some((r) => expectedIds.has(r.item.id));
    if (hit) hits++;
    if (res[0] && expectedIds.has(res[0].item.id)) hits1++;
    if (res.length === 0) empty++;
    const mark = hit ? "✓" : expectedIds.size ? "✗" : "∅"; // ∅ = no expected repo is indexed: cannot hit
    console.log(`${mark} ${f.q}\n    top: ${res.map((r) => r.item.slug).join(", ") || "(none)"}`);
    if (verbose || !hit) {
      const notes = f.expect.map((e) => { const r = resolved.get(e)!; return r.id ? (r.via === "slug" ? null : `${e} → ${r.canonical} (${r.via})`) : `${e}${r.canonical && r.canonical.toLowerCase() !== e.toLowerCase() ? ` (now ${r.canonical})` : ""} not indexed`; }).filter(Boolean);
      if (notes.length) console.log(`    expected: ${notes.join("; ")}`);
    }
  }

  let negEmpty = 0;
  for (const f of negatives) {
    const res = await search(db, embedder, f.q, { limit: 5 });
    const ok = res.results.length === 0;
    if (ok) negEmpty++;
    console.log(`${ok ? "✓" : "✗"} [negative] ${f.q}${ok ? "" : `\n    returned: ${res.results.map((x) => x.item.slug).join(", ")}`}`);
  }

  const r = await db.execute(sql`select count(*)::int as n from items where embedding is not null`);
  const indexed = ((Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[])[0]?.n ?? 0;
  const inIndex = [...resolved.values()].filter((x) => x.id).length;
  const renamed = [...resolved.entries()].filter(([s, x]) => x.canonical && x.canonical.toLowerCase() !== s.toLowerCase());
  const unknown = all.filter((s) => !resolved.get(s)!.id && !cache[key(s)]);
  console.log(`\nhit@1: ${hits1}/${fixtures.length} · empty (not indexed): ${empty}/${fixtures.length} · negatives empty: ${negEmpty}/${negatives.length}`);
  console.log(`hit@5: ${hits}/${fixtures.length} · ceiling: ${ceiling}/${fixtures.length} (queries with ≥1 expected repo indexed) · expected repos indexed: ${inIndex}/${all.length}`);
  console.log(`indexed items: ${indexed} · embedder: ${embedder.name} · ${((Date.now() - t0) / fixtures.length).toFixed(0)} ms/query`);
  if (renamed.length) console.log(`renamed/transferred since the fixture was written: ${renamed.map(([s, x]) => `${s} → ${x.canonical}`).join(", ")}`);
  if (unknown.length) console.log(`${unknown.length} expected slug(s) neither indexed nor resolved on GitHub${offline ? " (--offline)" : ""}; a rename among them would be missed: ${unknown.join(", ")}`);

  if (fixFixtures) {
    let changed = 0;
    const next = allFixtures.map((f) => ({ ...f, expect: f.expect.map((e) => { const c = cache[key(e)]; if (c && "nameWithOwner" in c && c.nameWithOwner !== e) { changed++; return c.nameWithOwner; } return e; }) }));
    fs.writeFileSync(FIXTURES, "[\n" + next.map((f) => `  ${JSON.stringify(f).replace(/^\{"q":/, '{ "q": ').replace(/,"expect":/, ', "expect": ').replace(/\}$/, " }").replace(/","/g, '", "')}`).join(",\n") + "\n]\n");
    console.log(`--fix-fixtures: updated ${changed} slug(s) in eval/queries.json`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
