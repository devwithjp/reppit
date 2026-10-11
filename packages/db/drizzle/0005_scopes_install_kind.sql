ALTER TABLE "api_keys" ADD COLUMN "scopes" text[] DEFAULT ARRAY['read']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "install_options" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "install_kind" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "releases_last_year" integer;