"use client";
import "./globals.css";

/** Last-resort boundary for a failure in the root layout itself. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body>
      <main className="wrap">
        <div className="state" role="alert">
          <p className="lbl">Error</p>
          <h1>reppit failed to load.</h1>
          <p>Something on our side broke. Try again in a moment.</p>
          <p className="state-links"><button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button></p>
        </div>
      </main>
    </body></html>
  );
}
