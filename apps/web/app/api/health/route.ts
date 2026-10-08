import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { json } from "@/lib/request-user";
export async function GET() {
  const d = await db();
  const [{ n }] = await d.execute(sql`select count(*)::int as n from items`).then((r) => (Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[]);
  return json({ ok: true, items: n, embedding: process.env.EMBEDDING_PROVIDER ?? "local" });
}
