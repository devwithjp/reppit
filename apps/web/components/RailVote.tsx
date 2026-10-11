"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UpTriangle, DownTriangle } from "./icons";

/**
 * The vote rail on a list row. Upvoting happens in place. A downvote needs a reason, so the down
 * arrow takes you to the item page's composer: the constraint lives in the interface.
 */
export function RailVote({
  slug, href, net, hasVotes, mine, signedIn,
}: { slug: string; href: string; net: number; hasVotes: boolean; mine: "up" | "down" | null; signedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState({ net, hasVotes, mine });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function up() {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(href)}`); return; }
    setBusy(true); setError(null);
    const direction = state.mine === "up" ? null : "up";
    try {
      const res = await fetch(`/api/items/by-slug/${slug}/vote`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction }),
      });
      const j = (await res.json().catch(() => ({}))) as { upvotes?: number; downvotes?: number; error?: string };
      if (!res.ok) { setError(j.error ?? "Vote not saved."); return; }
      const u = j.upvotes ?? 0; const d = j.downvotes ?? 0;
      setState({ net: u - d, hasVotes: u + d > 0, mine: direction });
    } catch {
      setError("Vote not saved. Check your connection.");
    } finally { setBusy(false); }
  }

  const neg = state.net < 0;
  return (
    <div className="rail">
      <button type="button" className="up" aria-label={state.mine === "up" ? "Remove upvote" : "Upvote: works as described"}
        aria-pressed={state.mine === "up"} disabled={busy} onClick={up}><UpTriangle /></button>
      {state.hasVotes ? (
        <span className={`score num${neg ? " neg" : ""}`}>{neg ? `−${Math.abs(state.net)}` : state.net.toLocaleString("en-US")}</span>
      ) : (
        <span className="score num none" aria-label="no votes yet">&mdash;</span>
      )}
      <span className="unit">votes</span>
      <Link className={`down${state.mine === "down" ? " on" : ""}`} href={`${href}#vote`}
        aria-label={state.mine === "down" ? "You downvoted this. Change it on the item page" : "Downvote, reason required"}>
        <DownTriangle />
      </Link>
      {error && <span className="rail-err" role="alert">{error}</span>}
    </div>
  );
}
