/**
 * The trust score: one number shown everywhere (web, API, MCP server, CLI). Pure, no I/O.
 *
 * Six signals, fixed order, points summing to 100:
 *
 *   1. push        25  pushed_at. Points: full to 30 days, linear to 0 at 730.
 *                      good <= 90 days, slipping <= 365, failing beyond. Null = unknown.
 *   2. release     15  last_release_at: the install package's newest stable registry release (deps.dev
 *                      publish times), else the GitHub release date. Points: full to 90 days, linear to 0 at 730.
 *                      good <= 180 days, slipping <= 365, failing beyond. Null = unknown (many projects
 *                      never cut GitHub releases, and the REST ingest path does not fetch them).
 *   3. archived    15  archived flag. Always known. Archived = 0, failing.
 *   4. deprecated  15  registry deprecation (npm deprecated, PyPI all yanked/Inactive, crates.io latest
 *                      yanked). Not applicable when the repo is confirmed to publish no package. Null = unknown
 *                      (no package found by a check that could not confirm absence, or not checked). Deprecated = 0, failing.
 *   5. advisories  15  OSV advisories on the latest published version (N/A as above). 0 = 15 good, 1 = 6 slipping,
 *                      2+ = 0 failing. Null = unknown, never shown as zero.
 *   6. issues      15  share of all-time issues still open: open / (open + closed). Stars-free on
 *                      purpose. Points 15 * (1 - share / 0.5). good <= 0.15, slipping <= 0.35, failing
 *                      beyond. Under 20 issues ever: good if <= 5 open, else slipping (too few to
 *                      judge a share). Null open or closed count = unknown.
 *
 * Licence is not scored: it says whether you may use a project, not whether it is maintained. It
 * stays a flag on the row (see the UI). Stars are not an input anywhere in this file.
 *
 * Score (on the fixed six-signal scale, max 100 points):
 *   - Measured cells earn their points. Unknown cells earn half (neutral).
 *   - Not applicable cells (a repo confirmed to publish no package: deprecation, advisories) also earn
 *     half, the same as unknown. Neither the earned total nor the maximum changes, so N/A can never
 *     lift a score above an otherwise-equal packaged repo: a package with a clean record (15) beats
 *     N/A (7.5), one advisory (6) loses to it by 1.5 only on that cell, and the packaged repo still
 *     earns 15 for "not deprecated" against N/A's 7.5. Net: packaged-with-one-advisory 21 vs N/A 15
 *     on those two cells. Removing N/A from both totals (rescaling to 100) was the earlier rule; it let
 *     a no-package app (79) outrank a packaged library with an advisory (72), so it is gone.
 *   - A number needs at least 3 measured signals (N/A and unknown do not count). Below that:
 *     `{ score: null, reason: "too little measured" }`, with the cells still listed as facts.
 *   - Archived or deprecated is decisive: capped at 25 (votes included), `reason` names it, and it
 *     shows even with fewer than 3 measured.
 *   - Stale: no push in 365+ days caps the score at 50, in 730+ days at 35 (votes included),
 *     `reason: "stale"`. A dead library stops reading like a pass.
 *   - Votes adjust by at most ±12: round(12 * tanh(weightedScore / 6)), where weightedScore is the
 *     time-decayed, reputation-weighted vote sum from ranking.ts. Caps apply after votes.
 *   - `measured` and `applicable` are always returned ("3 of 4 measured").
 */
import { weightedScore as computeWeightedScore, type VoteRow } from "./ranking";

export type SignalState = "good" | "slipping" | "failing" | "unknown" | "not_applicable";

/** `items.package_ecosystem` value recording a confirmed check that found no published package. */
export const NO_PACKAGE = "none";
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
  /** Stable releases of the install package in the past year (registry), when measured. */
  releasesLastYear?: number | null;
  weightedScore?: number | null;
}

