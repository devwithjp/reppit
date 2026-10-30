"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ago } from "./trust";
import { UpTriangle, DownTriangle } from "./icons";
import { CommentForm } from "./CommentForm";
import { loginHref as buildLoginHref } from "@/lib/navigation";

export interface DiscussionComment {
  id: string;
  userId: string;
  parentId: string | null;
  body: string;
  login: string;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  deleted: boolean;
  mine: "up" | "down" | null;
  canDelete: boolean;
  canModerate: boolean;
  authorSuspended: boolean;
}

type Order = "best" | "new";

export function CommentThread({ initial, slug, href, signedIn }: {
  initial: DiscussionComment[]; slug: string; href: string; signedIn: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [order, setOrder] = useState<Order>("best");
  const [replying, setReplying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const children = useMemo(() => {
    const ids = new Set(rows.map((row) => row.id));
    const map = new Map<string | null, DiscussionComment[]>();
    for (const row of rows) {
      const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
      const group = map.get(parent) ?? [];
      group.push(row);
      map.set(parent, group);
    }
    const sort = (group: DiscussionComment[]) => group.sort((a, b) => order === "new"
      ? +new Date(b.createdAt) - +new Date(a.createdAt)
      : (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes) || +new Date(a.createdAt) - +new Date(b.createdAt));
    for (const group of map.values()) sort(group);
    return map;
  }, [rows, order]);

  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    const visiting = new Set<string>();
    const hasVisibleReply = (comment: DiscussionComment): boolean => {
      if (!comment.deleted) { visible.add(comment.id); return true; }
      if (visiting.has(comment.id)) return false;
      visiting.add(comment.id);
      const keep = (children.get(comment.id) ?? []).some(hasVisibleReply);
      visiting.delete(comment.id);
      if (keep) visible.add(comment.id);
      return keep;
    };
    for (const row of rows) hasVisibleReply(row);
    return visible;
  }, [children, rows]);

  const loginHref = buildLoginHref(href, "#comments");

  async function vote(comment: DiscussionComment, direction: "up" | "down") {
    if (!signedIn) { router.push(loginHref); return; }
    const next = comment.mine === direction ? null : direction;
    setBusy(comment.id); setError(null);
    try {
      const response = await fetch(`/api/comments/${comment.id}/vote`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: next }),
      });
      const body = await response.json().catch(() => ({})) as { upvotes?: number; downvotes?: number; error?: string };
      if (!response.ok) { setError(body.error ?? "Comment vote not saved."); return; }
      setRows((current) => current.map((row) => row.id === comment.id
        ? { ...row, upvotes: body.upvotes ?? 0, downvotes: body.downvotes ?? 0, mine: next }
        : row));
    } catch {
      setError("Comment vote not saved. Check your connection.");
    } finally { setBusy(null); }
  }

  async function remove(comment: DiscussionComment) {
    if (!window.confirm("Delete this comment? Replies will remain.")) return;
    setBusy(comment.id); setError(null);
    try {
      const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(body.error ?? "Comment not deleted."); return; }
      setRows((current) => current.map((row) => row.id === comment.id
        ? { ...row, body: "", deleted: true, upvotes: 0, downvotes: 0, mine: null }
        : row));
      router.refresh();
    } catch {
      setError("Comment not deleted. Check your connection.");
    } finally { setBusy(null); }
  }

  async function moderate(comment: DiscussionComment) {
    const suspended = !comment.authorSuspended;
    if (!window.confirm(`${suspended ? "Suspend" : "Restore"} @${comment.login}?`)) return;
    setBusy(comment.id); setError(null);
    try {
      const response = await fetch(`/api/admin/users/${comment.userId}/suspension`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ suspended }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(body.error ?? "Account moderation failed."); return; }
      setRows((current) => current.map((row) => row.userId === comment.userId ? { ...row, authorSuspended: suspended } : row));
    } catch { setError("Account moderation failed. Check your connection."); }
    finally { setBusy(null); }
  }

  function branch(parentId: string | null, depth = 0): React.ReactNode {
    return (children.get(parentId) ?? []).filter((comment) => visibleIds.has(comment.id)).map((comment) => {
      const score = comment.upvotes - comment.downvotes;
      const hasChildren = (children.get(comment.id) ?? []).some((child) => visibleIds.has(child.id));
      return (
        <article className={`comment${depth ? " is-reply" : ""}`} key={comment.id} data-testid="comment">
          <div className="comment-vote" aria-label={`Comment score ${score}`}>
            <button type="button" aria-label={comment.mine === "up" ? "Remove comment upvote" : "Upvote comment"}
              aria-pressed={comment.mine === "up"} disabled={busy === comment.id || comment.deleted} onClick={() => vote(comment, "up")}><UpTriangle w={14} h={14} /></button>
            <b>{score < 0 ? `−${-score}` : score}</b>
            <button type="button" aria-label={comment.mine === "down" ? "Remove comment downvote" : "Downvote comment"}
              aria-pressed={comment.mine === "down"} disabled={busy === comment.id || comment.deleted} onClick={() => vote(comment, "down")}><DownTriangle w={14} h={14} /></button>
          </div>
          <div className="comment-body">
            <div className="comment-meta">
              {comment.deleted ? <span>[deleted]</span> : <b>@{comment.login}</b>}
              <span>{ago(new Date(comment.createdAt))}</span>
            </div>
            {comment.deleted ? <p className="comment-deleted">Comment deleted.{hasChildren ? " Replies remain." : ""}</p> : <p>{comment.body}</p>}
            {!comment.deleted && (
              <div className="comment-actions">
                {signedIn
                  ? <button type="button" onClick={() => setReplying(replying === comment.id ? null : comment.id)}>reply</button>
                  : <Link href={loginHref}>sign in to reply</Link>}
                {comment.canDelete && <button type="button" disabled={busy === comment.id} onClick={() => remove(comment)}>delete</button>}
                {comment.canModerate && <button type="button" disabled={busy === comment.id} onClick={() => moderate(comment)}>{comment.authorSuspended ? "restore account" : "suspend account"}</button>}
              </div>
            )}
            {replying === comment.id && <CommentForm slug={slug} href={href} parentId={comment.id} signedIn={signedIn} onDone={() => setReplying(null)} />}
            {branch(comment.id, depth + 1)}
          </div>
        </article>
      );
    });
  }

  return (
    <>
      <div className="discussion-toolbar">
        <span>{rows.filter((row) => !row.deleted).length.toLocaleString("en-US")} {rows.filter((row) => !row.deleted).length === 1 ? "comment" : "comments"}</span>
        <label>Sort <select value={order} onChange={(event) => setOrder(event.target.value as Order)}><option value="best">Best</option><option value="new">New</option></select></label>
      </div>
      {error && <p className="vote-msg" role="alert">{error}</p>}
      {visibleIds.size ? <div className="comment-list">{branch(null)}</div> : (
        <div className="nothing"><h3>No comments yet.</h3><p>Share what happened when you used it, including setup problems or a better alternative.</p></div>
      )}
    </>
  );
}
