import { beforeEach, describe, expect, it } from "vitest";
import { createDb, users, type Db } from "@gitit/db";
import { eq } from "drizzle-orm";
import { ModerationError, setUserSuspended } from "../src/moderation";

let db: Db;
let operator: string;
let member: string;
let other: string;

beforeEach(async () => {
  db = await createDb({});
  const rows = await db.insert(users).values([
    { login: "operator", isDev: true },
    { login: "member" },
    { login: "other" },
  ]).returning({ id: users.id });
  [operator, member, other] = rows.map((row) => row.id);
});

describe("account suspension", () => {
  it("lets only an operator suspend or restore another account", async () => {
    await expect(setUserSuspended(db, other, member, true)).rejects.toBeInstanceOf(ModerationError);
    await expect(setUserSuspended(db, operator, operator, true)).rejects.toMatchObject({ status: 400 });

    await setUserSuspended(db, operator, member, true);
    let [row] = await db.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, member));
    expect(row.suspendedAt).toBeInstanceOf(Date);

    await setUserSuspended(db, operator, member, false);
    [row] = await db.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, member));
    expect(row.suspendedAt).toBeNull();
  });
});
