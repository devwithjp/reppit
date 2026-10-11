import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { search, type SearchResult } from "@gitit/core";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { embedder } from "@/lib/services";
import { explainWithClaude } from "@/lib/explain";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { QuerySearch } from "@/components/SearchForms";
import { ItemRow } from "@/components/ItemRow";
import { StripKey } from "@/components/marks";
import { trustScore } from "@/components/score";
import { rowColumns, loadExtras, indexCounts, type RowItem } from "../_data/items";

export const dynamic = "force-dynamic";

const EXAMPLES = ["pull tables out of a pdf in python", "transcribe audio locally", "end-to-end browser tests", "structured logging in go"];
const KINDS = [
  { key: "", label: "All" },
  { key: "repo", label: "Repos" },
  { key: "skill", label: "Skills" },
  { key: "mcp", label: "MCP servers" },
] as const;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `${q.slice(0, 60)}` : "Search by problem" };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; sort?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 300);
  const kind = sp.kind === "repo" || sp.kind === "skill" || sp.kind === "mcp" ? sp.kind : "";
  const sort = sp.sort === "trust" ? "trust" : "relevance";
  const viewer = await getViewer();
  const d = await db();
  const counts = await indexCounts(d);

  let results: SearchResult[] = [];
  let failed = false;
  if (q.length >= 3) {
    try {
      // One search across every kind, so the tabs can show honest counts; the tab then filters.
      results = await search(d, embedder(), q, { limit: 30 });
    } catch (e) {
      console.error("[search] failed:", (e as Error).message);
      failed = true;
    }
  }
  const byKind = { repo: 0, skill: 0, mcp: 0 } as Record<string, number>;
  for (const r of results) byKind[r.item.kind] = (byKind[r.item.kind] ?? 0) + 1;
  let shown = kind ? results.filter((r) => r.item.kind === kind) : results;
  shown = shown.slice(0, 10);
  shown = await explainWithClaude(q, shown);

  // The search result carries a subset of columns; fetch the full row data the trust score needs.
  const ids = shown.map((r) => r.item.id);
  const rows = ids.length ? await d.select(rowColumns).from(items).where(inArray(items.id, ids)) : [];
  const byId = new Map<string, RowItem>(rows.map((r) => [r.id, r]));
  let ordered = shown.filter((r) => byId.has(r.item.id));
  // Trust sort: items without enough data to score go last, in relevance order.
  if (sort === "trust") ordered = [...ordered].sort((a, b) => (trustScore(byId.get(b.item.id)!).score ?? -1) - (trustScore(byId.get(a.item.id)!).score ?? -1));
  const extras = await loadExtras(d, ids, viewer?.id ?? null);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ q, ...(kind ? { kind } : {}), ...(sort !== "relevance" ? { sort } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/search?${p}`;
  };
  const here = q ? qs({}) : "/search";

  return (
    <>
      <Masthead viewer={viewer} current="browse" variant="search" next={here} />
      <div className="query"><div className="wrap query-in">
        <h1 className="sr-only">{q ? `Results for ${q}` : "Search by problem"}</h1>
        <QuerySearch q={q} kind={kind || undefined} />
        <div className="parsed">
          {q.length >= 3 && !failed ? (
            <>
              <span>Ranked by match, votes, maintenance and popularity.</span>
              <span className="parsed-r">{counts.total.toLocaleString("en-US")} indexed &middot; {results.length} close matches</span>
            </>
          ) : (
            <>
              <span>Try</span>
              {EXAMPLES.map((e) => <Link key={e} className="chip" href={`/search?q=${encodeURIComponent(e)}`}>{e}</Link>)}
            </>
          )}
        </div>
      </div></div>

      <main className="wrap" id="main">
        {q.length < 3 ? (
          <div className="nothing" style={{ marginTop: 20 }}>
            <h3>{q.length === 0 ? "Describe what you are trying to do." : "That is too short to search on."}</h3>
            <p>Three characters at least. Write the problem the way you would say it to a colleague, not a package name:
              &ldquo;parse invoices out of PDFs&rdquo; finds more than &ldquo;pdf&rdquo;.</p>
          </div>
        ) : failed ? (
          <div className="nothing" style={{ marginTop: 20 }} role="alert">
            <h3>Search is not answering right now.</h3>
            <p>The index did not respond. Nothing is wrong with your query. Try again in a minute, or{" "}
              <Link className="inline-link" href="/?sort=top">browse the directory</Link> meanwhile.</p>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <nav className="tabs" aria-label="Kind">
                {KINDS.map((k) => (
                  <Link key={k.key} href={qs({ kind: k.key })} {...(kind === k.key ? { "aria-current": "page" as const } : {})}>
                    {k.label} <span className="tab-n">{k.key ? byKind[k.key] ?? 0 : results.length}</span>
                  </Link>
                ))}
              </nav>
              <div className="sorts" aria-label="Sort">
                <span className="lbl">Sort</span>
                <Link href={qs({ sort: "" })} {...(sort === "relevance" ? { "aria-current": "true" as const } : {})}>Relevance</Link>
                <Link href={qs({ sort: "trust" })} {...(sort === "trust" ? { "aria-current": "true" as const } : {})}>Trust</Link>
              </div>
            </div>

            <StripKey />

            {ordered.length === 0 ? (
              <div className="nothing">
                <h3>{results.length === 0 ? "Nothing indexed matches that yet." : `No ${KINDS.find((k) => k.key === kind)?.label.toLowerCase()} match that.`}</h3>
                <p>{results.length === 0
                  ? <>The index has {counts.total.toLocaleString("en-US")} entries and none of them is close. Try different words, or{" "}
                      <Link className="inline-link" href="/submit">submit the repo you end up using</Link> so the next person finds it.</>
                  : <><Link className="inline-link" href={qs({ kind: "" })}>Show all {results.length} matches</Link> instead.</>}</p>
              </div>
            ) : (
              <div className="list">
                {ordered.map((r) => (
                  <ItemRow key={r.item.id} item={byId.get(r.item.id)!} extras={extras} signedIn={!!viewer} variant="search" why={r.why} />
                ))}
              </div>
            )}

            <p className="meta" style={{ padding: "12px 0 0" }}>Nothing here is sponsored. Ranking and placement are separate systems
              and always will be. <Link className="inline-link" href="/trust">How the trust score is computed</Link></p>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
