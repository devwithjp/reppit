/**
 * Grow the index from a broad list of general developer topics, through GitHub's REST search
 * endpoint (works without a token: about 10 searches a minute, separate from the 60/hour core limit).
 * A search result already carries what a row needs (stars, pushed_at, licence, topics, description),
 * so this costs no core API quota. READMEs, packages, releases and advisories are filled afterwards
 * by scripts/signals.ts.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/grow.ts [--target 3000] [--min-stars 300] [--per-topic 100] [--min-free-mb 700]
 *
 * The topic list is deliberately generic (GitHub's common developer topics across web, backend, data,
 * ML, devops, testing, CLI, security, databases, auth, payments, mobile, ...). It is not derived from
 * any evaluation or critique query; topics that would map one-to-one onto held-out queries are left
 * out on purpose (feature flags, mocking, state machines, dataframes/pandas, markdown-to-pdf, image
 * resizing, GraphQL clients, structured logging).
 *
 * Stops at --target repos in the index, or when free disk space falls under --min-free-mb. Safe to
 * re-run: rows are upserted by github_id, and topics already done are cheap to repeat.
 */
import { config } from "./vendor/dotenv-lite.js";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb, items } from "@gitit/db";
import { repoToItem, embedderFromEnv, storeRepos, emptyCounts, type GhRepo, type PreparedRepo } from "@gitit/core";

config();
const args = process.argv.slice(2);
const flag = (n: string, d: number) => { const i = args.indexOf(n); const v = i >= 0 ? Number(args[i + 1]) : d; return Number.isFinite(v) && v > 0 ? v : d; };
const TARGET = flag("--target", 3000);
const MIN_STARS = flag("--min-stars", 300);
const PER_TOPIC = Math.min(100, flag("--per-topic", 100));
const MIN_FREE_MB = flag("--min-free-mb", 700);

export const TOPICS = [
  // web and frontend
  "react", "vue", "svelte", "angular", "nextjs", "nuxt", "remix", "astro", "solidjs", "preact", "web-components", "tailwindcss",
  "css", "sass", "design-system", "ui-components", "component-library", "animation", "charts", "data-visualization", "d3",
  "webpack", "vite", "rollup", "esbuild", "babel", "bundler", "pwa", "static-site-generator", "jamstack",
  // backend and APIs
  "nodejs", "express", "fastify", "koa", "nestjs", "deno", "bun", "django", "flask", "rails", "laravel", "spring-boot",
  "rest-api", "graphql", "grpc", "openapi", "api-gateway", "microservices", "serverless", "websocket", "http-client",
  "http-server", "web-framework", "rpc", "middleware",
  // data and databases
  "database", "postgresql", "mysql", "sqlite", "mongodb", "redis", "elasticsearch", "orm", "query-builder", "migrations",
  "time-series", "key-value-store", "embedded-database", "vector-database", "etl", "data-pipeline", "stream-processing",
  "kafka", "apache-spark", "data-engineering", "analytics", "csv", "json", "yaml", "parquet", "serialization",
  // ML and AI
  "machine-learning", "deep-learning", "pytorch", "tensorflow", "llm", "nlp", "computer-vision", "transformers",
  "reinforcement-learning", "speech-recognition", "text-to-speech", "embeddings", "rag", "ai-agents", "inference",
  "mlops", "jupyter-notebook", "scikit-learn", "langchain", "openai",
  // devops and infrastructure
  "docker", "kubernetes", "terraform", "ansible", "helm", "ci-cd", "github-actions", "monitoring", "observability",
  "prometheus", "grafana", "tracing", "opentelemetry", "logging", "infrastructure-as-code", "devops", "nginx", "proxy",
  "load-balancer", "service-mesh", "self-hosted", "homelab",
  // testing and quality
  "testing", "unit-testing", "e2e-testing", "test-automation", "playwright", "selenium", "jest", "pytest", "benchmark",
  "fuzzing", "linter", "static-analysis", "code-quality", "formatter", "type-checker",
  // CLI and tooling
  "cli", "terminal", "tui", "shell", "zsh", "command-line", "developer-tools", "productivity", "dotfiles", "git",
  "code-generation", "scaffolding", "monorepo", "package-manager", "build-tool", "compiler", "parser", "interpreter",
  "language-server", "vscode-extension", "neovim", "editor",
  // security and auth
  "security", "cryptography", "encryption", "authentication", "authorization", "oauth2", "jwt", "sso", "password-manager",
  "vulnerability-scanner", "penetration-testing", "secrets-management", "privacy",
  // payments, commerce, communication
  "payments", "stripe", "ecommerce", "email", "smtp", "notifications", "chat", "realtime", "webrtc", "video", "audio",
  "streaming", "media-server",
  // mobile and desktop
  "android", "ios", "react-native", "flutter", "swiftui", "kotlin", "electron", "tauri", "desktop-app", "cross-platform",
  // languages and runtimes
  "rust", "golang", "python", "typescript", "java", "csharp", "cpp", "zig", "elixir", "scala", "haskell", "webassembly",
  // documents, content, misc
  "pdf", "markdown", "documentation", "cms", "headless-cms", "search-engine", "full-text-search", "web-scraping", "crawler",
  "automation", "workflow-engine", "scheduler", "cron", "queue", "job-queue", "cache", "caching", "rate-limiting",
  "validation", "schema", "i18n", "date", "image-processing", "ocr", "compression", "networking", "dns", "vpn", "p2p",
  "blockchain", "game-engine", "gamedev", "robotics", "iot", "embedded", "scientific-computing", "math", "geospatial", "maps",
];

