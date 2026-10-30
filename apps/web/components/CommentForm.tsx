"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginHref } from "@/lib/navigation";

export function CommentForm({ slug, href, parentId, signedIn, onDone }: { slug: string; href: string; parentId?: string; signedIn: boolean; onDone?: () => void }) {
  const [body, setBody] = useState(""); const [err, setErr] = useState<string | null>(null); const router = useRouter();
  if (!signedIn) return <div className="comment-composer signed-out" data-testid="comment-composer"><Link className="inline-link" href={loginHref(href, "#comments")}>Sign in to comment.</Link></div>;
  return (
    <form className="comment-composer" data-testid="comment-composer" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      const res = await fetch(`/api/items/by-slug/${slug}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, parentId }) });
      if (!res.ok) { setErr((await res.json()).error ?? "Failed"); return; }
      setBody(""); onDone?.(); router.refresh();
    }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={parentId ? 2 : 3} minLength={2} maxLength={5000}
        placeholder={parentId ? "Write a reply" : "What happened when you used it? Share setup notes, tradeoffs, or an alternative."} />
      <div className="comment-submit"><button className="btn btn-primary" disabled={body.trim().length < 2}>{parentId ? "Reply" : "Add comment"}</button></div>
      {err && <span className="vote-msg" role="alert">{err}</span>}
    </form>
  );
}
