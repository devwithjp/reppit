/**
 * The trust score: one number shown everywhere (web, API, MCP server, CLI). Pure, no I/O.
 *
 * Six signals, fixed order, points summing to 100:
 *
 *   1. push        25  pushed_at. Points: full to 30 days, linear to 0 at 730.
 *                      good <= 90 days, slipping <= 365, failing beyond. Null = unknown.
 *   2. release     15  last_release_at. Points: full to 90 days, linear to 0 at 730.
 *                      good <= 180 days, slipping <= 365, failing beyond. Null = unknown (many projects
 *                      never cut GitHub releases, and the REST ingest path does not fetch them).
 *   3. archived    15  archived flag. Always known. Archived = 0, failing.
 *   4. deprecated  15  registry deprecation (npm deprecated, PyPI yanked/Inactive). Null = unknown
 *                      (no verified package, or not checked). Deprecated = 0, failing.
 *   5. advisories  15  OSV advisories on the latest published version. 0 = 15 good, 1 = 6 slipping,
 *                      2+ = 0 failing. Null = unknown, never shown as zero.
 *   6. issues      15  share of all-time issues still open: open / (open + closed). Stars-free on
 *                      purpose. Points 15 * (1 - share / 0.5). good <= 0.15, slipping <= 0.35, failing
 *                      beyond. Under 20 issues ever: good if <= 5 open, else slipping (too few to
 *                      judge a share). Null open or closed count = unknown.
 *
 * Licence is not scored: it says whether you may use a project, not whether it is maintained. It
 * stays a flag on the row (see the UI). Stars are not an input anywhere in this file.
 *
 * Score:
 *   - Unknown signals score half their points (neutral).
 *   - Archived or deprecated is decisive: the score is capped at 25 (votes included) and `reason`
 *     names it, even when other signals are unknown. Nobody needs four more measurements to know an
 *     archived project is unmaintained.
 *   - Otherwise, three or more unknown signals: no number, `{ score: null, reason: "not enough data" }`.
 *   - Votes adjust by at most ±12: round(12 * tanh(weightedScore / 6)), where weightedScore is the
 *     time-decayed, reputation-weighted vote sum from ranking.ts.
 */
import { weightedScore as computeWeightedScore, type VoteRow } from "./ranking";

export type SignalState = "good" | "slipping" | "failing" | "unknown";
export type SignalKey = "push" | "release" | "archived" | "deprecated" | "advisories" | "issues";

export interface SignalCell {
  key: SignalKey;
  /** Strip key word, e.g. "last push". */
  short: string;
  state: SignalState;
  /** One-line plain-language observation, e.g. "last push 7 months ago". */
  label: string;
  /** Points earned; unknown cells carry their neutral half here. */
  points: number;
  max: number;
}

type DateLike = Date | string | null | undefined;

/** Accepts DB rows and JSON from the API (dates as ISO strings). */
export interface TrustItem {
  pushedAt?: DateLike;
  lastReleaseAt?: DateLike;
  archived?: boolean | null;
  deprecated?: boolean | null;
  advisoriesOpen?: number | null;
  openIssues?: number | null;
  closedIssues?: number | null;
  packageName?: string | null;
  packageEcosystem?: string | null;
  weightedScore?: number | null;
}

export interface TrustScore {
  /** 0..100, or null when three or more signals are unknown. */
  score: number | null;
  /** Why the score is null ("not enough data") or capped ("archived" / "deprecated"). */
  reason?: "not enough data" | "archived" | "deprecated";
  /** Signals-only score before the vote adjustment; null with score. */
  base: number | null;
  voteAdjust: number;
  unknownCount: number;
  cells: SignalCell[];
}

export const TRUST_POINTS: Record<SignalKey, number> = { push: 25, release: 15, archived: 15, deprecated: 15, advisories: 15, issues: 15 };
export const SIGNAL_ORDER: { key: SignalKey; short: string }[] = [
  { key: "push", short: "last push" },
  { key: "release", short: "releases" },
  { key: "archived", short: "archived" },
  { key: "deprecated", short: "deprecated" },
  { key: "advisories", short: "advisories" },
  { key: "issues", short: "issue load" },
];
export const VOTE_ADJUST_MAX = 12;
export const FLAGGED_CAP = 25;
export const MAX_UNKNOWN = 2;

const DAY = 86_400_000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const decay = (days: number, full: number, zero: number) => clamp01(1 - (days - full) / (zero - full));
const toDate = (d: DateLike): Date | null => { if (!d) return null; const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : x; };

