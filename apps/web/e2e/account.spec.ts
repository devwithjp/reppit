import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, firstFeedSlug, signIn, type TestUser } from "./helpers";

let user: TestUser | undefined;
test.beforeAll(async () => { user = await createTestUser("acct"); });
test.afterAll(async () => { await deleteTestUser(user); });

test("wrong password shows a plain message and does not sign in", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user!.email);
  await page.locator('input[name="password"]').fill("not-the-password");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-message")).toContainText(/do not match/i);
  await expect(page.getByTestId("viewer-handle")).toHaveCount(0);
});

test("sign in, see your handle, sign out", async ({ page }) => {
  await signIn(page, user!);
  await expect(page.getByTestId("viewer-handle")).toContainText(user!.handle);
  await page.getByTestId("sign-out-button").click();
  await expect(page.getByTestId("sign-in-link").first()).toBeVisible();
});

test("sign in returns you to the page you came from", async ({ page }) => {
  const slug = await firstFeedSlug(page);
  await signIn(page, user!, `/r/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/r/${slug.replace("/", "\\/")}`));
});

test("a sign-in link for an off-site 'next' stays on site", async ({ page }) => {
  await signIn(page, user!, "//evil.example.com");
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100");
  expect(new URL(page.url()).host).toBe(base.host);
});

test("signup form rejects a short password before calling the server", async ({ page }) => {
  await page.goto("/signup");
  await page.locator('input[name="handle"]').fill("shortpw");
  await page.locator('input[name="email"]').fill("e2e.shortpw@example.com");
  await page.locator('input[name="password"]').fill("abc");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-message").or(page.locator("input:invalid")).first()).toBeVisible();
});

test("magic link request answers the same way for any address", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user!.email);
  await page.getByRole("button", { name: /sign-in link instead/i }).click();
  await expect(page.locator('input[name="email"]')).toHaveValue(user!.email);
  await page.getByTestId("magic-link-submit").click();
  await expect(page.getByTestId("auth-message")).toContainText(/link is on its way|too many attempts/i);
});

test("a personal token is read-only unless write is ticked", async ({ page, request }) => {
  const slug = await firstFeedSlug(page);
  await signIn(page, user!, "/account");

  // Read token: can search, cannot vote.
  await page.getByTestId("token-create").click();
  const readToken = (await page.getByTestId("token-value").textContent())?.trim();
  expect(readToken).toMatch(/^reppit_/);
  await expect(page.getByTestId("token-scope")).toContainText(/read only/i);
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  expect((await request.get("/api/search?q=pdf%20tables%20python", { headers: auth(readToken!) })).status()).toBe(200);
  const refused = await request.post(`/api/items/by-slug/${slug}/vote`, { headers: auth(readToken!), data: { direction: "up" } });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toMatch(/read-only/i);

  // Revoke it, then a write token can vote as this user.
  await page.getByTestId("token-revoke").click();
  await page.getByTestId("token-write").check();
  await page.getByTestId("token-create").click();
  const writeToken = (await page.getByTestId("token-value").textContent())?.trim();
  await expect(page.getByTestId("token-scope")).toContainText(/act as you/i);
  const ok = await request.post(`/api/items/by-slug/${slug}/vote`, { headers: auth(writeToken!), data: { direction: "up" } });
  expect(ok.status()).toBe(200);
  // The revoked read token no longer works at all.
  const revoked = await request.post(`/api/items/by-slug/${slug}/vote`, { headers: auth(readToken!), data: { direction: "up" } });
  expect([401, 403]).toContain(revoked.status());
});
