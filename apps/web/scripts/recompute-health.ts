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
  for (const r of rows) await refreshHealth(db, r.id, now);
  console.log(`recomputed health for ${rows.length} items`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
