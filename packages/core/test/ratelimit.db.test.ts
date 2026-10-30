import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@gitit/db";
import { DatabaseRateLimitStore } from "../src/ratelimit";

let db: Db;

beforeAll(async () => {
  db = await createDb({});
}, 60_000);

describe("DatabaseRateLimitStore (pglite)", () => {
  it("shares a counter between store instances", async () => {
    const now = () => new Date("2026-10-30T10:00:00.000Z");
    const firstInstance = new DatabaseRateLimitStore(async () => db, now);
    const nextInstance = new DatabaseRateLimitStore(async () => db, now);

    expect(await firstInstance.incr("submit:user-1", 60_000)).toBe(1);
    expect(await nextInstance.incr("submit:user-1", 60_000)).toBe(2);
  });

  it("increments atomically when requests arrive together", async () => {
    const store = new DatabaseRateLimitStore(
      async () => db,
      () => new Date("2026-10-30T10:00:00.000Z"),
    );

    const counts = await Promise.all(
      Array.from({ length: 12 }, () => store.incr("vote:user-1", 60_000)),
    );

    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("starts a fresh counter when the window expires", async () => {
    let currentTime = new Date("2026-10-30T10:00:00.000Z");
    const store = new DatabaseRateLimitStore(async () => db, () => currentTime);

    expect(await store.incr("search:ip-1", 60_000)).toBe(1);
    expect(await store.incr("search:ip-1", 60_000)).toBe(2);

    currentTime = new Date("2026-10-30T10:01:00.000Z");
    expect(await store.incr("search:ip-1", 60_000)).toBe(1);
    expect(await store.incr("search:ip-1", 60_000)).toBe(2);
  });
});
