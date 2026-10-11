import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, signIn, type TestUser } from "./helpers";

let user: TestUser | undefined;
test.beforeAll(async () => { user = await createTestUser("submit"); });
test.afterAll(async () => { await deleteTestUser(user); });

test("submitting garbage explains what a valid repo looks like", async ({ page }) => {
  await signIn(page, user!, "/submit");
  await page.getByTestId("submit-repo-input").fill("not a repo at all");
  await page.getByTestId("submit-repo-button").click();
  await expect(page.getByTestId("submit-error")).toContainText(/owner\/name|github/i);
});

test("submitting a repo that is already indexed takes you to it", async ({ page }) => {
  await signIn(page, user!, "/submit");
  await page.goto("/?sort=top&kind=repo");
  const slug = await page.getByTestId("feed-row").first().getAttribute("data-slug");
  await page.goto("/submit");
  await page.getByTestId("submit-repo-input").fill(`https://github.com/${slug}`);
  await page.getByTestId("submit-repo-button").click();
  await expect(page).toHaveURL(new RegExp(`/r/${slug!.replace("/", "\\/")}`));
});

test("submit requires signing in", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/submit");
  await expect(page.getByTestId("sign-in-link").first()).toBeVisible();
  await ctx.close();
});
