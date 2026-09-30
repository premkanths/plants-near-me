-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6 — full-text search
--
-- Both tsvectors are GENERATED ALWAYS ... STORED columns: Postgres recomputes
-- them inside the same statement that changes the row, so a listing can never
-- drift out of sync with its index (the classic failure of a trigger- or
-- application-maintained search column).
--
-- Weights: A = the name people actually type, B = scientific name,
-- C = description, D = care notes. ts_rank_cd then scores a title hit far
-- above an incidental mention in a paragraph of care instructions.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "plants" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("common_name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("scientific_name", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("care_notes", '')), 'D')
  ) STORED;

ALTER TABLE "products" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;

-- GIN is the right index for @@ lookups; one per table so the planner can
-- BitmapOr them when a query matches either the listing or the species.
CREATE INDEX "plants_search_vector_idx" ON "plants" USING GIN ("search_vector");
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- pg_trgm backs the typo-tolerant fallback and autocomplete. Indexes on
-- plants.common_name / products.title already exist from the initial migration;
-- shop names need one too so "urban jungl" still finds the nursery.
CREATE INDEX "vendors_name_trgm_idx" ON "vendors" USING GIN ("name" gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector readiness (Step 12)
--
-- Semantic search is deliberately NOT enabled here: it needs the pgvector
-- extension plus an embedding pipeline, and shipping an empty vector column
-- would only add dead weight to every row.
--
-- The design is ready for it — search ranking is assembled from named score
-- components in DiscoveryService/SearchService, so a semantic score becomes one
-- more term rather than a rewrite. When the time comes, the migration is:
--
--   CREATE EXTENSION IF NOT EXISTS vector;
--   ALTER TABLE "plants" ADD COLUMN "embedding" vector(384);
--   CREATE INDEX "plants_embedding_idx" ON "plants"
--     USING hnsw ("embedding" vector_cosine_ops);
--
-- and the ranking gains: (1 - (pl.embedding <=> $query_embedding)) * weight.
-- ─────────────────────────────────────────────────────────────────────────────
