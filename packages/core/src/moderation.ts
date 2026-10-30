import { eq } from "drizzle-orm";
import { users, type Db } from "@gitit/db";

export class ModerationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Suspend or restore an account. This is the single authority check for account moderation. */
export async function setUserSuspended(db: Db, operatorId: string, targetId: string, suspended: boolean) {
  if (operatorId === targetId) throw new ModerationError("Operators cannot suspend their own account");
  const [[operator], [target]] = await Promise.all([
    db.select({ isDev: users.isDev }).from(users).where(eq(users.id, operatorId)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1),
  ]);
  if (!operator?.isDev) throw new ModerationError("Operator access required", 403);
  if (!target) throw new ModerationError("User not found", 404);
  const suspendedAt = suspended ? new Date() : null;
  await db.update(users).set({ suspendedAt }).where(eq(users.id, targetId));
  return { ok: true, suspended: Boolean(suspendedAt) };
}
