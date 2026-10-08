"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommentForm({ slug, parentId, signedIn }: { slug: string; parentId?: string; signedIn: boolean }) {
  const [body, setBody] = useState(""); const [err, setErr] = useState<string | null>(null); const router = useRouter();
  if (!signedIn) return <p className="muted">Sign in to comment.</p>;
  return (
    <form className="inline" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      const res = await fetch(`/api/items/by-slug/${slug}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, parentId }) });
      if (!res.ok) { setErr((await res.json()).error ?? "Failed"); return; }
      setBody(""); router.refresh();
    }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={parentId ? "Reply…" : "What did you find using this? Gotchas, alternatives, agent quirks…"} style={{ flexBasis: "100%" }} />
      <button className="primary">{parentId ? "Reply" : "Comment"}</button>
      {err && <span style={{ color: "var(--down)" }}>{err}</span>}
    </form>
  );
}
