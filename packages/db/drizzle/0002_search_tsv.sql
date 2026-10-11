-- Hybrid search: a lexical index next to the vector one (works in PGlite and Supabase).
--
-- Weights: A = name, package name and owner/name (the 'simple' config, so "drizzle-orm", "ws" and
-- "llama.cpp" stay exact); B = description and topics (english, stemmed); D = the first 3,000
-- characters of the README (english).
--
-- The column is managed only here, not in the Drizzle schema, so `select().from(items)` never ships
-- a large tsvector to the app. The function is declared IMMUTABLE so it can back a generated column:
-- everything it calls is deterministic for a fixed text search configuration.
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
-- Exact lookups by package name (the name match that pins a result first).
CREATE INDEX IF NOT EXISTS "items_package_name_lower_idx" ON "items" (lower("package_name"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_lower_idx" ON "items" (lower("name"));
--> statement-breakpoint
-- Data fix: skills were stored with their parent repo's stars and forks (296k on every
-- obra/superpowers skill). A skill has no star count of its own.
UPDATE "items" SET "stars" = 0, "forks" = 0 WHERE "kind" = 'skill';
