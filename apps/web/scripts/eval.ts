/** Hit-rate eval: for each fixture query, is an expected repo in the top 5? Target: 25/30. */
import { config } from "./vendor/dotenv-lite.js";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@gitit/db";
import { search, embedderFromEnv } from "@gitit/core";
config();
const fixtures = JSON.parse(fs.readFileSync(path.resolve("eval/queries.json"), "utf8")) as { q: string; expect: string[] }[];
async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const embedder = embedderFromEnv();
  let hits = 0, indexed = 0;
  const t0 = Date.now();
  for (const f of fixtures) {
    const res = await search(db, embedder, f.q, { limit: 5 });
    const top = res.map((r) => r.item.slug.toLowerCase());
    const hit = f.expect.some((e) => top.includes(e.toLowerCase()));
    if (hit) hits++;
    console.log(`${hit ? "✓" : "✗"} ${f.q}\n    top: ${top.join(", ") || "(none)"}`);
  }
  const { sql } = await import("drizzle-orm");
  const r = await db.execute(sql`select count(*)::int as n from items where embedding is not null`);
  indexed = ((Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[])[0]?.n ?? 0;
  console.log(`\nhit@5: ${hits}/${fixtures.length} · indexed items: ${indexed} · embedder: ${embedder.name} · ${((Date.now() - t0) / fixtures.length).toFixed(0)} ms/query`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
