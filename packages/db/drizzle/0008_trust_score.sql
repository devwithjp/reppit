-- Store the trust score the UI shows, so "Trusted" can sort by it. Null = too little measured.
-- scripts/recompute-health.ts fills it for existing rows.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "trust_score" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_trust_score_idx" ON "items" ("trust_score" DESC NULLS LAST);
