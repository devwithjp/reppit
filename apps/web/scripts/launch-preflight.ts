/** Read-only production readiness check. Never prints environment values or credentials. */
import { config } from "./vendor/dotenv-lite.js";
import pg from "pg";

config(".env.local");
config();
let failed = false;
async function check(name: string, run: () => Promise<string>) {
  try { console.log(`PASS ${name}: ${await run()}`); }
  catch (error) {
    failed = true;
    // Database errors can contain connection details: report codes, never connection strings.
    const e = error as { code?: string; name?: string };
    console.log(`FAIL ${name}: ${e.code ?? e.name ?? "check failed"}`);
  }
}
const required = [
  ["database", process.env.DATABASE_URL ?? process.env.POSTGRES_URL],
  ["Supabase URL", process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL],
  ["Supabase publishable key", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY],
] as const;
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) { console.error(`Missing configuration: ${missing.join(", ")}`); process.exit(1); }
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const db = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 8000, query_timeout: 8000,
  max: Number(process.env.DATABASE_POOL_MAX ?? 1),
  ...(process.env.DATABASE_SSL_CA ? { ssl: { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } } : {}),
});
await check("database and schema", async () => {
  // Referencing these columns also checks migrations required by the application.
  const { rows } = await db.query("select count(*)::int as n, count(embedding)::int as embedded, count(install_options)::int as installs, count(trust_score)::int as scored, count(*) filter (where kind = 'skill')::int as skills from items");
  await db.query("select auth_user_id, login, suspended_at from users limit 0");
  await db.query("select downvotes from comments limit 0");
  await db.query("select user_id, comment_id, direction from comment_votes limit 0");
  if (!rows[0].n || !rows[0].embedded || !rows[0].skills) throw Object.assign(new Error(), { code: "INDEX_NEEDS_POPULATION" });
  return `${rows[0].n} indexed entries, ${rows[0].skills} skills, ${rows[0].scored} scored`;
});
await check("database public access", async () => {
  const { rows } = await db.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
  if (rows.length) throw Object.assign(new Error(), { code: "RLS_MISSING" });
  const policies = await db.query("select policyname from pg_policies where schemaname = 'public'");
  if (policies.rows.length) throw Object.assign(new Error(), { code: "PUBLIC_POLICY_PRESENT" });
  const grants = await db.query("select grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')");
  if (grants.rows.length) throw Object.assign(new Error(), { code: "PUBLIC_GRANT_PRESENT" });
  return "RLS enabled with zero public policies or table grants";
});
await db.end();
await check("Supabase Auth", async () => {
  const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: publishableKey! }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Object.assign(new Error(), { code: `HTTP_${response.status}` });
  return "reachable";
});
await check("production embeddings", async () => {
  if (process.env.EMBEDDING_PROVIDER !== "supabase" || !process.env.EMBEDDING_FUNCTION_URL) throw Object.assign(new Error(), { code: "EMBED_FUNCTION_NOT_CONFIGURED" });
  const response = await fetch(process.env.EMBEDDING_FUNCTION_URL, {
    method: "POST", headers: { "content-type": "application/json", "x-reppit-embed-key": process.env.EMBEDDING_FUNCTION_KEY ?? "" },
    body: JSON.stringify({ input: ["find a skill for cinematic video editing"] }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Object.assign(new Error(), { code: `HTTP_${response.status}` });
  const body = await response.json() as { embeddings?: number[][] };
  if (body.embeddings?.length !== 1 || body.embeddings[0].length !== 384 || !body.embeddings[0].every(Number.isFinite)) throw new Error("invalid embedding response");
  return "384-dimensional vector received";
});
process.exitCode = failed ? 1 : 0;
