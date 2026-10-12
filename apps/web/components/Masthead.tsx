import Link from "next/link";
import type { Viewer } from "@/lib/viewer";
import { signOut } from "@/app/auth/actions";
import { HeaderSearch } from "./SearchForms";

type Current = "browse" | "trust" | "agent" | null;

/**
 * The 46px bar. Primary navigation is deliberately three links: Browse, Trust score, In your agent.
 * Topic and language pages, API keys and sponsored slots are v2 and are not linked from here.
 */
export function Masthead({
  viewer, current = null, variant = "default", next = "/",
}: { viewer: Viewer | null; current?: Current; variant?: "default" | "landing" | "home" | "search" | "bare"; next?: string }) {
  const aria = (c: Current) => (current === c ? { "aria-current": "page" as const } : {});
  return (
    <header className="mast"><div className="wrap mast-in">
      <Link className="logo" href="/"><i />reppit</Link>
      <nav className="mast-nav" aria-label="Primary">
        <Link href="/?sort=trusted" {...aria("browse")}>Browse</Link>
        <Link href="/trust" {...aria("trust")}>Trust score</Link>
        <Link href="/agent" {...aria("agent")}>In your agent</Link>
      </nav>
      {variant !== "bare" && (
        <div className="mast-right">
          {variant === "default" && <HeaderSearch />}
          {variant === "landing" && !viewer && (
            <>
              <Link className="mast-link" href={`/login?next=${encodeURIComponent(next)}`} data-testid="sign-in-link">Sign in</Link>
              <Link className="btn btn-sm" href="/?sort=trusted">Open the directory</Link>
            </>
          )}
          {viewer ? (
            <>
              <Link className="mast-link who" href="/account" data-testid="viewer-handle">@{viewer.login}</Link>
              <form action={signOut} className="mast-out">
                <button className="btn btn-sm" type="submit" data-testid="sign-out-button">Sign out</button>
              </form>
            </>
          ) : variant !== "landing" ? (
            <Link className="btn btn-sm" href={`/login?next=${encodeURIComponent(next)}`} data-testid="sign-in-link">Sign in</Link>
          ) : null}
        </div>
      )}
    </div></header>
  );
}
