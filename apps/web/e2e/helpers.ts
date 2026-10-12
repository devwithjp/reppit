import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { eq, inArray, like } from "drizzle-orm";
import { getDb, users, votes, items, agentCompatReports } from "@gitit/db";
import { recomputeItemScores, refreshHealth } from "@gitit/core";

/** A confirmed throwaway account, created through the Supabase admin API and deleted afterwards. */
export interface TestUser {
  id: string;
  email: string;
  password: string;
  handle: string;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createTestUser(tag: string): Promise<TestUser> {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const handle = `e2e-${tag}-${stamp}`.slice(0, 30);
  const email = `e2e.${tag}.${stamp}@example.com`;
  const password = `pw-${stamp}-Aa1!`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { handle } });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email, password, handle };
}

/**
 * Remove every trace of test accounts from the app database: their votes, reports and comments
 * (cascade), their name on anything they submitted, and the vote totals those votes moved.
 * Without this, a test run leaves "e2e-..." voters on public item pages.
 */
async function purgeAppUsers(where: ReturnType<typeof eq>) {
  const d = await getDb({});
  const gone = await d.select({ id: users.id }).from(users).where(where);
  if (!gone.length) return 0;
  const ids = gone.map((u) => u.id);
  const touched = new Set([
    ...(await d.select({ id: votes.itemId }).from(votes).where(inArray(votes.userId, ids))).map((r) => r.id),
    ...(await d.select({ id: agentCompatReports.itemId }).from(agentCompatReports).where(inArray(agentCompatReports.userId, ids))).map((r) => r.id),
  ]);
  await d.update(items).set({ submittedBy: null }).where(inArray(items.submittedBy, ids));
  await d.delete(users).where(inArray(users.id, ids));
  for (const id of touched) { await recomputeItemScores(d, id); await refreshHealth(d, id); }
  return ids.length;
}

export async function deleteTestUser(u: TestUser | undefined) {
  if (!u) return;
  // Only against Postgres: a local PGlite directory is held by the running server.
  if (process.env.DATABASE_URL) await purgeAppUsers(eq(users.authUserId, u.id)).catch((e) => console.error("[e2e] purge failed:", e));
  await admin().auth.admin.deleteUser(u.id).catch(() => {});
}

/** Sweep test accounts a crashed run left behind. Only handles made by createTestUser ("e2e-"). */
export async function purgeStaleTestUsers() {
  return purgeAppUsers(like(users.login, "e2e-%") as ReturnType<typeof eq>);
}

export async function signIn(page: Page, u: TestUser, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(u.email);
  await page.locator('input[name="password"]').fill(u.password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("viewer-handle")).toBeVisible();
}

/** The slug of the first repo in the feed, so tests never depend on a hard-coded repo. */
export async function firstFeedSlug(page: Page, kind = "repo"): Promise<string> {
  await page.goto(`/?sort=top&kind=${kind}`);
  const row = page.getByTestId("feed-row").first();
  await expect(row).toBeVisible();
  const slug = await row.getAttribute("data-slug");
  if (!slug) throw new Error("feed row has no data-slug");
  return slug;
}

/** The page body must never scroll sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(1);
}
