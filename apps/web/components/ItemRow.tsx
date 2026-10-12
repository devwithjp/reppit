import Link from "next/link";
import type { RowItem, RowExtras } from "@/app/_data/items";
import { flags, ago } from "./trust";
import { trustScore, signalCells, type SignalCell } from "./score";
import { itemHref, displaySlug, cleanWhy, cleanDesc } from "./labels";
import { Install } from "./Install";
import { Strip, ScoreNum, Measured, CapNote, ReasonLine, AgentLine } from "./marks";
import { RailVote } from "./RailVote";

/** The trust block on the right of a row: TRUST label, score, strip, last push. */
export function TrustBlock({ score, reason, measured, applicable, cells, pushedAt, compact = false }: {
  score: number | null; reason?: string; measured: number; applicable: number; cells: SignalCell[]; pushedAt: Date | null; compact?: boolean;
}) {
  const pushed = pushedAt ? `pushed ${ago(pushedAt)}` : "push date unknown";
  if (compact) {
    return (
      <Link className="trust compact" href="/trust" title={`${measured} of ${applicable} signals measured \u00b7 ${pushed}. How the score works.`}>
        <div className="hd">Trust</div>
        <div className={`n${score === null ? " is-nd" : ""}`}><ScoreNum score={score} reason={reason} />{score !== null && <s>/100</s>}</div>
        <Strip cells={cells} />
      </Link>
    );
  }
  return (
    <div className="trust">
      <div className="hd">Trust</div>
      <div className={`n${score === null ? " is-nd" : ""}`}><ScoreNum score={score} reason={reason} />{score !== null && <s>/100</s>}</div>
      <CapNote score={score} reason={reason} />
      <Measured measured={measured} applicable={applicable} />
      <Strip cells={cells} />
      <div className="cap">{pushed}</div>
    </div>
  );
}

/** The search-result fact line: known signals as observed (failing ones in rust), unknown ones named once. */
function BreakLine({ cells, license, brief = false }: { cells: SignalCell[]; license: string | null; brief?: boolean }) {
  // Two signals can read the same ("publishes no package" for deprecated and advisories): say it once.
  const seen = new Set<string>();
  const known = cells.filter((c) => c.state !== "unknown" && !(c.key === "archived" && c.state === "good"))
    .filter((c) => !seen.has(c.label) && !!seen.add(c.label));
  const unknown = cells.filter((c) => c.state === "unknown").map((c) => c.short);
  if (brief) {
    const lead = [...known].sort((a, b) => Number(b.state === "failing") - Number(a.state === "failing")).slice(0, 3);
    if (!lead.length) return <p className="break brief">Too little is known about this one yet.</p>;
    return (
      <p className="break brief">
        {lead.map((c, i) => <span key={c.key}>{i > 0 && <span aria-hidden="true">{"\u00a0\u00b7\u00a0 "}</span>}{c.state === "failing" ? <s>{c.label}</s> : c.label}</span>)}
      </p>
    );
  }
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
  const { owner, name } = displaySlug(item.slug, item.kind);
  const description = cleanDesc(item.description);
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
        {variant === "search" && (cleanWhy(why, item.kind) ?? description) ? (
          <p className="matched" data-testid="result-why">{cleanWhy(why, item.kind) ?? description}</p>
        ) : description ? (
          <p className="desc">{description}</p>
        ) : (
          <p className="desc quiet-desc">No description on the repo.</p>
        )}
        <BreakLine cells={cells} license={item.license} brief={variant === "feed"} />
        <ReasonLine upvotes={item.upvotes} reasons={reasons} />
        <AgentLine compat={compat} />
        {variant === "search" && <Install item={item} compact />}
      </div>
      <TrustBlock score={score} reason={ts.reason} measured={ts.measured} applicable={ts.applicable} cells={cells} pushedAt={item.pushedAt} compact={variant === "feed"} />
    </article>
  );
}
