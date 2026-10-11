/** Shown while search runs (embedding + rerank can take a moment). Scoped here so other routes keep real 404 and redirect statuses. */
export default function Loading() {
  return (
    <>
      <header className="mast"><div className="wrap mast-in"><span className="logo"><i />reppit</span></div></header>
      <main className="wrap" id="main">
        <div className="loading" role="status" aria-live="polite">
          <span className="lbl">Loading</span>
          <div className="loading-rows" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </main>
    </>
  );
}
