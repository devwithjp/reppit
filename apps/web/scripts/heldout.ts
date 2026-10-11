/**
 * Print the top three (or "not in the index") for the held-out queries in eval/heldout.json, for a
 * person to judge. Deliberately no scoring: these queries must not become tuning targets.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/heldout.ts [--file eval/heldout-pass4.json]
 */
import { config } from "./vendor/dotenv-lite.js";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@gitit/db";
import { search, embedderFromEnv } from "@gitit/core";

config();
async function main() {
  const i = process.argv.indexOf("--file");
  const file = i >= 0 ? process.argv[i + 1] : "eval/heldout.json";
  const { queries } = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as { queries: string[] };
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const e = embedderFromEnv();
  for (const q of queries) {
    const r = await search(db, e, q, { limit: 3 });
    const line = r.notIndexed
      ? `not in the index${r.related?.length ? ` (related: ${r.related.map((x) => x.item.slug).join(", ")})` : ""}`
      : r.results.map((x) => `${x.item.slug} [${x.match}${x.install ? `, ${x.install.ecosystem}: ${x.install.name}` : ""}]`).join(" · ");
    console.log(`${q.padEnd(40)} ${line}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
