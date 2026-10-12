"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REASONS, REASON_LABEL } from "./labels";
import { UpTriangle, DownTriangle } from "./icons";

type Dir = "up" | "down" | null;

/**
 * The only place on the item page where you can vote. Upvote is one click. A downvote is two steps:
 * the five reasons sit before the submit button, and the submit button sends nothing until one is
 * picked. The constraint is in the interface, not in a validation message after the fact.
 */
export function VoteComposer({
  slug, href, mine: initialMine, mineReason, signedIn, cold,
}: { slug: string; href: string; mine: Dir; mineReason: string | null; signedIn: boolean; cold: boolean }) {
  const router = useRouter();
  const [mine, setMine] = useState<Dir>(initialMine);
  const [reason, setReason] = useState<string | null>(initialMine === "down" ? mineReason : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [done, setDone] = useState<string | null>(null);
  const firstReason = useRef<HTMLInputElement>(null);
  const loginHref = `/login?next=${encodeURIComponent(href)}`;

  useEffect(() => { setMine(initialMine); }, [initialMine]);

  const needSignIn = () => setError(<>Sign in to vote. <Link className="inline-link" href={loginHref} data-testid="sign-in-link">Sign in</Link></>);

  async function send(direction: Dir) {
    setError(null); setDone(null);
    if (!signedIn) { needSignIn(); return; }
    if (direction === "down" && !reason) {
      setError("Pick a reason before you downvote.");
      firstReason.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/items/by-slug/${slug}/vote`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(direction === "down" ? { direction, reason } : { direction }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) { needSignIn(); return; }
      if (!res.ok) { setError(j.error ?? "Vote not saved. Try again."); return; }
      setMine(direction);
      if (direction !== "down") setReason(null);
      setDone(direction === "up" ? "Recorded: works as described." : direction === "down" ? `Recorded: ${REASON_LABEL[reason!]}.` : "Vote withdrawn.");
      router.refresh();
    } catch {
      setError("Vote not saved. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  function startDownvote() {
    setError(null); setDone(null);
    if (!signedIn) { needSignIn(); return; }
    (document.querySelector<HTMLInputElement>(`#vote input[name="reason"]:checked`) ?? firstReason.current)?.focus();
  }

  return (
    <div className="composer" id="vote">
      <div className="composer-h">{cold ? "Be the first to vote" : "Vote on this repo"}</div>
      <div className="composer-b">
        <button type="button" className={`btn btn-block${mine === "up" ? " is-on" : ""}`} data-testid="vote-up"
          aria-pressed={mine === "up"} disabled={busy} onClick={() => send(mine === "up" ? null : "up")}>
          <span className="tri-steel"><UpTriangle w={15} h={15} /></span> {mine === "up" ? "You said it works. Withdraw" : "It works as described"}
        </button>
        <button type="button" className="required as-btn" id="reason-hd" data-testid="vote-down" onClick={startDownvote}>
          <DownTriangle w={13} h={13} /> Something wrong? Pick a reason.
        </button>
        <div className="pick" role="radiogroup" aria-labelledby="reason-hd">
          {REASONS.map((r, i) => (
            <label key={r}>
              <input ref={i === 0 ? firstReason : undefined} type="radio" name="reason" value={r} checked={reason === r}
                disabled={busy} onChange={() => { setReason(r); setError(null); }} data-testid="reason-option" data-reason={r} />
              {REASON_LABEL[r]}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-block" data-testid="vote-submit"
          aria-disabled={!reason} disabled={busy} onClick={() => send("down")}>
          {mine === "down" && reason === mineReason ? "Downvote recorded" : reason ? `Submit downvote: ${REASON_LABEL[reason]}` : "Submit downvote"}
        </button>
        {mine === "down" && (
          <button type="button" className="linkish" disabled={busy} onClick={() => send(null)}>Withdraw my downvote</button>
        )}
        <p className="vote-msg" role="alert" data-testid="vote-error" hidden={!error}>{error}</p>
        <p className="vote-ok" role="status" hidden={!done}>{done}</p>
        {cold && (
          <p className="meta" style={{ margin: "10px 0 0" }}>Used it with a coding agent? Add an agent report in the
            Agent compatibility section.</p>
        )}
      </div>
    </div>
  );
}
