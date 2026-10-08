import { eq, and, sql } from "drizzle-orm";
import { items, votes, users, type Db } from "@gitit/db";
import { voteWeight, weightedScore, hotScore } from "./ranking";

export type DownvoteReason = "unmaintained" | "insecure" | "broken-on-agent" | "misleading" | "low-quality";
export const DOWNVOTE_REASONS: DownvoteReason[] = ["unmaintained", "insecure", "broken-on-agent", "misleading", "low-quality"];

export class VoteError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

/**
 * Cast, change, or remove (direction=null) a vote, then recompute the item's denormalised scores.
 * Downvotes require a reason (DECISIONS.md).
 */
export async function castVote(db: Db, userId: string, itemId: string, direction: "up" | "down" | null, reason?: DownvoteReason | null) {
  if (direction === "down" && !reason) throw new VoteError("Downvotes require a reason tag.");
  if (direction === "down" && !DOWNVOTE_REASONS.includes(reason!)) throw new VoteError("Unknown reason tag.");

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new VoteError("User not found.", 404);
  const [item] = await db.select({ id: items.id, createdAt: items.createdAt }).from(items).where(eq(items.id, itemId));
  if (!item) throw new VoteError("Item not found.", 404);

  if (direction === null) {
    await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.itemId, itemId)));
  } else {
    const weight = voteWeight(user);
    await db.insert(votes)
      .values({ userId, itemId, direction, reason: direction === "down" ? reason : null, weight })
      .onConflictDoUpdate({ target: [votes.userId, votes.itemId], set: { direction, reason: direction === "down" ? reason : null, weight, createdAt: new Date() } });
  }
  return recomputeItemScores(db, itemId, item.createdAt);
}

export async function recomputeItemScores(db: Db, itemId: string, createdAt?: Date) {
  const rows = await db.select({ direction: votes.direction, weight: votes.weight, createdAt: votes.createdAt }).from(votes).where(eq(votes.itemId, itemId));
  const up = rows.filter((r) => r.direction === "up").length;
  const down = rows.length - up;
  const ws = weightedScore(rows);
  let created = createdAt;
  if (!created) {
    const [i] = await db.select({ createdAt: items.createdAt }).from(items).where(eq(items.id, itemId));
    created = i?.createdAt ?? new Date();
  }
  const hot = hotScore(ws, created);
  await db.update(items).set({ upvotes: up, downvotes: down, weightedScore: ws, hotScore: hot, updatedAt: new Date() }).where(eq(items.id, itemId));
  return { upvotes: up, downvotes: down, weightedScore: ws, hotScore: hot };
}

export async function bumpCommentCount(db: Db, itemId: string, delta: number) {
  await db.update(items).set({ commentCount: sql`${items.commentCount} + ${delta}` }).where(eq(items.id, itemId));
}
