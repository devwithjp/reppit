import { SIGNAL_ORDER, type SignalCell, type CellState } from "./score";
import { AGENT_LABEL, REASON_LABEL, CORE_AGENTS } from "./labels";
import type { Compat } from "@/app/_data/items";

const STATE_WORD: Record<CellState, string> = { good: "holds", slipping: "slipping", failing: "failing", unknown: "unknown", not_applicable: "not applicable" };
const STATE_CLASS: Record<CellState, string> = { good: "ok", slipping: "mid", failing: "bad", unknown: "unk", not_applicable: "na" };

/** The six-cell signal strip. Grey cells are unknown, never a pass. */
export function Strip({ cells, className }: { cells: SignalCell[]; className?: string }) {
  const label = cells.map((c) => `${c.short} ${STATE_WORD[c.state]}`).join(", ");
  return (
    <div className={`strip${className ? ` ${className}` : ""}`} data-testid="signal-strip" role="img" aria-label={`Signals: ${label}`}>
      {cells.map((c) => <i key={c.key} className={STATE_CLASS[c.state]} title={`${c.short}: ${c.label}`} />)}
    </div>
  );
}

const CAP_REASONS = new Set(["archived", "deprecated", "stale"]);

/**
 * Why a score is null, in words. Core says "too little measured"; any other null reason it adds later is
 * shown as it is. Cap reasons never reach here, because a capped item still has a number.
 */
export function nullReason(reason: string | undefined): string {
  return reason && !CAP_REASONS.has(reason) ? reason : "too little measured";
}

/** Why a number was capped, when the flags beside the name do not already say it. */
export function capNote(score: number | null, reason: string | undefined): string | null {
  return score !== null && reason === "stale" ? "no push in over a year" : null;
}

export function CapNote({ score, reason }: { score: number | null; reason?: string }) {
  const n = capNote(score, reason);
  return n ? <span className="capnote" data-testid="cap-note">{n}</span> : null;
}

/** The score, or its null reason in words. Never a zero standing in for unknown. */
export function ScoreNum({ score, reason, short = false }: { score: number | null; reason?: string; short?: boolean }) {
  if (score !== null) return <span data-testid="trust-score">{score}</span>;
  const words = nullReason(reason);
  return short
    ? <span className="nd" data-testid="trust-score" title={words}>n/a<span className="sr-only">: {words}</span></span>
    : <span className="nd" data-testid="trust-score">{words}</span>;
}

/** What the number rests on: "3 of 6 measured". */
export function Measured({ measured, applicable, className = "meas" }: { measured: number; applicable: number; className?: string }) {
  return <span className={className} data-testid="measured">{measured} of {applicable} measured</span>;
}

/** Key above the list: taught once, not repeated per row. */
export function StripKey() {
  return (
    <div className="stripkey">
      <div className="strip" aria-hidden="true"><i className="ok" /><i className="ok" /><i className="ok" /><i className="mid" /><i className="bad" /><i className="unk" /></div>
      <b>=</b> {SIGNAL_ORDER.map((s) => s.short).join(" \u00b7 ")}.
      <span>Green holds, amber slipping, red failing, grey unknown, outline not applicable.</span>
    </div>
  );
}

/** "Reasons given:" band. Upvotes read as "works as described"; downvotes by their reason. */
export function ReasonLine({ upvotes, reasons }: { upvotes: number; reasons: Record<string, number> }) {
  const down = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (upvotes === 0 && down.length === 0) return null;
  return (
    <div className="reasons"><span className="lead">Reasons given:</span>
      {upvotes > 0 && <span className="tag pos"><span className="n">{upvotes}</span> works as described</span>}
      {down.map(([r, n]) => <span key={r} className="tag"><span className="n">{n}</span> {REASON_LABEL[r] ?? r}</span>)}
    </div>
  );
}

export function agentState(c: { works: number; broken: number }): "y" | "n" | "q" {
  return c.works > c.broken ? "y" : c.broken > c.works ? "n" : "q";
}
const MARK = { y: "✓", n: "✗", q: "?" };

export function AgentChip({ agent, c, count = true }: { agent: string; c: { works: number; broken: number }; count?: boolean }) {
  const s = agentState(c);
  const word = s === "y" ? "works" : s === "n" ? "breaks" : "unclear";
  return (
    <span className={`ag ${s}`} title={`${AGENT_LABEL[agent] ?? agent}: ${c.works} works, ${c.broken} broken`}>
      <span className="m" aria-hidden="true">{MARK[s]}</span><b>{AGENT_LABEL[agent] ?? agent}</b>
      {count && <> {c.works + c.broken}</>}
      <span className="sr-only">, {word}</span>
    </span>
  );
}

export function AgentLine({ compat }: { compat: Compat }) {
  const entries = Object.entries(compat).sort((a, b) => {
    const ia = CORE_AGENTS.indexOf(a[0]); const ib = CORE_AGENTS.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  if (entries.length === 0) return null;
  return (
    <div className="agents"><span className="lead">Agents:</span>
      {entries.map(([a, c]) => <AgentChip key={a} agent={a} c={c} />)}
    </div>
  );
}

/** Stand-in for both bands when nobody has said anything yet. One line, not two empty ones. */
export function NoOpinions({ votes, reports }: { votes: boolean; reports: boolean }) {
  if (votes && reports) return null;
  const text = !votes && !reports ? "No votes yet; agent reports start at launch. Trust is computed from the repo alone." :
    !votes ? "No votes yet." : "Agent reports start at launch.";
  return <p className="quiet">{text}</p>;
}
