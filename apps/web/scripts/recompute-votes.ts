/** Advance every item's time-decayed vote, hot, and trust scores. */
import { config } from "./vendor/dotenv-lite.js";
import path from "node:path";
import { getDb } from "@gitit/db";
import { recomputeAllItemScores } from "@gitit/core";

config();

async function main() {
  const db = await getDb({ migrationsFolder: path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR ?? "../../packages/db/drizzle") });
  const width = Number(process.env.DATABASE_POOL_MAX ?? 5);
  const count = await recomputeAllItemScores(db, new Date(), width);
  console.log(`recomputed vote decay and trust for ${count} items`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
