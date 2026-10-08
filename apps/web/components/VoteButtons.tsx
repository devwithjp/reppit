"use client";
import { useState } from "react";

const REASONS = ["unmaintained", "insecure", "broken-on-agent", "misleading", "low-quality"] as const;

export function VoteButtons({ slug, upvotes, downvotes, mine, signedIn }: { slug: string; upvotes: number; downvotes: number; mine: "up" | "down" | null; signedIn: boolean }) {
  const [state, setState] = useState({ up: upvotes, down: downvotes, mine });
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(direction: "up" | "down" | null, reason?: string) {
    if (!signedIn) { setError("Sign in to vote"); return; }
    setBusy(true); setError(null);
    const res = await fetch(`/api/items/by-slug/${slug}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction, reason }) });
    const j = await res.json();
    setBusy(false); setAsking(false);
    if (!res.ok) { setError(j.error ?? "Failed"); return; }
    setState({ up: j.upvotes, down: j.downvotes, mine: direction });
  }

  return (
    <div className="vote">
      <button className={`up ${state.mine === "up" ? "on" : ""}`} disabled={busy} onClick={() => send(state.mine === "up" ? null : "up")} title="Upvote">▲</button>
      <span className="n score">{state.up - state.down}</span>
      <button className={`down ${state.mine === "down" ? "on" : ""}`} disabled={busy} onClick={() => (state.mine === "down" ? send(null) : setAsking(true))} title="Downvote (needs a reason)">▼</button>
      {asking && (
        <select autoFocus defaultValue="" onChange={(e) => e.target.value && send("down", e.target.value)} onBlur={() => setAsking(false)} style={{ width: 150, marginTop: 4, fontSize: 12 }}>
          <option value="" disabled>why?</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {error && <small style={{ color: "var(--down)", textAlign: "center" }}>{error}</small>}
    </div>
  );
}
