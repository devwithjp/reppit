import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { ItemRow } from "@/components/ItemRow";
import { REASON_LABEL, KIND_LABEL, REASONS, REASON_GLOSS } from "@/components/labels";
import { LandingSearch } from "@/components/SearchForms";
import { rowColumns, loadExtras, recentReasons, mcpCount, indexCounts, type RowItem } from "../_data/items";

const PAGE = 30;
// "Trusted" leads: with few votes, a vote-driven "hot" list is just popularity. "hot" stays a valid URL.
const SORTS = [
  { key: "trusted", label: "Trusted" },
  { key: "top", label: "Most voted" },
  { key: "new", label: "New" },
] as const;
type Sort = (typeof SORTS)[number]["key"] | "hot";
const KINDS = [
  { key: "", label: "All" },
  { key: "repo", label: "Repos" },
  { key: "skill", label: "Skills" },
  { key: "mcp", label: "MCP servers" },
] as const;

function href(sort: Sort, kind: string, page = 1) {
  const p = new URLSearchParams({ sort });
  if (kind) p.set("kind", kind);
  if (page > 1) p.set("page", String(page));
  return `/?${p}`;
}

/** Reddit's "about this community" card: what the ranking is, in numbers and the five reasons. */
function About({ repos, skills, signedIn }: { repos: number; skills: number; signedIn: boolean }) {
  return (
    <section className="about" aria-labelledby="about-h">
      <div className="about-b">
        <h2 id="about-h">About reppit</h2>
        <p>We score repos and agent skills from their own activity: pushes, releases, advisories and more. Votes can shift a score a little.</p>
        <div className="about-stats">
          <div><b>{repos.toLocaleString("en-US")}</b><span>repos</span></div>
          <div><b>{skills.toLocaleString("en-US")}</b><span>agent skills</span></div>
        </div>
        <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 13 }}>Every downvote names a reason</p>
        <ol>
          {REASONS.map((r) => <li key={r}><b>{REASON_LABEL[r]}</b><span>{REASON_GLOSS[r]}</span></li>)}
        </ol>
        {signedIn
          ? <Link className="btn btn-primary" href="/submit">Submit a repo</Link>
          : <Link className="btn btn-primary" href="/signup">Join to vote</Link>}
        <Link className="btn" href="/trust">How the score works</Link>
      </div>
    </section>
  );
}

export async function Feed({ viewer, sort: rawSort, kind: rawKind, page: rawPage, welcome = false }: { viewer: Viewer | null; sort?: string; kind?: string; page?: string; welcome?: boolean }) {
  const sort: Sort = SORTS.some((s) => s.key === rawSort) || rawSort === "hot" ? (rawSort as Sort) : "trusted";
  const kind = rawKind === "repo" || rawKind === "skill" || rawKind === "mcp" ? rawKind : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(rawPage ?? "1", 10) || 1));

  const d = await db();
  const where: SQL[] = [];
  if (kind) where.push(eq(items.kind, kind));
  const filter = where.length ? and(...where) : undefined;

  const order = sort === "top" ? [desc(items.weightedScore), desc(items.stars)]
    : sort === "new" ? [desc(items.createdAt)]
    : sort === "hot" ? [desc(items.hotScore), desc(items.stars)]
    : [sql`${items.trustScore} desc nulls last`, desc(items.weightedScore), desc(items.stars)];
  const [rows, [{ n }]] = await Promise.all([
    d.select(rowColumns).from(items).where(filter).orderBy(...order).limit(PAGE).offset((page - 1) * PAGE) as Promise<RowItem[]>,
    d.select({ n: sql<number>`count(*)::int` }).from(items).where(filter),
  ]);
  const total = Number(n);

  const [extras, reasons, mcps, counts] = await Promise.all([loadExtras(d, rows.map((r) => r.id), viewer?.id ?? null), recentReasons(d, 30), mcpCount(d), indexCounts(d)]);
  // Hide the MCP tab while the index has none, unless someone is already on it (keep the URL working).
  const kinds = KINDS.filter((k) => k.key !== "mcp" || mcps > 0 || kind === "mcp");
  const from = (page - 1) * PAGE;
  const hereHref = href(sort, kind, page);
  const noun = kind ? KIND_LABEL[kind] : "repos and skills";

  return (
    <>
      <Masthead viewer={viewer} current="browse" next={hereHref} variant={welcome ? "home" : "default"} />
      <main className="wrap home" id="main">
        <div className="home-main">
        {welcome ? (
          <section className="welcome">
            <h1>Stars say it was popular. reppit shows if it is still maintained.</h1>
            <p>Describe what you need. We'll show repos ranked by how well they're kept up, not by stars.</p>
            <LandingSearch />
            <p className="hint examples"><span>Try</span>
              {["pull tables out of a pdf in python", "state management for react", "http router for go"].map((q) => (
                <Link key={q} className="example" href={`/search?q=${encodeURIComponent(q)}`}>{q}</Link>
              ))}
            </p>
          </section>
        ) : <h1 className="sr-only">Browse {noun}</h1>}
        <div className="toolbar">
          <nav className="tabs" aria-label="Kind">
            {kinds.map((k) => (
              <Link key={k.key} href={href(sort, k.key)} {...(kind === k.key ? { "aria-current": "page" as const } : {})}>{k.label}</Link>
            ))}
          </nav>
          <div className="sorts" aria-label="Sort">
            <span className="lbl">Sort</span>
            {SORTS.map((s) => (
              <Link key={s.key} href={href(s.key, kind)} data-testid={`sort-${s.key}`}
                {...(sort === s.key ? { "aria-current": "true" as const } : {})}>{s.label}</Link>
            ))}
          </div>
        </div>

        {rows.length > 0 && reasons.length > 0 && (
          <div className="legend">
            <span className="lbl">Reasons given, last 30 days</span>
            {reasons.map((r) => <span key={r.reason} className="tag"><span className="n">{r.n}</span> {REASON_LABEL[r.reason] ?? r.reason}</span>)}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="nothing">
            <h3>{page > 1 ? "Nothing on this page." : kind === "mcp" ? "No MCP servers are indexed yet." : `No ${noun} indexed yet.`}</h3>
            <p>{page > 1
              ? <>The list ends before this page. <Link className="inline-link" href={href(sort, kind)}>Back to the first page</Link>.</>
              : kind === "mcp"
                ? <>None have been added yet.{" "}
                    <Link className="inline-link" href={href(sort, "")}>Back to the feed</Link>.</>
                : <>Submitted repos show up here. <Link className="inline-link" href="/submit">Submit one</Link>.</>}</p>
          </div>
        ) : (
          <div className="list">
            {rows.map((r, i) => (
              <ItemRow key={r.id} item={r} extras={extras} signedIn={!!viewer} rank={from + i + 1} />
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="pager">
            <p className="meta">Showing {from + 1}&ndash;{from + rows.length} of {total.toLocaleString("en-US")} {noun}.{" "}
              <Link className="inline-link" href="/search">Search by problem instead</Link></p>
            <div className="pager-links">
              {page > 1 && <Link className="btn btn-sm" href={href(sort, kind, page - 1)} rel="prev">Previous {PAGE}</Link>}
              {from + rows.length < total && <Link className="btn btn-sm" href={href(sort, kind, page + 1)} rel="next">Next {PAGE}</Link>}
            </div>
          </div>
        )}
        </div>
        <aside className="home-side">
          <About repos={counts.repo} skills={counts.skill} signedIn={!!viewer} />
        </aside>
      </main>
      <Footer />
    </>
  );
}
