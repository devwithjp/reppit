import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { json } from "@/lib/request-user";

/** Liveness + DB check. Never leaks error details; 503 when the database is unreachable. */
export async function GET() {
  try {
    const d = await db();
    const r = await d.execute(sql`select count(*)::int as n from items`);
    const [{ n }] = (Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[];
    return json({ ok: true, items: n, embedding: process.env.EMBEDDING_PROVIDER ?? "local" }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[api health]", e);
    return json({ ok: false, error: "database unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
