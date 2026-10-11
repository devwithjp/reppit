/**
 * Apply the README install-section rule to stored rows, offline (no network): a repo whose install
 * section leads with brew, curl, a binary download or docker is an app, so its install line links
 * the docs instead of a package-manager command. Go/registry checks need scripts/signals.ts.
 *
 *   pnpm --filter @gitit/web exec tsx scripts/reclassify-installs.ts [--dry-run]
 */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, items } from "@gitit/db";
import { readmeSuggestsApp } from "@gitit/core";

config();
async function main() {
  const dry = process.argv.includes("--dry-run");
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const rows = await db.select({ id: items.id, slug: items.slug, readme: items.readme, installPackage: items.installPackage, eco: items.packageEcosystem })
    .from(items).where(eq(items.installKind, "package"));
  const apps = rows.filter((r) => readmeSuggestsApp(r.readme, [r.slug.split("/")[1] ?? "", (r.installPackage ?? "").split("/").pop() ?? ""]) === true);
  for (const r of apps) {
    console.log(`  app: ${r.slug} (was ${r.eco}: ${r.installPackage})`);
    if (!dry) await db.update(items).set({ installKind: "app", installPackage: null, installOptions: [] }).where(eq(items.id, r.id));
  }
  console.log(`${apps.length} of ${rows.length} package installs reclassified as apps${dry ? " (dry run)" : ""}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
