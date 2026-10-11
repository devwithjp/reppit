/**
 * Copy the indexed items from a local PGlite data directory into a Postgres database
 * (Supabase in production). Only the index moves: items and their embeddings. Users,
 * votes and reports are never copied, because dev accounts must not become real ones.
 *
 *   SOURCE_PGLITE=/path/to/copy-of/.pglite DATABASE_URL=postgres://... \
 *     pnpm --filter @gitit/web exec tsx ../../scripts/copy-index.ts
 *
 * Point SOURCE_PGLITE at a COPY of apps/web/.pglite: PGlite allows one process at a time,
 * and the dev server may hold the original. Rows already present (same slug and kind) are
 * left alone, so the script is safe to run twice.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { createDb, items } from "@gitit/db";
import { hotScore } from "@gitit/core";

async function main() {
  const src = process.env.SOURCE_PGLITE;
  if (!src) throw new Error("set SOURCE_PGLITE to a copy of apps/web/.pglite");
  if (!process.env.DATABASE_URL) throw new Error("set DATABASE_URL to the target Postgres");

  const pg = new PGlite({ dataDir: src, extensions: { vector } });
  const from = drizzlePglite(pg);
  const to = await createDb({ url: process.env.DATABASE_URL });

  const rows = await from.select().from(items);
  console.log(`source has ${rows.length} items`);
  let copied = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => ({
      ...r,
      // Community state starts fresh in production.
      // Hot score keeps its age term, so the hot sort is not flat on day one.
      upvotes: 0, downvotes: 0, weightedScore: 0, hotScore: hotScore(0, r.createdAt), commentCount: 0, submittedBy: null,
    }));
    const res = await to.insert(items).values(batch).onConflictDoNothing().returning({ id: items.id });
    copied += res.length;
    console.log(`  ${Math.min(i + 100, rows.length)}/${rows.length} read, ${copied} new`);
  }
  console.log(`done: ${copied} items copied`);
  await pg.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
