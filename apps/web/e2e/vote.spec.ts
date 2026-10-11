import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, firstFeedSlug, signIn, type TestUser } from "./helpers";

let user: TestUser | undefined;
test.beforeAll(async () => { user = await createTestUser("vote"); });
test.afterAll(async () => { await deleteTestUser(user); });

test("upvote, then remove it", async ({ page }) => {
  const slug = await firstFeedSlug(page);
  await signIn(page, user!, `/r/${slug}`);
  const count = page.getByTestId("vote-count").first();
  const before = Number((await count.innerText()).replace(/[^\d-]/g, ""));
  const voted = page.waitForResponse((r) => r.url().includes("/vote") && r.request().method() === "POST");
  await page.getByTestId("vote-up").first().click();
  expect((await voted).status()).toBe(200);
  await expect(count).not.toHaveText(String(before));
  const removed = page.waitForResponse((r) => r.url().includes("/vote"));
  await page.getByTestId("vote-up").first().click();
  expect((await removed).status()).toBe(200);
});

test("a downvote cannot go through without a reason", async ({ page, request }) => {
  const slug = await firstFeedSlug(page);
  await signIn(page, user!, `/r/${slug}`);
  // The API refuses a reasonless downvote outright...
  const res = await page.request.post(`/api/items/by-slug/${slug}/vote`, { data: { direction: "down" } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/reason/i);
  // ...and the UI only sends one once a reason is chosen.
  await page.getByTestId("vote-down").first().click();
  await expect(page.getByTestId("reason-option").first()).toBeVisible();
  const sent = page.waitForResponse((r) => r.url().includes("/vote") && r.request().method() === "POST");
  await page.locator('[data-testid="reason-option"][data-reason="unmaintained"]').first().click();
  if (await page.getByTestId("vote-submit").count()) await page.getByTestId("vote-submit").first().click();
  const r = await sent;
  expect(r.status()).toBe(200);
  expect(JSON.parse(r.request().postData() ?? "{}").reason).toBe("unmaintained");
  void request;
});

test("report that a skill works in an agent and see the report listed", async ({ page }) => {
  const slug = await firstFeedSlug(page, "skill");
  await signIn(page, user!, `/r/${slug}`);
  const form = page.getByTestId("compat-form").first();
  await form.getByTestId("compat-agent").selectOption("claude-code");
  await form.getByTestId("compat-status").selectOption("works");
  const sent = page.waitForResponse((r) => r.url().includes("/compat"));
  await form.getByTestId("compat-submit").click();
  expect((await sent).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("compat-report").filter({ hasText: user!.handle }).first()).toBeVisible();
});

test("the API rejects votes without a session", async ({ request, page }) => {
  const slug = await firstFeedSlug(page);
  const res = await request.post(`/api/items/by-slug/${slug}/vote`, { data: { direction: "up" } });
  expect(res.status()).toBe(401);
});
