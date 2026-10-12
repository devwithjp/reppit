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
          <h1 data-testid="not-found">Page not found.</h1>
          <p>The link may be wrong, or the repo hasn&rsquo;t been added yet.</p>
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
