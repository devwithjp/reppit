import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommentThread, type DiscussionComment } from "./CommentThread";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./icons", () => ({ UpTriangle: () => null, DownTriangle: () => null }));

const comment = (overrides: Partial<DiscussionComment> = {}): DiscussionComment => ({
  id: "comment-1",
  userId: "user-1",
  parentId: null,
  body: "Useful setup note.",
  login: "reader",
  createdAt: "2026-10-30T00:00:00.000Z",
  upvotes: 2,
  downvotes: 0,
  deleted: false,
  mine: null,
  canDelete: false,
  canModerate: false,
  authorSuspended: false,
  ...overrides,
});

const renderThread = (initial: DiscussionComment[]) => renderToStaticMarkup(
  <CommentThread initial={initial} slug="owner/repo" href="/r/owner/repo" signedIn={false} />,
);

describe("CommentThread", () => {
  it("hides a deleted leaf and shows the empty discussion state", () => {
    const html = renderThread([comment({ deleted: true, body: "" })]);

    expect(html).not.toContain("Comment deleted.");
    expect(html).not.toContain("[deleted]");
    expect(html).toContain("No comments yet.");
  });

  it("hides a deleted branch when it has no visible replies", () => {
    const html = renderThread([
      comment({ id: "parent", deleted: true, body: "" }),
      comment({ id: "child", parentId: "parent", deleted: true, body: "" }),
    ]);

    expect(html).not.toContain("Comment deleted.");
    expect(html).toContain("No comments yet.");
  });

  it("keeps a deleted parent as a placeholder when a visible reply remains", () => {
    const html = renderThread([
      comment({ id: "parent", deleted: true, body: "" }),
      comment({ id: "reply", parentId: "parent", body: "The workaround still helps." }),
    ]);

    expect(html).toContain("Comment deleted. Replies remain.");
    expect(html).toContain("The workaround still helps.");
    expect(html).toContain("1 comment");
    expect(html).not.toContain("No comments yet.");
  });
});
