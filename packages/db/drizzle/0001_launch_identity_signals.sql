CREATE TABLE "item_aliases" (
	"item_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"seen_until" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_aliases_item_id_slug_pk" PRIMARY KEY("item_id","slug")
);
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "open_issues" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "open_issues" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "github_id" bigint;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "closed_issues" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "open_pull_requests" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "package_ecosystem" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "package_name" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deprecated" boolean;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deprecation_message" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "advisories_open" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "signals_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "item_aliases" ADD CONSTRAINT "item_aliases_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_aliases_slug_lower_idx" ON "item_aliases" USING btree (lower("slug"));--> statement-breakpoint
CREATE INDEX "items_slug_lower_idx" ON "items" USING btree (lower("slug"));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_github_id_unique" UNIQUE("github_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint
-- Data fix: every open_issues value written before this migration came from REST open_issues_count,
-- which counts open pull requests as issues (next.js: 3,566 = 1,072 issues + 2,494 PRs). Null = unknown.
-- health_score rows computed from it are recomputed by `pnpm --filter @gitit/web exec tsx scripts/recompute-health.ts`.
UPDATE "items" SET "open_issues" = NULL;
