"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AGENTS, AGENT_LABEL } from "./labels";

/** Add an agent compatibility report. Posts to the compat endpoint; one report per agent per person. */
export function CompatForm({ slug, href, signedIn }: { slug: string; href: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <p className="meta" style={{ marginTop: 10 }}>
        Used it with a coding agent? <Link className="inline-link" href={`/login?next=${encodeURIComponent(`${href}#compat`)}`}>Sign in to add a report</Link>.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await fetch(`/api/items/by-slug/${slug}/compat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: fd.get("agent"), status: fd.get("status"), note: String(fd.get("note") ?? "").trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) { router.push(`/login?next=${encodeURIComponent(`${href}#compat`)}`); return; }
      if (!res.ok) { setError(j.error ?? "Report not saved. Try again."); return; }
      form.reset();
      setDone(`Saved. Your ${AGENT_LABEL[String(fd.get("agent"))] ?? "agent"} report replaces any earlier one.`);
      router.refresh();
    } catch {
      setError("Report not saved. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return (
    <form className="compat-form" onSubmit={onSubmit} data-testid="compat-form">
      <div className="compat-h">Add a report</div>
      <div className="compat-fields">
        <label className="fld"><span className="lbl">Agent</span>
          <select name="agent" defaultValue="claude-code" data-testid="compat-agent" required>
            {AGENTS.map((a) => <option key={a} value={a}>{AGENT_LABEL[a]}</option>)}
          </select>
        </label>
        <label className="fld"><span className="lbl">Result</span>
          <select name="status" defaultValue="works" data-testid="compat-status" required>
            <option value="works">works</option>
            <option value="broken">broken</option>
          </select>
        </label>
      </div>
      <label className="fld"><span className="lbl">What happened <span className="opt">optional, 500 characters</span></span>
        <textarea name="note" maxLength={500} rows={2} placeholder="e.g. fails at import: Ghostscript not on the sandbox image" />
      </label>
      <div className="compat-foot">
        <button type="submit" className="btn" disabled={busy} data-testid="compat-submit">{busy ? "Saving" : "Submit report"}</button>
        {error && <span className="vote-msg" role="alert">{error}</span>}
        {done && <span className="vote-ok" role="status">{done}</span>}
      </div>
    </form>
  );
}
