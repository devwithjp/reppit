/**
 * Recompute health_score for every item from its stored inputs (core healthScore, unknown-aware).
 * Run once after migration 0001, which nulls the REST-inflated open_issues values the old scores used.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/recompute-health.ts
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { getDb, items } from "@gitit/db";
import { refreshHealth } from "@gitit/core";

config();
async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const rows = await db.select({ id: items.id }).from(items);
  const now = new Date();
  // Each item is independent; a few at a time keeps a remote database from taking minutes per hundred.
  const width = Number(process.env.DATABASE_POOL_MAX ?? 5);
  for (let i = 0; i < rows.length; i += width) await Promise.all(rows.slice(i, i + width).map((r) => refreshHealth(db, r.id, now)));
  console.log(`recomputed health for ${rows.length} items`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
