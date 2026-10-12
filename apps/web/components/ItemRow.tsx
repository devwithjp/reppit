import Link from "next/link";
import type { RowItem, RowExtras } from "@/app/_data/items";
import { flags, ago } from "./trust";
import { trustScore, signalCells, type SignalCell } from "./score";
import { itemHref, splitSlug, cleanWhy } from "./labels";
import { Install } from "./Install";
import { Strip, ScoreNum, Measured, CapNote, ReasonLine, AgentLine } from "./marks";
import { RailVote } from "./RailVote";

/** The trust block on the right of a row: TRUST label, score, strip, last push. */
export function TrustBlock({ score, reason, measured, applicable, cells, pushedAt }: {
  score: number | null; reason?: string; measured: number; applicable: number; cells: SignalCell[]; pushedAt: Date | null;
}) {
  return (
    <div className="trust">
      <div className="hd">Trust</div>
      <div className={`n${score === null ? " is-nd" : ""}`}><ScoreNum score={score} reason={reason} />{score !== null && <s>/100</s>}</div>
      <CapNote score={score} reason={reason} />
      <Measured measured={measured} applicable={applicable} />
      <Strip cells={cells} />
      <div className="cap">{pushedAt ? `pushed ${ago(pushedAt)}` : "push date unknown"}</div>
    </div>
  );
}

/** The search-result fact line: known signals as observed (failing ones in rust), unknown ones named once. */
function BreakLine({ cells, license }: { cells: SignalCell[]; license: string | null }) {
  // Two signals can read the same ("publishes no package" for deprecated and advisories): say it once.
  const seen = new Set<string>();
  const known = cells.filter((c) => c.state !== "unknown" && !(c.key === "archived" && c.state === "good"))
    .filter((c) => !seen.has(c.label) && !!seen.add(c.label));
  const unknown = cells.filter((c) => c.state === "unknown").map((c) => c.short);
  const parts: React.ReactNode[] = known.map((c) => (c.state === "failing" ? <s key={c.key}>{c.label}</s> : <span key={c.key}>{c.label}</span>));
  if (license && license !== "NOASSERTION") parts.push(<span key="lic">{license}</span>);
  if (unknown.length) parts.push(<span key="unk" className="unk-t">unknown: {unknown.join(", ")}</span>);
  if (!cells.some((c) => c.state === "failing")) parts.push(<b key="ok">nothing failing</b>);
  return (
    <p className="break">
      {parts.map((p, i) => <span key={i}>{i > 0 && <span aria-hidden="true">{"\u00a0\u00b7\u00a0 "}</span>}{p}</span>)}
    </p>
  );
}

export function ItemRow({
  item, extras, signedIn, rank, why, variant = "feed",
}: {
  item: RowItem; extras: RowExtras; signedIn: boolean; rank?: number; why?: string; variant?: "feed" | "search";
}) {
  const ts = trustScore(item);
  const score = ts.score;
  const cells = signalCells(item);
  const fl = flags(item);
  const { owner, name } = splitSlug(item.slug);
  const reasons = extras.reasons.get(item.id) ?? {};
  const compat = extras.compat.get(item.id) ?? {};
  const hasVotes = item.upvotes + item.downvotes > 0;
  const href = itemHref(item.slug);
  const testid = variant === "search" ? "result" : "feed-row";

  return (
    <article className="row" data-testid={testid} data-slug={item.slug}>
      {rank !== undefined && <div className="rank num" aria-hidden="true">{String(rank).padStart(2, "0")}</div>}
      <RailVote slug={item.slug} href={href} net={item.upvotes - item.downvotes} hasVotes={hasVotes}
        mine={extras.mine.get(item.id) ?? null} signedIn={signedIn} />
      <div className="body">
        <h2 className="ttl">
          <Link className="repo" href={href}><span className="ow">{owner}</span>{name}</Link>
          {item.kind !== "repo" && <span className="tag plain">{item.kind === "skill" ? "skill" : "MCP"}</span>}
          {item.language && <span className="tag plain">{item.language}</span>}
          {item.license && item.license !== "NOASSERTION" && <span className="tag plain">{item.license}</span>}
          {fl.map((f) => <span key={f.label} className={`flag${f.warn ? " warn" : ""}`}>{f.label}</span>)}
        </h2>
        {variant === "search" && (cleanWhy(why, item.kind) ?? item.description) ? (
          <p className="matched" data-testid="result-why">{cleanWhy(why, item.kind) ?? item.description}</p>
        ) : item.description ? (
          <p className="desc">{item.description}</p>
        ) : (
          <p className="desc quiet-desc">No description on the repo.</p>
        )}
        {variant === "search" && <BreakLine cells={cells} license={item.license} />}
        <ReasonLine upvotes={item.upvotes} reasons={reasons} />
        <AgentLine compat={compat} />
        {variant === "search" && <Install item={item} compact />}
      </div>
      <TrustBlock score={score} reason={ts.reason} measured={ts.measured} applicable={ts.applicable} cells={cells} pushedAt={item.pushedAt} />
    </article>
  );
}
