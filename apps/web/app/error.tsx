"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Route-level error boundary. Plain about what happened; never shows a stack trace. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <>
      <header className="mast"><div className="wrap mast-in"><Link className="logo" href="/"><i />reppit</Link></div></header>
      <main className="wrap" id="main">
        <div className="state" role="alert">
          <p className="lbl">Error</p>
          <h1>This page failed to load.</h1>
          <p>Something on our side broke while building it. Nothing you did caused it, and nothing you submitted was lost
            unless the page said it was saved.</p>
          {error.digest && <p className="meta">Reference: {error.digest}</p>}
          <p className="state-links">
            <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
            <Link className="inline-link" href="/?sort=hot">Back to the directory</Link>
          </p>
        </div>
      </main>
    </>
  );
}
