/**
 * Run Drizzle migrations once (per deploy), then optionally apply packages/db/supabase/rls.sql.
 *
 *   DATABASE_URL=<direct or session connection, not the transaction pooler> \
 *     pnpm --filter @gitit/web exec tsx scripts/migrate.ts [--rls]
 *
 * Without DATABASE_URL it migrates the PGlite dir in PGLITE_DIR (default .pglite). Only one process can
 * open a PGlite dir: stop the dev server first.
 */
import { config } from "./vendor/dotenv-lite.js";
import fs from "node:fs";
import path from "node:path";
import { createDb } from "@gitit/db";

config();
const migrationsFolder = path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle");
const rls = process.argv.includes("--rls");

async function main() {
  const url = process.env.DATABASE_URL;
  const db = await createDb({ url, dataDir: url ? undefined : (process.env.PGLITE_DIR ?? ".pglite"), migrate: true, migrationsFolder });
  console.log(`migrated ${url ? "postgres" : `pglite (${process.env.PGLITE_DIR ?? ".pglite"})`} from ${migrationsFolder}`);
  if (rls) {
    if (!url) { console.log("--rls skipped: RLS only matters on Supabase (DATABASE_URL)"); process.exit(0); }
    // The node-postgres pool behind drizzle; a parameterless query uses the simple protocol, so the
    // multi-statement file runs as one call.
    const client = (db as unknown as { $client: { query(text: string): Promise<{ rows: { tablename: string }[] }>; end(): Promise<void> } }).$client;
    await client.query(fs.readFileSync(path.resolve(migrationsFolder, "../supabase/rls.sql"), "utf8"));
    const { rows } = await client.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    await client.end();
    if (rows.length) { console.error(`RLS still off on: ${rows.map((r) => r.tablename).join(", ")}`); process.exit(1); }
    console.log("rls.sql applied: RLS on for every public table, no policies");
  }
  process.exit(0);
}
main().catch((e) => { console.error("migrate failed:", (e as Error).message); process.exit(1); });
