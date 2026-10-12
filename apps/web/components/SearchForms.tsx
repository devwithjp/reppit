import { SearchIcon } from "./icons";
/**
 * The three problem-first search forms. Plain GET forms to /search, so they work before any JavaScript loads.
 * Each carries data-testid="search-input" / "search-submit"; only one is rendered per page.
 */

/** Small field in the masthead. The ">" prompt is the submit button. */
export function HeaderSearch() {
  return (
    <form className="searchbox" action="/search" method="get" role="search">
      <button type="submit" className="go" aria-label="Search" data-testid="search-submit"><SearchIcon /></button>
      <input type="search" name="q" placeholder="Describe what you need" aria-label="Search by problem"
        required minLength={3} data-testid="search-input" />
    </form>
  );
}

/** Large field on the landing fold. */
export function LandingSearch() {
  return (
    <form className="cta" action="/search" method="get" role="search">
      <span aria-hidden="true"><SearchIcon /></span>
      <input name="q" placeholder="pull tables out of a pdf in python" aria-label="Describe the problem"
        required minLength={3} data-testid="search-input" />
      <button type="submit" data-testid="search-submit">Search</button>
    </form>
  );
}

/** Query bar at the top of /search. */
export function QuerySearch({ q, kind }: { q: string; kind?: string }) {
  return (
    <form className="query-field" action="/search" method="get" role="search">
      <span aria-hidden="true"><SearchIcon /></span>
      <input name="q" defaultValue={q} placeholder="describe the problem, not the package" aria-label="Describe the problem"
        required minLength={3} autoFocus={!q} data-testid="search-input" />
      {kind && <input type="hidden" name="kind" value={kind} />}
      <button type="submit" data-testid="search-submit">Search</button>
    </form>
  );
}
