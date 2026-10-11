-- Embeddings move from the 256-dimension hashed dev embedder to gte-small (384 dimensions).
-- Existing vectors cannot be cast between dimensions and are not comparable across models, so they
-- are cleared; scripts/reembed.ts fills them again (search falls back to full-text until then).
DROP INDEX IF EXISTS "items_embedding_idx";
--> statement-breakpoint
UPDATE "items" SET "embedding" = NULL, "embedded_at" = NULL;
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "embedding" SET DATA TYPE vector(384);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "embedding_model" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_embedding_idx" ON "items" USING hnsw ("embedding" vector_cosine_ops);
