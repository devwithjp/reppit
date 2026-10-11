import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { ItemRow } from "@/components/ItemRow";
import { StripKey } from "@/components/marks";
import { REASON_LABEL, KIND_LABEL } from "@/components/labels";
import { rowColumns, loadExtras, recentReasons, mcpCount, type RowItem } from "../_data/items";

const PAGE = 30;
const SORTS = [
  { key: "hot", label: "Hot" },
  { key: "top", label: "Top" },
  { key: "new", label: "New" },
] as const;
type Sort = (typeof SORTS)[number]["key"];
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

export async function Feed({ viewer, sort: rawSort, kind: rawKind, page: rawPage }: { viewer: Viewer | null; sort?: string; kind?: string; page?: string }) {
  const sort: Sort = SORTS.some((s) => s.key === rawSort) ? (rawSort as Sort) : "hot";
  const kind = rawKind === "repo" || rawKind === "skill" || rawKind === "mcp" ? rawKind : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(rawPage ?? "1", 10) || 1));

  const d = await db();
  const where: SQL[] = [];
  if (kind) where.push(eq(items.kind, kind));
  const filter = where.length ? and(...where) : undefined;

  const order = sort === "top" ? [desc(items.weightedScore), desc(items.stars)] : sort === "new" ? [desc(items.createdAt)] : [desc(items.hotScore), desc(items.stars)];
  const [rows, [{ n }]] = await Promise.all([
    d.select(rowColumns).from(items).where(filter).orderBy(...order).limit(PAGE).offset((page - 1) * PAGE) as Promise<RowItem[]>,
    d.select({ n: sql<number>`count(*)::int` }).from(items).where(filter),
  ]);
  const total = Number(n);

  const [extras, reasons, mcps] = await Promise.all([loadExtras(d, rows.map((r) => r.id), viewer?.id ?? null), recentReasons(d, 30), mcpCount(d)]);
  // Hide the MCP tab while the index has none, unless someone is already on it (keep the URL working).
  const kinds = KINDS.filter((k) => k.key !== "mcp" || mcps > 0 || kind === "mcp");
  const from = (page - 1) * PAGE;
  const hereHref = href(sort, kind, page);
  const noun = kind ? KIND_LABEL[kind] : "repos and skills";

  return (
    <>
      <Masthead viewer={viewer} current="browse" next={hereHref} />
      <div className="statement"><div className="wrap statement-in">
        <b>Ranked by whether it still works.</b>
        <span>No human sets the score: it is six measurements of the repo itself. Votes adjust it by at most &plusmn;12,
          lose half their weight every six months, and every downvote names a reason.</span>
      </div></div>

      <main className="wrap" id="main">
        <h1 className="sr-only">Browse {noun}</h1>
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

        <StripKey />

        {reasons.length > 0 && (
          <div className="legend">
            <span className="lbl">Reasons given, last 30 days</span>
            {reasons.map((r) => <span key={r.reason} className="tag"><span className="n">{r.n}</span> {REASON_LABEL[r.reason] ?? r.reason}</span>)}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="nothing">
            <h3>{page > 1 ? "Nothing on this page." : kind === "mcp" ? "No MCP servers indexed yet." : `No ${noun} indexed yet.`}</h3>
            <p>{page > 1
              ? <>The list ends earlier than that. <Link className="inline-link" href={href(sort, kind)}>Back to the first page</Link>.</>
              : <>When one is submitted it shows up here, measured from its own record. <Link className="inline-link" href="/submit">Submit one</Link>.</>}</p>
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
      </main>
      <Footer />
    </>
  );
}
