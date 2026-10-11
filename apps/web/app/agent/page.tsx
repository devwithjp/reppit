import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { search, type SearchResult } from "@gitit/core";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { embedder } from "@/lib/services";
import { Masthead } from "@/components/Masthead";
import { ReppitInstall } from "@/components/ReppitInstall";
import { nullReason } from "@/components/marks";
import { band } from "@/components/trust";
import { trustScore, signalCells, type SignalCell } from "@/components/score";
import { REASON_LABEL, MCP_INSTALL, CLI_EXAMPLE, REPPIT_PUBLISHED, installCommand } from "@/components/labels";
import { rowColumns, loadExtras, indexCounts, type RowItem } from "../_data/items";

export const metadata: Metadata = { title: "In your agent" };
export const dynamic = "force-dynamic";

const QUERY = "extract tables from pdf";
const C = { ok: "c-steel", mid: "c-amber", bad: "c-rust" } as const;

const CC = { good: "c-steel", slipping: "c-amber", failing: "c-rust", unknown: "c-faint", not_applicable: "c-faint" } as const;

function TermStrip({ cells }: { cells: SignalCell[] }) {
  return <>{cells.map((s) => <span key={s.key} className={CC[s.state]}>{"▆"}</span>)}</>;
}

/**
 * The terminal screen from the design, filled with live output for one fixed query,
 * so what it shows is what the search tool would return today.
 */
export default async function AgentPage() {
  const viewer = await getViewer();
  const d = await db();
  let results: SearchResult[] = [];
  try { results = (await search(d, embedder(), QUERY, { limit: 3 })).results; } catch { results = []; }
  const ids = results.map((r) => r.item.id);
  const [rows, extras, counts] = await Promise.all([
    ids.length ? d.select(rowColumns).from(items).where(inArray(items.id, ids)) : Promise.resolve([] as RowItem[]),
    loadExtras(d, ids, null),
    indexCounts(d),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pad = Math.max(24, ...results.map((r) => r.item.slug.length)) + 4;

  return (
    <div className="term-page">
      <Masthead viewer={viewer} current="agent" next="/agent" />
      <div className="term-shell">
        <h1 className="term-h1">In your agent</h1>
        <p className="term-lede">Most people will meet reppit as a few lines of context their agent read before it installed
          something. {REPPIT_PUBLISHED ? "Add the MCP server once:" : ""}</p>
        <div className="term-install"><ReppitInstall command={MCP_INSTALL} /></div>
        {REPPIT_PUBLISHED && (
          <>
            <p className="term-lede">No MCP? The same search from any shell:</p>
            <div className="term-install"><ReppitInstall command={CLI_EXAMPLE} /></div>
          </>
        )}

        <h2 className="term-h2">What each tool can do</h2>
        <ul className="tools">
          <li><code>search_repos</code><span>Reads only. Searches the index by problem and returns scores, reasons and agent reports.</span></li>
          <li><code>get_repo</code><span>Reads only. Returns one entry&rsquo;s signals, votes and agent reports.</span></li>
          <li><code>vote</code><span>Acts as you, with your personal token. The server tells the agent to use it only when you ask.</span></li>
          <li><code>report_compat</code><span>Acts as you, with your personal token. The server tells the agent to file a report only after you confirm how a run went.</span></li>
          <li><code>install_skill</code><span>Returns an install command. It never runs it.</span></li>
        </ul>
        <p className="term-lede">Without a personal token the server can only read. You create and revoke the token on your account page.</p>
        <p className="term-lede">Below is what <code>search_repos</code> returns for one query, from today&rsquo;s index.</p>

        <div className="tbar" aria-hidden="true"><i className="on" /><i /><i /> ~/work/invoice-parser &nbsp;&mdash;&nbsp; claude</div>
        <pre className="term" aria-label={`Search results for ${QUERY}`}>
<span className="c-steel">&gt;</span> <span className="c-w">parse the tables out of these pdf invoices</span>{"\n\n"}
<span className="c-dim">{"⏺"}</span> I need a PDF table library. Checking reppit before I add one.{"\n\n"}
<span className="c-dim">{"⏺"}</span> <span className="c-b">reppit</span> <span className="c-dim">- search_repos</span><span className="c-faint">(problem: &quot;{QUERY}&quot;)</span>{"\n"}
{"  "}<span className="c-faint">{"⎿"}</span>  <span className="c-dim">{results.length} results &middot; ranked by match, votes and maintenance &middot; {counts.total.toLocaleString("en-US")} indexed</span>{"\n"}
{results.length === 0 && <>{"\n     "}<span className="c-dim">no results: the index did not answer</span>{"\n"}</>}
{results.map((r) => {
  const row = byId.get(r.item.id);
  if (!row) return null;
  const ts = trustScore(row);
  const score = ts.score;
  const cells = signalCells(row);
  const reasons = Object.entries(extras.reasons.get(row.id) ?? {});
  const compat = Object.entries(extras.compat.get(row.id) ?? {});
  const facts = cells.filter((s) => s.key === "push" || s.key === "release" || s.key === "advisories" || s.state === "failing");
  return (
    <span key={row.id}>{"\n     "}<span className="c-b">{row.slug.padEnd(pad)}</span><span className={score === null ? "c-faint" : C[band(score)]}>{score === null ? `trust: ${nullReason(ts.reason)}` : `trust ${String(score).padStart(2)}`}</span>  <TermStrip cells={cells} />  <span className="c-faint">{ts.measured} of {ts.applicable} measured</span>{"\n"}
{"     "}<span className="c-dim">{"│"}</span> {facts.map((s, i) => <span key={s.key}>{i > 0 && " · "}<span className={CC[s.state] === "c-steel" ? undefined : CC[s.state]}>{s.label}</span></span>)}{"\n"}
{"     "}<span className="c-dim">{"│"}</span> {row.upvotes + row.downvotes === 0
      ? <span className="c-faint">no votes yet</span>
      : <>{row.upvotes > 0 && <span className="c-steel">{"▲"} {row.upvotes} works as described   </span>}{reasons.map(([k, n]) => <span key={k} className="c-rust">{"▼"} {n} {REASON_LABEL[k] ?? k}   </span>)}</>}{"\n"}
{"     "}<span className="c-dim">{"│"}</span> agents  {compat.length === 0
      ? <span className="c-faint">no reports yet</span>
      : compat.map(([a, c]) => <span key={a}><span className={c.works > c.broken ? "c-steel" : c.broken > c.works ? "c-rust" : "c-dim"}>{c.works > c.broken ? "✓" : c.broken > c.works ? "✗" : "?"}</span> {a} {c.works + c.broken}   </span>)}{"\n"}
{"     "}<span className="c-dim">{"│"}</span> <span className="c-faint">{installCommand(row)}</span>{"\n"}
    </span>
  );
})}
{"\n"}<span className="c-steel">&gt;</span> <span className="cursor"> </span>
</pre>
        <p className="note"><b>This is a first-class screen, not an export.</b> The reason tags and the per-agent counts have to
          survive being rendered in eighty columns of monospace, because that is where most people will read them.</p>
      </div>
    </div>
  );
}
