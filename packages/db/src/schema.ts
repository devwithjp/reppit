import {
  pgTable, text, integer, bigint, real, timestamp, boolean, uuid, primaryKey, index, uniqueIndex, jsonb, vector, pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const EMBEDDING_DIMENSIONS = 256;

export const itemKind = pgEnum("item_kind", ["repo", "skill", "mcp"]);
export const voteDirection = pgEnum("vote_direction", ["up", "down"]);
export const downvoteReason = pgEnum("downvote_reason", [
  "unmaintained", "insecure", "broken-on-agent", "misleading", "low-quality",
]);
export const compatStatus = pgEnum("compat_status", ["works", "broken"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: text("github_id").unique(),
  // Supabase Auth user (auth.users.id) mapped to this row. Wired by the auth layer.
  authUserId: uuid("auth_user_id").unique(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  // GitHub account creation date; drives vote weighting.
  githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
  publicRepos: integer("public_repos").default(0).notNull(),
  followers: integer("followers").default(0).notNull(),
  isDev: boolean("is_dev").default(false).notNull(),
  shadowBanned: boolean("shadow_banned").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: itemKind("kind").notNull().default("repo"),
  // GitHub repository databaseId. The identity of a repo (DECISIONS.md: "Repository identity is the
  // numeric id"). Null for skills, which are paths inside a repo, and for legacy rows not yet resolved.
  githubId: bigint("github_id", { mode: "number" }).unique(),
  // "owner/name" for repos; "owner/repo/path" for skills. A mutable label: renames and transfers
  // update it and move the old value to item_aliases.
  slug: text("slug").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  readme: text("readme"),
  language: text("language"),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  license: text("license"),
  stars: integer("stars").default(0).notNull(),
  forks: integer("forks").default(0).notNull(),
  // True open issues, excluding pull requests (GraphQL issues(states:OPEN)). Null = unknown: REST
  // open_issues_count includes PRs and is never stored here.
  openIssues: integer("open_issues"),
  // Closed issues, all time (GraphQL issues(states:CLOSED)). With open_issues gives the stars-free
  // issue-load share used by the trust score. Null = unknown.
  closedIssues: integer("closed_issues"),
  // Open pull requests (GraphQL pullRequests(states:OPEN)). Null = unknown.
  openPullRequests: integer("open_pull_requests"),
  installs: integer("installs").default(0).notNull(),
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
  lastReleaseAt: timestamp("last_release_at", { withTimezone: true }),
  archived: boolean("archived").default(false).notNull(),
  // Zero-user signals (DECISIONS.md "Ranking must be useful at zero users"). Null always means
  // "not checked / no source", never "clean".
  // The package this repo publishes, verified to point back at this repo. Null = none found.
  packageEcosystem: text("package_ecosystem"), // OSV ecosystem name: "npm" | "PyPI" | "crates.io"
  packageName: text("package_name"),
  // true = registry marks the latest release deprecated (npm `deprecated`, PyPI yanked / Inactive).
  deprecated: boolean("deprecated"),
  deprecationMessage: text("deprecation_message"),
  // Advisories (OSV) affecting the latest published version. Null = not checked; never default to 0.
  advisoriesOpen: integer("advisories_open"),
  signalsCheckedAt: timestamp("signals_checked_at", { withTimezone: true }),
  healthScore: real("health_score").default(0).notNull(),
  // Denormalised, recomputed on every vote.
  upvotes: integer("upvotes").default(0).notNull(),
  downvotes: integer("downvotes").default(0).notNull(),
  weightedScore: real("weighted_score").default(0).notNull(),
  hotScore: real("hot_score").default(0).notNull(),
  commentCount: integer("comment_count").default(0).notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
  submittedBy: uuid("submitted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("items_slug_kind_idx").on(t.slug, t.kind),
  index("items_slug_lower_idx").on(sql`lower(${t.slug})`),
  index("items_hot_idx").on(t.hotScore),
  index("items_weighted_idx").on(t.weightedScore),
  index("items_language_idx").on(t.language),
  index("items_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
]);

// Previous slugs of an item, so old URLs and fixtures keep resolving after a rename or transfer.
// seen_until = when we last observed the item under this slug.
export const itemAliases = pgTable("item_aliases", {
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  seenUntil: timestamp("seen_until", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.itemId, t.slug] }),
  index("item_aliases_slug_lower_idx").on(sql`lower(${t.slug})`),
]);

export const votes = pgTable("votes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  direction: voteDirection("direction").notNull(),
  reason: downvoteReason("reason"),
  // Weight at the time of voting, from user reputation. Stored so re-weighting is auditable.
  weight: real("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemId] }), index("votes_item_idx").on(t.itemId)]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  body: text("body").notNull(),
  upvotes: integer("upvotes").default(0).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("comments_item_idx").on(t.itemId), index("comments_parent_idx").on(t.parentId)]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
});

export const itemTags = pgTable("item_tags", {
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.itemId, t.tagId] })]);

// "Works on Claude Code", "broken on Codex" — the signal skills.sh does not have.
export const agentCompatReports = pgTable("agent_compat_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(), // claude-code | codex | cursor | gemini-cli | copilot | windsurf | other
  status: compatStatus("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("compat_unique_idx").on(t.itemId, t.userId, t.agent)]);

// Monetisation: paid placement. Deliberately not referenced anywhere in ranking code.
export const featuredListings = pgTable("featured_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  label: text("label").default("Sponsored").notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  tier: text("tier").default("free").notNull(), // free | pro | team
  monthlyLimit: integer("monthly_limit").default(1000).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const searchLog = pgTable("search_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  normalized: text("normalized").notNull(),
  userId: uuid("user_id"),
  apiKeyId: uuid("api_key_id"),
  resultIds: jsonb("result_ids").$type<string[]>().default([]).notNull(),
  costUsd: real("cost_usd").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("search_log_norm_idx").on(t.normalized)]);

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemAlias = typeof itemAliases.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CompatReport = typeof agentCompatReports.$inferSelect;
