import { SIGNAL_ORDER, type SignalCell, type CellState } from "./score";
import { AGENT_LABEL, REASON_LABEL, CORE_AGENTS } from "./labels";
import type { Compat } from "@/app/_data/items";

const STATE_WORD: Record<CellState, string> = { good: "holds", slipping: "slipping", failing: "failing", unknown: "unknown" };
const STATE_CLASS: Record<CellState, string> = { good: "ok", slipping: "mid", failing: "bad", unknown: "unk" };

/** The six-cell signal strip. Grey cells are unknown, never a pass. */
export function Strip({ cells, className }: { cells: SignalCell[]; className?: string }) {
  const label = cells.map((c) => `${c.short} ${STATE_WORD[c.state]}`).join(", ");
  return (
    <div className={`strip${className ? ` ${className}` : ""}`} data-testid="signal-strip" role="img" aria-label={`Signals: ${label}`}>
      {cells.map((c) => <i key={c.key} className={STATE_CLASS[c.state]} title={`${c.short}: ${c.label}`} />)}
    </div>
  );
}

/** The score, or the words "not enough data". Never a zero standing in for unknown. */
export function ScoreNum({ score, short = false }: { score: number | null; short?: boolean }) {
  return score === null
    ? short
      ? <span className="nd" data-testid="trust-score" title="not enough data">n/a<span className="sr-only">: not enough data</span></span>
      : <span className="nd" data-testid="trust-score">not enough data</span>
    : <span data-testid="trust-score">{score}</span>;
}

/** Key above the list: taught once, not repeated per row. */
export function StripKey() {
  return (
    <div className="stripkey">
      <div className="strip" aria-hidden="true"><i className="ok" /><i className="ok" /><i className="ok" /><i className="mid" /><i className="bad" /><i className="unk" /></div>
      <b>=</b> {SIGNAL_ORDER.map((s) => s.short).join(" \u00b7 ")}.
      <span>Blue holds, amber slipping, rust failing, grey unknown.</span>
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
  const text = !votes && !reports ? "No votes or agent reports yet. Trust is computed from the repo alone." :
    !votes ? "No votes yet." : "No agent reports yet.";
  return <p className="quiet">{text}</p>;
}
