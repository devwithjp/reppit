import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { HeaderSearch } from "@/components/SearchForms";

export default function NotFound() {
  return (
    <>
      <Masthead viewer={null} variant="bare" />
      <main className="wrap" id="main">
        <div className="state">
          <p className="lbl">404</p>
          <h1 data-testid="not-found">Nothing at this address.</h1>
          <p>Either it was never indexed or the link is wrong. A repo that is not here has not been scored, which is not the
            same as a bad score.</p>
          <div className="state-search"><HeaderSearch /></div>
          <p className="state-links">
            <Link className="inline-link" href="/?sort=trusted">Browse the directory</Link>
            <Link className="inline-link" href="/submit">Submit a repo</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
