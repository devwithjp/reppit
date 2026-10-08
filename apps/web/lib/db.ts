import { getDb } from "@gitit/db";
import path from "node:path";

export const db = () =>
  getDb({ migrationsFolder: process.env.GITIT_MIGRATIONS_DIR ? path.resolve(process.cwd(), process.env.GITIT_MIGRATIONS_DIR) : undefined })
    .catch((e: unknown) => { console.error("[gitit] database init failed:", (e as Error).stack ?? e); throw e; });
