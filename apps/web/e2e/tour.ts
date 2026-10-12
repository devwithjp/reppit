/**
 * Visual tour: opens a visible Chrome, walks every main screen signed out and signed in, and saves
 * desktop and phone screenshots for a UX review. Not a test; nothing asserts.
 *
 *   NODE_OPTIONS=--experimental-websocket pnpm exec tsx e2e/tour.ts <out-dir>
 *
 * Needs the server on E2E_BASE_URL (default http://localhost:3100) and the Supabase env vars for the
 * signed-in part. The throwaway account is deleted at the end.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "tour";
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

const PUBLIC: [string, string][] = [
  ["01-home", "/"],
  ["02-search-good", "/search?q=parse%20command%20line%20arguments%20in%20rust"],
  ["03-search-phrase", "/search?q=self%20hosted%20feature%20flags"],
  ["04-search-none", "/search?q=retry%20with%20exponential%20backoff%20python"],
  ["05-search-gibberish", "/search?q=asdkjh%20qwpeoi"],
  ["06-skills", "/?kind=skill"],
  ["07-trust", "/trust"],
  ["08-agent", "/agent"],
  ["09-login", "/login"],
  ["10-signup", "/signup"],
  ["11-404", "/r/nope/nothing-here"],
];

async function shoot(page: Page, name: string, size: keyof typeof SIZES) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: size === "phone" ? false : true });
}

async function firstSlug(page: Page) {
  await page.goto(`${BASE}/?sort=top&kind=repo`);
  return page.getByTestId("feed-row").first().getAttribute("data-slug");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 150 });
  let user: TestUser | undefined;
  try {
    for (const size of Object.keys(SIZES) as (keyof typeof SIZES)[]) {
      const page = await (await browser.newContext({ viewport: SIZES[size] })).newPage();
      for (const [name, path] of PUBLIC) {
        await page.goto(BASE + path);
        await shoot(page, name, size);
      }
      const slug = await firstSlug(page);
      if (slug) { await page.goto(`${BASE}/r/${slug}`); await shoot(page, "12-item", size); }
      await page.close();
    }

    user = await createTestUser("tour");
    const page = await (await browser.newContext({ viewport: SIZES.desktop })).newPage();
    await page.goto(`${BASE}/login`);
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByTestId("auth-submit").click();
    await page.getByTestId("viewer-handle").waitFor();
    await shoot(page, "13-home-signed-in", "desktop");
    const slug = await firstSlug(page);
    if (slug) {
      await page.goto(`${BASE}/r/${slug}`);
      await shoot(page, "14-item-signed-in", "desktop");
    }
    await page.goto(`${BASE}/submit`);
    await shoot(page, "15-submit", "desktop");
    await page.goto(`${BASE}/account`);
    await shoot(page, "16-account", "desktop");
  } finally {
    await deleteTestUser(user);
    await browser.close();
  }
  console.log(`saved to ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
