import { test, expect } from "@playwright/test";

// The HTTP API is what the CLI and MCP server call; it has to behave without a browser.

test("search API returns ranked results with reasons", async ({ request }) => {
  const res = await request.get("/api/search?q=schema%20validation%20for%20typescript&limit=5");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.results)).toBe(true);
  expect(body.results.length).toBeGreaterThan(0);
  for (const r of body.results) {
    expect(typeof r.why).toBe("string");
    expect(r.item.slug).toMatch(/\//);
  }
});

test("search API refuses a too-short query with a JSON error", async ({ request }) => {
  const res = await request.get("/api/search?q=a");
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBeTruthy();
});

test("unknown item is a JSON 404, not a crash", async ({ request }) => {
  const res = await request.get("/api/items/by-slug/no-such-owner/no-such-repo");
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBeTruthy();
});

test("health endpoint reports the index", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).items).toBeGreaterThan(100);
});
