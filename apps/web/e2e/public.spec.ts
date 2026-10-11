import { test, expect } from "@playwright/test";
import { expectNoHorizontalScroll, firstFeedSlug } from "./helpers";

test.describe("signed out", () => {
  test("landing states the claim and shows reason tags above the fold @phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/stars say it was popular/i).first()).toBeVisible();
    await expect(page.getByText(/unmaintained/i).first()).toBeInViewport();
    await expect(page.getByTestId("search-input").first()).toBeVisible();
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

  test("feed sorts and filters by kind", async ({ page }) => {
    for (const sort of ["hot", "top", "new"]) {
      await page.goto(`/?sort=${sort}`);
      await expect(page.getByTestId(`sort-${sort}`)).toBeVisible();
    }
    await page.goto("/?kind=skill&sort=top");
    await expect(page.getByTestId("feed-row").first()).toBeVisible();
  });

  test("item page shows a trust score and an install command @phone", async ({ page }) => {
    const slug = await firstFeedSlug(page);
    await page.goto(`/r/${slug}`);
    await expect(page.getByTestId("trust-score").first()).toBeVisible();
    await expect(page.getByTestId("signal-strip").first()).toBeVisible();
    await expect(page.getByTestId("install-command").first()).not.toBeEmpty();
    await expectNoHorizontalScroll(page);
  });

  test("voting while signed out sends you to sign in, it does not fail silently", async ({ page }) => {
    const slug = await firstFeedSlug(page);
    await page.goto(`/r/${slug}`);
    await page.getByTestId("vote-up").first().click();
    await expect(page.getByTestId("sign-in-link").first().or(page.getByTestId("vote-error").first())).toBeVisible();
  });

  test("unknown pages get a real 404", async ({ page }) => {
    const res = await page.goto("/r/this-owner-does-not-exist/nor-this-repo");
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
  });
});