export interface TrustScore {
  /** 0..100, or null when fewer than 3 signals are measured (and the item is not archived/deprecated). */
  score: number | null;
  /** Why the score is null ("not enough data") or capped ("archived" / "deprecated"). */
  reason?: "too little measured" | "archived" | "deprecated" | "stale";
  /** Signals-only score before the vote adjustment; null with score. */
  base: number | null;
  voteAdjust: number;
  unknownCount: number;
  /** Signals measured (not unknown, not N/A). UI: "{measured} of {applicable} measured". */
  measured: number;
  /** Signals that apply to this item (6, or 4 for a repo confirmed to publish no package). */
  applicable: number;
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
/** A number needs at least this many measured signals. */
export const MIN_MEASURED = 3;
/** Stale caps: [days since last push, maximum score]. */
export const STALE_CAPS: [number, number][] = [[730, 35], [365, 50]];
/**
 * @deprecated The rule is now "fewer than MIN_MEASURED measured → no number". With all six
 * applicable that is "more than 3 unknown". Kept for UI copy until it moves to MIN_MEASURED.
 */
export const MAX_UNKNOWN = 3;

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
  return { key, short, state, label, max, points: state === "unknown" || state === "not_applicable" ? max / 2 : Math.round(points ?? 0) };
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
    const cadence = typeof i.releasesLastYear === "number" ? `, ${i.releasesLastYear} in the past year` : "";
    out.push(cell("release", days <= 180 ? "good" : days <= 365 ? "slipping" : "failing", `last release ${ago(released, now)}${cadence}`, 15 * decay(days, 90, 730)));
  } else out.push(cell("release", "unknown", "no release data"));

  out.push(i.archived ? cell("archived", "failing", "archived by its owner", 0) : cell("archived", "good", "not archived", 15));

  const pkg = i.packageName ? `${i.packageName}${i.packageEcosystem ? ` on ${i.packageEcosystem}` : ""}` : null;
  const noPackage = i.packageEcosystem === NO_PACKAGE && i.deprecated !== true;
  if (noPackage) out.push(cell("deprecated", "not_applicable", "publishes no package"));
  else if (i.deprecated === true) out.push(cell("deprecated", "failing", `${pkg ?? "package"} is deprecated`, 0));
  else if (i.deprecated === false) out.push(cell("deprecated", "good", `${pkg ?? "package"} not deprecated`, 15));
  else out.push(cell("deprecated", "unknown", pkg ? "deprecation not checked yet" : "no published package found to check"));

  if (noPackage) out.push(cell("advisories", "not_applicable", "publishes no package"));
  else if (typeof i.advisoriesOpen === "number") {
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
  const applicable = cells.filter((c) => c.state !== "not_applicable").length;
  const unknownCount = cells.filter((c) => c.state === "unknown").length;
  const measured = applicable - unknownCount;
  const ws = Array.isArray(votes) ? computeWeightedScore(votes, now) : typeof votes === "number" ? votes : item.weightedScore ?? 0;
  const adj = voteAdjust(ws);
  // Fixed six-signal scale: TRUST_POINTS sum to 100, N/A and unknown cells carry their neutral half.
  const raw = Math.round(cells.reduce((a, c) => a + c.points, 0));
  const counts = { voteAdjust: adj, unknownCount, measured, applicable, cells };
  const flagged = item.archived ? "archived" : item.deprecated === true ? "deprecated" : null;
  if (flagged) {
    const base = Math.min(raw, FLAGGED_CAP);
    return { score: Math.max(0, Math.min(FLAGGED_CAP, base + adj)), reason: flagged, base, ...counts };
  }
  if (measured < MIN_MEASURED) return { score: null, reason: "too little measured", base: null, ...counts };
  const pushed = toDate(item.pushedAt);
  const days = pushed ? (now.getTime() - pushed.getTime()) / DAY : null;
  const cap = days === null ? null : STALE_CAPS.find(([d]) => days >= d)?.[1] ?? null;
  const score = Math.max(0, Math.min(100, raw + adj));
  if (cap !== null && score > cap) return { score: cap, reason: "stale", base: Math.min(raw, cap), ...counts };
  return { score, base: raw, ...counts };
}
