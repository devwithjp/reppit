-- Search document weights, v2: A = name, package name, owner/name; B = topics; C = description;
-- D = the first 3,000 README characters. Topics get their own weight so a single-word query can tell
-- "tagged with it" (a topic) from "mentions it" (description, README).
CREATE OR REPLACE FUNCTION reppit_search_document(p_name text, p_slug text, p_package text, p_description text, p_topics jsonb, p_readme text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, coalesce(p_name, '') || ' ' || coalesce(p_package, '') || ' ' || coalesce(p_slug, '') || ' ' || translate(coalesce(p_slug, ''), '/', ' ')), 'A') ||
    setweight(to_tsvector('english'::regconfig, translate(coalesce(p_topics::text, ''), '[]",-', '     ')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(p_description, '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, left(coalesce(p_readme, ''), 3000)), 'D')
$$;
--> statement-breakpoint
-- Stored READMEs are capped at 16 KB (index growth to ~3,000 repos within the disk budget). The
-- update also recomputes search_tsv, a stored generated column, with the new weights for every row.
UPDATE "items" SET "readme" = left("readme", 16384) WHERE length("readme") > 16384;
--> statement-breakpoint
UPDATE "items" SET "name" = "name";