function freeMb(): number {
  try { const st = fs.statfsSync(process.cwd()); return (st.bavail * st.bsize) / 1_048_576; } catch { return Number.POSITIVE_INFINITY; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchTopic(topic: string): Promise<GhRepo[]> {
  const q = encodeURIComponent(`topic:${topic} stars:>=${MIN_STARS} archived:false`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_TOPIC}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "reppit-ingest (+https://reppit.dev)", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    });
    if (res.ok) return ((await res.json()) as { items?: GhRepo[] }).items ?? [];
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
      const wait = Math.min(120_000, Math.max(10_000, reset - Date.now() + 2_000));
      console.warn(`  search rate limited; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`search ${topic} ${res.status}`);
  }
  throw new Error(`search ${topic}: still rate limited`);
}

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const embedder = embedderFromEnv();
  const count = async () => {
    const r = await db.execute(sql`select count(*)::int as n from ${items} where kind = 'repo'`);
    return ((Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[])[0].n;
  };
  const known = new Set((await db.select({ g: items.githubId }).from(items)).map((r) => r.g).filter((g): g is number => g !== null));
  let total = await count();
  console.log(`grow: ${total} repos now, target ${TARGET}, ${TOPICS.length} topics, stars >= ${MIN_STARS}, free ${Math.round(freeMb())} MB (stop under ${MIN_FREE_MB})`);
  const counts = emptyCounts();
  const pauseMs = process.env.GITHUB_TOKEN ? 2_200 : 6_500; // search: 30/min with a token, 10/min without
  const failed: string[] = [];
  let topicsDone = 0;

  for (const topic of TOPICS) {
    if (total >= TARGET) { console.log(`target reached (${total})`); break; }
    if (freeMb() < MIN_FREE_MB) { console.log(`stopping: free disk ${Math.round(freeMb())} MB is under ${MIN_FREE_MB} MB`); break; }
    try {
      const found = await searchTopic(topic);
      const fresh = found.filter((r) => !known.has(r.id)).slice(0, Math.max(0, TARGET - total));
      if (fresh.length) {
        const prepared: PreparedRepo[] = fresh.map((r) => ({ row: repoToItem(r, null, null), requestedSlug: r.full_name }));
        await storeRepos(db, embedder, prepared, { checkSignals: false }, counts);
        for (const r of fresh) known.add(r.id);
        total = await count();
      }
      topicsDone++;
      console.log(`  ${topic}: ${found.length} found, +${fresh.length} new · ${total} repos · free ${Math.round(freeMb())} MB`);
    } catch (e) {
      failed.push(topic);
      console.warn(`  ${topic}: ${(e as Error).message.slice(0, 100)}`);
    }
    await sleep(pauseMs);
  }
  console.log(`\ndone: ${total} repos · topics searched ${topicsDone}/${TOPICS.length} · ${JSON.stringify(counts)} · free ${Math.round(freeMb())} MB`);
  if (failed.length) console.log(`topics that failed: ${failed.join(", ")}`);
  console.log("next: scripts/signals.ts (READMEs, packages, releases, advisories) and scripts/recompute-health.ts");
  process.exit(0);
}
main().catch((e) => { console.error("grow failed:", (e as Error).message); process.exit(1); });
