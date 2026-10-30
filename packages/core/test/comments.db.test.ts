import { beforeAll, describe, expect, it } from "vitest";
import { commentVotes, comments, createDb, items, users, type Db } from "@gitit/db";
import { and, eq } from "drizzle-orm";
import { CommentError, createComment, deleteComment, voteComment } from "../src/comments";

let db: Db;
let itemA: string;
let itemB: string;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createDb({});
  const people = await db.insert(users).values([{ login: "comment-alice" }, { login: "comment-bob" }]).returning();
  alice = people[0].id;
  bob = people[1].id;
  const rows = await db.insert(items).values([
    { kind: "repo", slug: "comments/one", owner: "comments", name: "one", url: "https://example.com/one" },
    { kind: "repo", slug: "comments/two", owner: "comments", name: "two", url: "https://example.com/two" },
  ]).returning({ id: items.id });
  itemA = rows[0].id;
  itemB = rows[1].id;
});

describe("item discussion", () => {
  it("creates comments and only accepts replies from the same item", async () => {
    const top = await createComment(db, alice, itemA, "This worked after one config change.");
    const reply = await createComment(db, bob, itemA, "Which config change?", top.id);
    expect(reply.parentId).toBe(top.id);
    await expect(createComment(db, bob, itemB, "Wrong thread", top.id)).rejects.toBeInstanceOf(CommentError);
  });

  it("keeps one comment vote per user and supports changing or withdrawing it", async () => {
    const comment = await createComment(db, alice, itemA, "The README misses a required system package.");
    expect(await voteComment(db, bob, comment.id, "up")).toEqual({ upvotes: 1, downvotes: 0, score: 1 });
    expect(await voteComment(db, bob, comment.id, "down")).toEqual({ upvotes: 0, downvotes: 1, score: -1 });
    expect(await voteComment(db, bob, comment.id, null)).toEqual({ upvotes: 0, downvotes: 0, score: 0 });
    const rows = await db.select().from(commentVotes).where(and(eq(commentVotes.commentId, comment.id), eq(commentVotes.userId, bob)));
    expect(rows).toHaveLength(0);
  });

  it("lets the author delete while keeping a placeholder for replies", async () => {
    const parent = await createComment(db, alice, itemA, "Original body");
    await createComment(db, bob, itemA, "A reply that should remain", parent.id);
    await expect(deleteComment(db, bob, parent.id)).rejects.toMatchObject({ status: 403 });
    await deleteComment(db, alice, parent.id);
    const [row] = await db.select().from(comments).where(eq(comments.id, parent.id));
    expect(row.deleted).toBe(true);
    expect(row.body).toBe("");
  });
});
