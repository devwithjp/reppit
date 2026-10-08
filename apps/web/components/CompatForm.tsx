"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "copilot", "windsurf", "other"];
export function CompatForm({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [err, setErr] = useState<string | null>(null); const router = useRouter();
  if (!signedIn) return null;
  return (
    <form className="inline" onSubmit={async (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const res = await fetch(`/api/items/by-slug/${slug}/compat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent: fd.get("agent"), status: fd.get("status"), note: fd.get("note") }) });
      if (!res.ok) { setErr((await res.json()).error ?? "Failed"); return; }
      (e.target as HTMLFormElement).reset(); router.refresh();
    }}>
      <select name="agent" defaultValue="claude-code">{AGENTS.map((a) => <option key={a}>{a}</option>)}</select>
      <select name="status" defaultValue="works"><option value="works">works</option><option value="broken">broken</option></select>
      <input name="note" placeholder="optional note" />
      <button>Report</button>
      {err && <span style={{ color: "var(--down)" }}>{err}</span>}
    </form>
  );
}
