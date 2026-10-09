-- Step 10: per-listing ratings.
--
-- A shop already carries rating_avg/rating_count; a review may also target one
-- plant in the order, so the same rolling aggregate is kept on the listing.
-- Both are denormalised on purpose: ratings are read on every search result
-- and product card, and recomputed only when a review is written or edited.
ALTER TABLE "products"
  ADD COLUMN "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

-- Supports "best rated first" over a shop's catalogue.
CREATE INDEX "products_rating_avg_idx" ON "products"("rating_avg" DESC);
