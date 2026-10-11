/**
 * Ranking. Pure functions, no I/O, no imports from billing or featured listings.
 * See DECISIONS.md: "Money never touches the ranker".
 */

export interface VoterProfile {
  githubCreatedAt: Date | null;
  publicRepos: number;
  followers: number;
  shadowBanned: boolean;
  /** reppit account creation (users.created_at). Drives the ramp for accounts with no GitHub history. */
  createdAt?: Date | null;
}

/** Days for an email-only (no GitHub history) account to reach full weight 1.0. */
export const NO_GITHUB_RAMP_DAYS = 60;

/**
 * Vote weight in [0, 2]. Shadow-banned users get 0 (their vote is recorded but has no effect).
 * - GitHub-backed accounts: 0.2 at day 0 of the GitHub account, ~1.0 at a year, up to 2.0 with
 *   repos and followers.
 * - Accounts with no GitHub history (email sign-up): linear from 0.2 at reppit day 0 to 1.0 at
 *   60 days, capped at 1.0. Without createdAt they stay at 0.2.
 */
export function voteWeight(p: VoterProfile, now: Date = new Date()): number {
  if (p.shadowBanned) return 0;
  if (!p.githubCreatedAt) {
    const days = p.createdAt ? Math.max(0, (now.getTime() - p.createdAt.getTime()) / 86_400_000) : 0;
    return round(Math.min(1, 0.2 + 0.8 * Math.min(1, days / NO_GITHUB_RAMP_DAYS)), 3);
  }
  const ageDays = Math.max(0, (now.getTime() - p.githubCreatedAt.getTime()) / 86_400_000);
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
  /** Null = unknown. */
  pushedAt: Date | null;
  /**
   * Null = unknown. A repo without GitHub releases is treated as unknown rather than stale:
   * many projects ship through tags or registries we do not read, and the no-token ingest path
   * never fetches releases at all, so punishing null would penalise by data source.
   */
  lastReleaseAt: Date | null;
  /** True open issues, excluding PRs. Null = unknown (never pass REST open_issues_count here). */
  openIssues: number | null;
  stars: number;
  archived: boolean;
  license: string | null;
  /** Registry says the package is deprecated. Null/undefined = unknown. */
  deprecated?: boolean | null;
  /** Open advisories against the latest release. Null/undefined = not checked. */
  advisoriesOpen?: number | null;
}

export const HEALTH_WEIGHTS = { recency: 0.55, release: 0.2, issues: 0.25 } as const;
/** Multiplier applied when at least one open advisory affects the latest release. */
export const ADVISORY_HEALTH_FACTOR = 0.5;

/**
 * 0..1. Maintenance recency dominates; release cadence and issue load adjust; license and open
 * advisories scale the result. Archived or deprecated = 0.
 *
 * Unknown inputs neither reward nor punish: each component is included only when its input is
 * known, and the weights are renormalised over the known components. So the score is the weighted
 * mean of what we actually know. With nothing known the score is a neutral 0.5 (times license).
 */
export function healthScore(h: HealthInputs, now: Date = new Date()): number {
  if (h.archived || h.deprecated === true) return 0;
  let sum = 0;
  let weight = 0;
  if (h.pushedAt) {
    const days = Math.max(0, (now.getTime() - h.pushedAt.getTime()) / 86_400_000);
    sum += HEALTH_WEIGHTS.recency * Math.exp(-days / 180); // 1.0 today, 0.37 at 6 months, 0.13 at a year
    weight += HEALTH_WEIGHTS.recency;
  }
  if (h.lastReleaseAt) {
    const days = Math.max(0, (now.getTime() - h.lastReleaseAt.getTime()) / 86_400_000);
    sum += HEALTH_WEIGHTS.release * Math.exp(-days / 365);
    weight += HEALTH_WEIGHTS.release;
  }
  if (h.openIssues !== null && h.openIssues !== undefined && Number.isFinite(h.openIssues)) {
    const load = Math.min(1, Math.max(0, h.openIssues) / (Math.max(0, h.stars) * 0.1 + 10)); // 1 = overloaded
    sum += HEALTH_WEIGHTS.issues * (1 - load);
    weight += HEALTH_WEIGHTS.issues;
  }
  const base = weight > 0 ? sum / weight : 0.5;
  const licenseOk = h.license && h.license !== "NOASSERTION" && h.license !== "other" ? 1 : 0.6;
  const advisories = typeof h.advisoriesOpen === "number" && h.advisoriesOpen > 0 ? ADVISORY_HEALTH_FACTOR : 1;
  return round(Math.max(0, Math.min(1, base * licenseOk * advisories)), 4);
}

export interface RankInputs {
  semantic: number;      // cosine similarity in [-1, 1]
  weightedScore: number; // community
  health: number;        // 0..1
  stars: number;
  installs: number;
  /** Zero-user flags. A flagged item is demoted below every unflagged candidate (see rankTier). */
  archived?: boolean;
  deprecated?: boolean | null;
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

/**
 * 0 = normal, 1 = flagged (archived, or deprecated by its registry). Tier sorts before score, so a
 * flagged item can never outrank an unflagged candidate however much more relevant, popular or
 * upvoted it is. Unknown (null) deprecation is not a flag.
 */
export function rankTier(r: Pick<RankInputs, "archived" | "deprecated">): 0 | 1 {
  return r.archived || r.deprecated === true ? 1 : 0;
}

/** Order candidates: tier ascending, then blended score descending. Stable for ties. */
export function compareRank(a: { tier: number; score: number }, b: { tier: number; score: number }): number {
  return a.tier - b.tier || b.score - a.score;
}

function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }
