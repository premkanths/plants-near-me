-- One shop-level review per order.
--
-- `@@unique([authorId, vendorOrderId, productId])` does not achieve this on its
-- own: in Postgres two NULLs are distinct, so a customer could post unlimited
-- shop-level reviews (product_id IS NULL) for the same order. The composite
-- index still covers per-plant reviews; this partial index covers the NULL case.
CREATE UNIQUE INDEX "reviews_author_order_shop_level_key"
  ON "reviews"("author_id", "vendor_order_id")
  WHERE "product_id" IS NULL;
