/**
 * Display helpers around the trust score. The score and the six signal cells themselves come from
 * @gitit/core via ./score; nothing here changes a number, it only words and flags them.
 *
 * Flags are hard facts, never opinions:
 *   archived            archived flag set
 *   deprecated          registry marks the latest release deprecated
 *   N advisories        advisories_open > 0 (unchecked is never shown)
 *   inactive / slowing  last push over 365 days / over 180 days (not shown when archived)
 *   no licence          repo with no licence detected (licence is not scored; it is whether you may use it)
 *   licence unclear     licence file present but no SPDX id (NOASSERTION)
 */

const DAY = 86_400_000;

export interface FlagInput {
  kind: string;
  pushedAt: Date | null;
  archived: boolean;
  deprecated?: boolean | null;
  advisoriesOpen?: number | null;
  license: string | null;
}

export function ago(d: Date, now: Date = new Date()): string {
  const days = Math.max(0, (now.getTime() - d.getTime()) / DAY);
  if (days < 1) { const h = Math.max(1, Math.round(days * 24)); return h === 1 ? "1 hour ago" : `${h} hours ago`; }
  if (days < 45) { const n = Math.round(days); return n === 1 ? "1 day ago" : `${n} days ago`; }
  if (days < 548) { const n = Math.round(days / 30.44); return n === 1 ? "1 month ago" : `${n} months ago`; }
  const y = Math.round(days / 365.25);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Colour band for a 0..100 score: the same steel / amber / rust ramp as the strip. */
export function band(score: number): "ok" | "mid" | "bad" {
  return score >= 70 ? "ok" : score >= 40 ? "mid" : "bad";
}

export function flags(i: FlagInput, now: Date = new Date()): { label: string; warn: boolean }[] {
  const out: { label: string; warn: boolean }[] = [];
  if (i.archived) out.push({ label: "archived", warn: false });
  if (i.deprecated === true) out.push({ label: "deprecated", warn: false });
  if (typeof i.advisoriesOpen === "number" && i.advisoriesOpen > 0) {
    out.push({ label: `${i.advisoriesOpen} advisor${i.advisoriesOpen === 1 ? "y" : "ies"}`, warn: false });
  }
  if (!i.archived && i.pushedAt) {
    const days = (now.getTime() - i.pushedAt.getTime()) / DAY;
    if (days > 365) out.push({ label: "inactive", warn: false });
    else if (days > 180) out.push({ label: "slowing", warn: true });
  }
  const lic = i.license?.trim();
  if (i.kind === "repo" && !lic) out.push({ label: "no licence", warn: false });
  else if (lic === "NOASSERTION") out.push({ label: "licence unclear", warn: true });
  return out;
}
