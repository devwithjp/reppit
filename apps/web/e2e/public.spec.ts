import { test, expect } from "@playwright/test";
import { expectNoHorizontalScroll, firstFeedSlug } from "./helpers";

test.describe("signed out", () => {
  test("home states the claim, puts the problem search above the fold and lists repos @phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/stars say it was popular/i).first()).toBeVisible();
    await expect(page.locator(".welcome").getByTestId("search-input")).toBeInViewport();
    await expect(page.getByTestId("feed-row").first()).toBeVisible();
    await expect(page.getByText(/every downvote names a reason/i)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("problem-first search returns explained results", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-input").first().fill("extract tables from pdf files in python");
    await page.getByTestId("search-submit").first().click();
    await expect(page).toHaveURL(/\/search\?q=/);
    const results = page.getByTestId("result");
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThanOrEqual(3);
    await expect(results.first().getByTestId("result-why")).not.toBeEmpty();
    await expect(results.first().getByTestId("install-command")).not.toBeEmpty();
  });

  test("search with a too-short query says so instead of erroring", async ({ page }) => {
    await page.goto("/search?q=a");
    await expect(page.locator("body")).not.toContainText(/internal server error|application error/i);
  });

  test("feed rows carry the signal strip", async ({ page }) => {
    await page.goto("/?sort=top&kind=repo");
    await expect(page.getByTestId("feed-row").first().getByTestId("signal-strip")).toBeVisible();
  });

  test("feed sorts and filters by kind", async ({ page }) => {
    for (const sort of ["trusted", "top", "new"]) {
      await page.goto(`/?sort=${sort}`);
      await expect(page.getByTestId(`sort-${sort}`)).toHaveAttribute("aria-current", "true");
    }
    // Old links with ?sort=hot still open the feed.
    await page.goto("/?sort=hot");
    await expect(page.getByTestId("feed-row").first()).toBeVisible();
    await page.goto("/?kind=skill&sort=top");
    await expect(page.getByTestId("feed-row").first()).toBeVisible();
  });

  test("item page shows a trust score and an install command @phone", async ({ page }) => {
    const slug = await firstFeedSlug(page);
    await page.goto(`/r/${slug}`);
    await expect(page.getByTestId("trust-score").first()).toBeVisible();
    // The item page shows the full six-signal table; the compact strip is for list rows.
    await expect(page.getByTestId("signal-table")).toBeVisible();
    await expect(page.getByTestId("signal-table").locator("tbody tr")).toHaveCount(6);
    await expect(page.getByTestId("install-command").first()).not.toBeEmpty();
    await expectNoHorizontalScroll(page);
  });

  test("voting while signed out sends you to sign in, it does not fail silently", async ({ page }) => {
    const slug = await firstFeedSlug(page);
    await page.goto(`/r/${slug}`);
    await page.getByTestId("vote-up").first().click();
    const msg = page.getByTestId("vote-error").first();
    await expect(msg).toBeVisible();
    await expect(msg.getByTestId("sign-in-link")).toHaveAttribute("href", new RegExp(`next=.*${slug.split("/")[1]}`));
  });

  test("unknown pages get a real 404", async ({ page }) => {
    const res = await page.goto("/r/this-owner-does-not-exist/nor-this-repo");
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
  });
});
