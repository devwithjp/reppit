/**
 * Seed the index. Usage: pnpm seed [--limit 1000] [--no-readme] [--skills]
 * Without GITHUB_TOKEN GitHub allows 60 req/h; use --no-readme and a small --limit.
 */
import { config } from "./vendor/dotenv-lite.js";
import { getDb, items } from "@gitit/db";
import { GitHubClient, repoToItem, ingestSkillsFromRepo, itemEmbeddingText, embedderFromEnv, type GhRepo } from "@gitit/core";
import path from "node:path";

config();
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(flag("--limit") ?? 300);
const withReadme = !args.includes("--no-readme");
const withSkills = args.includes("--skills");

const LANGS = ["python", "typescript", "javascript", "go", "rust", "java", "c++", "c#", "ruby", "swift", "kotlin", "php"];
// Problem-shaped queries so the index covers what people actually ask for.
const TOPICS = [
  "pdf", "web-scraping", "orm", "authentication", "cli", "testing", "http-client", "web-framework", "state-management",
  "charts", "markdown", "image-processing", "queue", "cache", "search-engine", "vector-database", "llm", "agents", "rag",
  "websocket", "graphql", "validation", "date", "logging", "config", "cron", "email", "payments", "i18n", "ocr",
  "speech-to-text", "video", "game-engine", "terminal-ui", "parser", "compiler", "mcp", "mcp-server", "claude-code",
];
const SKILL_REPOS = [["anthropics", "skills"], ["vercel-labs", "skills"], ["obra", "superpowers"]];

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const gh = new GitHubClient();
  const embedder = embedderFromEnv();
  const seen = new Set<string>();
  const existing = await db.select({ slug: items.slug }).from(items);
  for (const e of existing) seen.add(e.slug);
  console.log(`existing: ${seen.size}, target: +${limit}, readme: ${withReadme}, embedder: ${embedder.name}, token: ${!!process.env.GITHUB_TOKEN}`);

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
      for (const r of found) if (!seen.has(r.full_name)) { seen.add(r.full_name); queue.push(r); added++; }
      console.log(`  ${q}: +${added} (queue ${queue.length})`);
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`  search "${q}" failed: ${msg.slice(0, 100)}`);
      if (/403|429|rate limit/i.test(msg)) { console.warn("  rate limited, waiting 65s"); await sleep(65_000); }
    }
    await sleep(pauseMs);
  }

  let inserted = 0;
  for (let i = 0; i < queue.length; i += 20) {
    const batch = queue.slice(i, i + 20);
    const rows = await Promise.all(batch.map(async (r) => {
      const readme = withReadme ? await gh.readme(r.owner.login, r.name).catch(() => null) : null;
      return repoToItem(r, readme, null);
    }));
    const vecs = await embedder.embed(rows.map(itemEmbeddingText));
    const res = await db.insert(items).values(rows.map((r, j) => ({ ...r, embedding: vecs[j], embeddedAt: new Date() }))).onConflictDoNothing().returning({ id: items.id });
    inserted += res.length;
    console.log(`inserted ${inserted}/${queue.length}`);
  }

  if (withSkills) {
    for (const [o, r] of SKILL_REPOS) {
      try {
        const rows = await ingestSkillsFromRepo(gh, o, r);
        if (!rows.length) continue;
        const vecs = await embedder.embed(rows.map(itemEmbeddingText));
        const res = await db.insert(items).values(rows.map((x, j) => ({ ...x, embedding: vecs[j], embeddedAt: new Date() }))).onConflictDoNothing().returning({ id: items.id });
        console.log(`skills ${o}/${r}: +${res.length}`);
      } catch (e) { console.warn(`skills ${o}/${r} failed: ${(e as Error).message.slice(0, 120)}`); }
    }
  }
  console.log("done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