export function ago(d: Date, now: Date = new Date()): string {
  const days = Math.max(0, (now.getTime() - d.getTime()) / DAY);
  if (days < 1) { const h = Math.max(1, Math.round(days * 24)); return h === 1 ? "1 hour ago" : `${h} hours ago`; }
  if (days < 45) { const n = Math.round(days); return n === 1 ? "1 day ago" : `${n} days ago`; }
  if (days < 548) { const n = Math.round(days / 30.44); return n === 1 ? "1 month ago" : `${n} months ago`; }
  const y = Math.round(days / 365.25);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

function cell(key: SignalKey, state: SignalState, label: string, points?: number): SignalCell {
  const max = TRUST_POINTS[key];
  const short = SIGNAL_ORDER.find((s) => s.key === key)!.short;
  return { key, short, state, label, max, points: state === "unknown" ? max / 2 : Math.round(points ?? 0) };
}

/** The six cells in fixed strip order. */
export function signalCells(i: TrustItem, now: Date = new Date()): SignalCell[] {
  const out: SignalCell[] = [];

  const pushed = toDate(i.pushedAt);
  if (pushed) {
    const days = (now.getTime() - pushed.getTime()) / DAY;
    out.push(cell("push", days <= 90 ? "good" : days <= 365 ? "slipping" : "failing", `last push ${ago(pushed, now)}`, 25 * decay(days, 30, 730)));
  } else out.push(cell("push", "unknown", "no push date recorded"));

  const released = toDate(i.lastReleaseAt);
  if (released) {
    const days = (now.getTime() - released.getTime()) / DAY;
    out.push(cell("release", days <= 180 ? "good" : days <= 365 ? "slipping" : "failing", `last release ${ago(released, now)}`, 15 * decay(days, 90, 730)));
  } else out.push(cell("release", "unknown", "no release data"));

  out.push(i.archived ? cell("archived", "failing", "archived by its owner", 0) : cell("archived", "good", "not archived", 15));

  const pkg = i.packageName ? `${i.packageName}${i.packageEcosystem ? ` on ${i.packageEcosystem}` : ""}` : null;
  if (i.deprecated === true) out.push(cell("deprecated", "failing", `${pkg ?? "package"} is deprecated`, 0));
  else if (i.deprecated === false) out.push(cell("deprecated", "good", `${pkg ?? "package"} not deprecated`, 15));
  else out.push(cell("deprecated", "unknown", pkg ? "deprecation not checked yet" : "no published package found to check"));

  if (typeof i.advisoriesOpen === "number") {
    const n = i.advisoriesOpen;
    out.push(cell("advisories", n === 0 ? "good" : n === 1 ? "slipping" : "failing",
      n === 0 ? `no open advisories on the latest ${pkg ?? "release"}` : `${n} open advisor${n === 1 ? "y" : "ies"} on the latest ${pkg ?? "release"}`,
      n === 0 ? 15 : n === 1 ? 6 : 0));
  } else out.push(cell("advisories", "unknown", pkg ? "advisories not checked yet" : "no published package found to check"));

  const open = i.openIssues, closed = i.closedIssues;
  if (typeof open === "number" && typeof closed === "number") {
    const total = open + closed;
    const share = total > 0 ? open / total : 0;
    const label = `${open.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} issues still open`;
    if (total < 20) out.push(cell("issues", open <= 5 ? "good" : "slipping", label, open <= 5 ? 15 : 7.5));
    else out.push(cell("issues", share <= 0.15 ? "good" : share <= 0.35 ? "slipping" : "failing", label, 15 * clamp01(1 - share / 0.5)));
  } else out.push(cell("issues", "unknown", "issue counts not measured"));

  return out;
}

export function voteAdjust(weightedScore: number): number {
  const v = Math.round(VOTE_ADJUST_MAX * Math.tanh((Number.isFinite(weightedScore) ? weightedScore : 0) / 6));
  return v === 0 ? 0 : v; // normalise -0
}

/**
 * Trust score for an item. `votes` may be the item's vote rows (decayed here) or a precomputed
 * weighted score; omitted, the item's own `weightedScore` is used.
 */
export function trustScore(item: TrustItem, votes?: VoteRow[] | number, now: Date = new Date()): TrustScore {
  const cells = signalCells(item, now);
  const unknownCount = cells.filter((c) => c.state === "unknown").length;
  const ws = Array.isArray(votes) ? computeWeightedScore(votes, now) : typeof votes === "number" ? votes : item.weightedScore ?? 0;
  const adj = voteAdjust(ws);
  const flagged = item.archived ? "archived" : item.deprecated === true ? "deprecated" : null;
  if (flagged) {
    // Known fatal signal beats unknowns. Votes cannot lift it past the cap.
    const base = Math.min(Math.round(cells.reduce((a, c) => a + c.points, 0)), FLAGGED_CAP);
    return { score: Math.max(0, Math.min(FLAGGED_CAP, base + adj)), reason: flagged, base, voteAdjust: adj, unknownCount, cells };
  }
  if (unknownCount > MAX_UNKNOWN) return { score: null, reason: "not enough data", base: null, voteAdjust: adj, unknownCount, cells };
  const base = Math.round(cells.reduce((a, c) => a + c.points, 0));
  return { score: Math.max(0, Math.min(100, base + adj)), base, voteAdjust: adj, unknownCount, cells };
}
