import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export * from "./schema";
export { schema };

/** Driver-agnostic handle: PGlite in dev/test, node-postgres in production. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Resolve ./drizzle next to this file. Bundlers may rewrite import.meta.url, so fall back to the workspace path. */
function defaultMigrationsFolder(): string {
  try {
    const u = import.meta.url as unknown;
    const file = typeof u === "string" ? fileURLToPath(u) : u instanceof URL ? fileURLToPath(u) : String(u);
    const dir = path.dirname(file);
    if (/[\\/]packages[\\/]db[\\/]/.test(dir)) return path.resolve(dir.replace(/([\\/]packages[\\/]db)[\\/].*$/, "$1"), "drizzle");
  } catch { /* fall through */ }
  return path.resolve(process.cwd(), "../../packages/db/drizzle");
}

export interface DbOptions {
  /** Postgres connection string. Unset = embedded PGlite. */
  url?: string;
  /** PGlite data directory. Unset = in-memory (tests). */
  dataDir?: string;
  /**
   * Run migrations on connect. Default true, unless GITIT_AUTO_MIGRATE=0 (recommended in production,
   * where apps/web/scripts/migrate.ts runs once per deploy against the direct connection).
   */
  migrate?: boolean;
  /** Override the drizzle migrations folder (needed when bundlers rewrite import.meta.url). */
  migrationsFolder?: string;
}

export async function createDb(opts: DbOptions = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  const shouldMigrate = opts.migrate ?? process.env.GITIT_AUTO_MIGRATE !== "0";
  const migrationsFolder = opts.migrationsFolder ?? process.env.GITIT_MIGRATIONS_DIR ?? defaultMigrationsFolder();
  if (url) {
    // Supabase: the app should use the pooler URL (transaction mode, port 6543); migrations should use
    // the direct or session URL. Every serverless instance holds its own pool, so keep it small.
    // DATABASE_SSL_CA (PEM, "\n" escapes allowed) pins Supabase's CA; otherwise TLS follows sslmode in the URL.
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      ...(process.env.DATABASE_SSL_CA ? { ssl: { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } } : {}),
    });
    const db = drizzlePg(pool, { schema });
    if (shouldMigrate) {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      await migratePg(db, { migrationsFolder });
    }
    return db;
  }
  // PGlite ignores the second argument when the first is undefined, so always pass one options object.
  const dataDir = opts.dataDir ?? process.env.PGLITE_DIR;
  const client = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  const db = drizzlePglite(client, { schema });
  if (shouldMigrate) {
    await client.exec("CREATE EXTENSION IF NOT EXISTS vector");
    await migratePglite(db, { migrationsFolder });
  }
  return db;
}

const g = globalThis as unknown as { __gititDb?: Promise<Db> };
/** Process-wide singleton for the web app. Survives Next.js HMR via globalThis. */
export function getDb(opts: DbOptions = {}): Promise<Db> {
  if (!g.__gititDb) g.__gititDb = createDb({ dataDir: process.env.DATABASE_URL ? undefined : (process.env.PGLITE_DIR ?? ".pglite"), ...opts });
  return g.__gititDb;
}
