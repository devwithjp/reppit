/**
 * Ranking. Pure functions, no I/O, no imports from billing or featured listings.
 * See DECISIONS.md: "Money never touches the ranker".
 */

export interface VoterProfile {
  githubCreatedAt: Date | null;
  publicRepos: number;
  followers: number;
  shadowBanned: boolean;
}

/**
 * Vote weight in [0, 2]. New or empty accounts count less; established ones a bit more.
 * Shadow-banned users get 0 (their vote is recorded but has no effect).
 */
export function voteWeight(p: VoterProfile, now: Date = new Date()): number {
  if (p.shadowBanned) return 0;
  const ageDays = p.githubCreatedAt ? Math.max(0, (now.getTime() - p.githubCreatedAt.getTime()) / 86_400_000) : 0;
  // 0.2 at day 0, ~0.6 at 30 days, ~1.0 at 1 year, saturating.
  const ageFactor = 0.2 + 0.8 * (1 - Math.exp(-ageDays / 200));
  const activity = Math.min(1, Math.log1p(p.publicRepos) / Math.log1p(30)); // 30 repos = full credit
  const social = Math.min(1, Math.log1p(p.followers) / Math.log1p(100));   // 100 followers = full credit
  const reputation = 1 + 0.5 * activity + 0.5 * social; // [1, 2]
  return round(Math.min(2, ageFactor * reputation), 3);
}

export interface VoteRow { direction: "up" | "down"; weight: number; createdAt: Date }

/** Sum of weighted votes, time-decayed with a 180-day half-life so stale praise fades. */
export function weightedScore(votes: VoteRow[], now: Date = new Date()): number {
  const halfLifeMs = 180 * 86_400_000;
  let s = 0;
  for (const v of votes) {
    const age = Math.max(0, now.getTime() - v.createdAt.getTime());
    const decay = Math.pow(0.5, age / halfLifeMs);
    s += (v.direction === "up" ? 1 : -1) * v.weight * decay;
  }
  return round(s, 4);
}

/** Reddit-style hot score: log of net score plus age bonus, so new items get a window. */
export function hotScore(net: number, createdAt: Date, epoch = new Date("2026-01-01T00:00:00Z")): number {
  const order = Math.log10(Math.max(Math.abs(net), 1));
  const sign = net > 0 ? 1 : net < 0 ? -1 : 0;
  const seconds = (createdAt.getTime() - epoch.getTime()) / 1000;
  return round(sign * order + seconds / 45_000, 6);
}

export interface HealthInputs {
  pushedAt: Date | null;
  lastReleaseAt: Date | null;
  openIssues: number;
  stars: number;
  archived: boolean;
  license: string | null;
}

/** 0..1. Maintenance recency dominates; license and issue load adjust. Archived = 0. */
export function healthScore(h: HealthInputs, now: Date = new Date()): number {
  if (h.archived) return 0;
  const daysSincePush = h.pushedAt ? (now.getTime() - h.pushedAt.getTime()) / 86_400_000 : 3650;
  const recency = Math.exp(-daysSincePush / 180); // 1.0 today, 0.37 at 6 months, 0.13 at a year
  const daysSinceRelease = h.lastReleaseAt ? (now.getTime() - h.lastReleaseAt.getTime()) / 86_400_000 : 3650;
  const releaseCadence = Math.exp(-daysSinceRelease / 365);
  const issueLoad = h.stars > 0 ? Math.min(1, h.openIssues / (h.stars * 0.1 + 10)) : 0.5; // 1 = overloaded
  const licenseOk = h.license && h.license !== "NOASSERTION" && h.license !== "other" ? 1 : 0.6;
  const score = (0.55 * recency + 0.2 * releaseCadence + 0.25 * (1 - issueLoad)) * licenseOk;
  return round(Math.max(0, Math.min(1, score)), 4);
}

export interface RankInputs {
  semantic: number;      // cosine similarity in [-1, 1]
  weightedScore: number; // community
  health: number;        // 0..1
  stars: number;
  installs: number;
}

export const RANK_WEIGHTS = { semantic: 0.45, community: 0.3, health: 0.15, popularity: 0.1 } as const;

/** Blended rank in roughly [0, 1]. Used to rerank the top-N semantic hits. */
export function blendedRank(r: RankInputs): number {
  const semantic = Math.max(0, r.semantic);
  // squash community score: 0 → 0.5, +20 → ~0.9, -20 → ~0.1
  const community = 1 / (1 + Math.exp(-r.weightedScore / 8));
  const popularity = Math.min(1, Math.log10(1 + r.stars + r.installs) / 5); // 100k = 1.0
  return round(
    RANK_WEIGHTS.semantic * semantic +
    RANK_WEIGHTS.community * community +
    RANK_WEIGHTS.health * r.health +
    RANK_WEIGHTS.popularity * popularity,
    5,
  );
}

function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
