import { and, eq, sql } from "drizzle-orm";
import { commentVotes, comments, items, users, type Db } from "@gitit/db";

export type CommentVoteDirection = "up" | "down" | null;

export class CommentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Create a top-level comment or a reply. Parent comments must belong to the same item. */
export async function createComment(db: Db, userId: string, itemId: string, rawBody: string, parentId?: string | null) {
  const body = rawBody.trim();
  if (body.length < 2 || body.length > 5000) throw new CommentError("Comment must be 2–5000 characters");
  const [[user], [item]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1),
  ]);
  if (!user) throw new CommentError("User not found", 404);
  if (!item) throw new CommentError("Item not found", 404);
  let parent: string | null = null;
  if (parentId) {
    const [row] = await db.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.id, parentId), eq(comments.itemId, itemId))).limit(1);
    if (!row) throw new CommentError("Parent is not a comment on this item");
    parent = row.id;
  }
  const [created] = await db.insert(comments).values({ itemId, userId, body, parentId: parent }).returning();
  await db.update(items).set({ commentCount: sql`${items.commentCount} + 1` }).where(eq(items.id, itemId));
  return created;
}

/** Cast, change, or withdraw one user's vote on a comment, then refresh its denormalised score. */
export async function voteComment(db: Db, userId: string, commentId: string, direction: CommentVoteDirection) {
  const [[user], [comment]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ id: comments.id }).from(comments).where(and(eq(comments.id, commentId), eq(comments.deleted, false))).limit(1),
  ]);
  if (!user) throw new CommentError("User not found", 404);
  if (!comment) throw new CommentError("Comment not found", 404);
  if (direction === null) {
    await db.delete(commentVotes).where(and(eq(commentVotes.userId, userId), eq(commentVotes.commentId, commentId)));
  } else {
    await db.insert(commentVotes).values({ userId, commentId, direction })
      .onConflictDoUpdate({ target: [commentVotes.userId, commentVotes.commentId], set: { direction, createdAt: new Date() } });
  }
  await db.update(comments).set({
    upvotes: sql`(select count(*)::int from ${commentVotes} where ${commentVotes.commentId} = ${commentId} and ${commentVotes.direction} = 'up')`,
    downvotes: sql`(select count(*)::int from ${commentVotes} where ${commentVotes.commentId} = ${commentId} and ${commentVotes.direction} = 'down')`,
  }).where(eq(comments.id, commentId));
  const [score] = await db.select({ upvotes: comments.upvotes, downvotes: comments.downvotes }).from(comments).where(eq(comments.id, commentId));
  return { ...score, score: score.upvotes - score.downvotes };
}

/** Delete a comment's public body. Replies remain attached to a visible placeholder. */
export async function deleteComment(db: Db, userId: string, commentId: string, operator = false) {
  const [comment] = await db.select({ id: comments.id, userId: comments.userId, itemId: comments.itemId, deleted: comments.deleted })
    .from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) throw new CommentError("Comment not found", 404);
  if (!operator && comment.userId !== userId) throw new CommentError("You can only delete your own comment", 403);
  if (comment.deleted) return { ok: true };
  await db.update(comments).set({ deleted: true, body: "", upvotes: 0, downvotes: 0 }).where(eq(comments.id, commentId));
  await db.update(items).set({ commentCount: sql`greatest(${items.commentCount} - 1, 0)` }).where(eq(items.id, comment.itemId));
  return { ok: true };
}
