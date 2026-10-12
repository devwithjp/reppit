import { purgeStaleTestUsers } from "./helpers";

/** After every run: no test voter may survive on a public page. */
export default async function teardown() {
  if (!process.env.DATABASE_URL) return;
  const n = await purgeStaleTestUsers();
  if (n) console.log(`[e2e] removed ${n} leftover test account(s)`);
}
