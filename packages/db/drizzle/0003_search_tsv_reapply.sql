-- Re-apply 0002_search_tsv. A server started while 0002 was still drizzle-kit's empty placeholder
-- recorded it as applied (hash of the placeholder), so on that database 0002's SQL never ran and the
-- migrator will not run it again. Every statement here is idempotent: on a database where 0002 ran
-- properly this is a no-op apart from re-zeroing skill stars, which is also idempotent.
CREATE OR REPLACE FUNCTION reppit_search_document(p_name text, p_slug text, p_package text, p_description text, p_topics jsonb, p_readme text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, coalesce(p_name, '') || ' ' || coalesce(p_package, '') || ' ' || coalesce(p_slug, '') || ' ' || translate(coalesce(p_slug, ''), '/', ' ')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(p_description, '') || ' ' || translate(coalesce(p_topics::text, ''), '[]",', '    ')), 'B') ||
    setweight(to_tsvector('english'::regconfig, left(coalesce(p_readme, ''), 3000)), 'D')
$$;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (reppit_search_document("name", "slug", "package_name", "description", "topics", "readme")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_search_tsv_idx" ON "items" USING gin ("search_tsv");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_package_name_lower_idx" ON "items" (lower("package_name"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_lower_idx" ON "items" (lower("name"));
--> statement-breakpoint
UPDATE "items" SET "stars" = 0, "forks" = 0 WHERE "kind" = 'skill' AND ("stars" <> 0 OR "forks" <> 0);
