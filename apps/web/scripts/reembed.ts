/**
 * Re-embed every item whose stored vector was not written by the configured embedder.
 *
 *   EMBEDDING_PROVIDER=gte-small pnpm --filter @gitit/web exec tsx scripts/reembed.ts [--batch 32] [--all]
 *
 * Resumable and safe to re-run: it selects rows where embedding is null or embedding_model differs
 * from the embedder's name, writes after every batch, and a second run picks up where the first
 * stopped. --all re-embeds everything regardless. Text is the same itemEmbeddingText the ingest path
 * uses, so query and index vectors stay comparable.
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { eq, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, items } from "@gitit/db";
import { embedderFromEnv, itemEmbeddingText } from "@gitit/core";

config();
const args = process.argv.slice(2);
const i = args.indexOf("--batch");
const BATCH = i >= 0 ? Math.max(1, Number(args[i + 1]) || 32) : 32;
const ALL = args.includes("--all");

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const embedder = embedderFromEnv();
  const stale = or(isNull(items.embedding), isNull(items.embeddingModel), ne(items.embeddingModel, embedder.name));
  const cols = { id: items.id, name: items.name, description: items.description, topics: items.topics, readme: items.readme, language: items.language };
  const todo = ALL ? await db.select(cols).from(items) : await db.select(cols).from(items).where(stale);
  console.log(`reembed: ${todo.length} items with ${embedder.name}, batch ${BATCH}${ALL ? " (all)" : ""}`);
  const t0 = Date.now();
  for (let k = 0; k < todo.length; k += BATCH) {
    const batch = todo.slice(k, k + BATCH);
    const vecs = await embedder.embed(batch.map((r) => itemEmbeddingText(r)));
    const now = new Date();
    for (const [j, r] of batch.entries()) {
      await db.update(items).set({ embedding: vecs[j], embeddingModel: embedder.name, embeddedAt: now }).where(eq(items.id, r.id));
    }
    const done = Math.min(k + BATCH, todo.length);
    if (done % (BATCH * 10) === 0 || done === todo.length) {
      const rate = done / Math.max(1, (Date.now() - t0) / 1000);
      console.log(`  ${done}/${todo.length} · ${rate.toFixed(1)} items/s`);
    }
  }
  const r = await db.execute(sql`select count(*)::int as n from ${items} where ${items.embeddingModel} = ${embedder.name}`);
  const n = ((Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[])[0].n;
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${n} items embedded with ${embedder.name}`);
  process.exit(0);
}
main().catch((e) => { console.error("reembed failed:", (e as Error).message); process.exit(1); });
