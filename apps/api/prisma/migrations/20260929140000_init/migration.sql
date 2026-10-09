-- ─────────────────────────────────────────────────────────────────────────────
-- E-PlantShopping 2.0 — initial schema (Step 2)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CategoryScope" AS ENUM ('VENDOR', 'PLANT');

-- CreateEnum
CREATE TYPE "Sunlight" AS ENUM ('FULL_SUN', 'PARTIAL_SUN', 'SHADE');

-- CreateEnum
CREATE TYPE "WaterNeed" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MODERATE', 'HARD');

-- CreateEnum
CREATE TYPE "Placement" AS ENUM ('INDOOR', 'OUTDOOR', 'BOTH');

-- CreateEnum
CREATE TYPE "MasterOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'PARTIALLY_FULFILLED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorOrderStatus" AS ENUM ('ORDERED', 'ACCEPTED', 'PACKING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "address_line" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Bengaluru',
    "state" TEXT NOT NULL DEFAULT 'Karnataka',
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "delivery_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "scope" "CategoryScope" NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_categories" (
    "vendor_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "vendor_categories_pkey" PRIMARY KEY ("vendor_id","category_id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" UUID NOT NULL,
    "common_name" TEXT NOT NULL,
    "scientific_name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sunlight" "Sunlight" NOT NULL,
    "water" "WaterNeed" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "placement" "Placement" NOT NULL,
    "mature_height_cm" INTEGER,
    "pet_friendly" BOOLEAN NOT NULL DEFAULT false,
    "air_purifying" BOOLEAN NOT NULL DEFAULT false,
    "flowering_plant" BOOLEAN NOT NULL DEFAULT false,
    "care_notes" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_categories" (
    "plant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "plant_categories_pkey" PRIMARY KEY ("plant_id","category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "pot_size" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "MasterOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "items_total" DECIMAL(10,2) NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(10,2) NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "delivery_lat" DOUBLE PRECISION,
    "delivery_lng" DOUBLE PRECISION,
    "notes" TEXT,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "master_order_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "status" "VendorOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "items_total" DECIMAL(10,2) NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "rejection_reason" TEXT,
    "accepted_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "vendor_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_title" TEXT NOT NULL,
    "plant_name" TEXT NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "master_order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "razorpay_signature" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "product_id" UUID,
    "vendor_order_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_user_id_key" ON "vendors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_approved_suspended_idx" ON "vendors"("approved", "suspended");

-- CreateIndex
CREATE INDEX "vendors_city_idx" ON "vendors"("city");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_scope_idx" ON "categories"("scope");

-- CreateIndex
CREATE INDEX "vendor_categories_category_id_idx" ON "vendor_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "plants_scientific_name_key" ON "plants"("scientific_name");

-- CreateIndex
CREATE UNIQUE INDEX "plants_slug_key" ON "plants"("slug");

-- CreateIndex
CREATE INDEX "plants_sunlight_water_difficulty_placement_idx" ON "plants"("sunlight", "water", "difficulty", "placement");

-- CreateIndex
CREATE INDEX "plant_categories_category_id_idx" ON "plant_categories"("category_id");

-- CreateIndex
CREATE INDEX "products_vendor_id_active_idx" ON "products"("vendor_id", "active");

-- CreateIndex
CREATE INDEX "products_plant_id_idx" ON "products"("plant_id");

-- CreateIndex
CREATE INDEX "products_price_idx" ON "products"("price");

-- CreateIndex
CREATE UNIQUE INDEX "products_vendor_id_plant_id_pot_size_key" ON "products"("vendor_id", "plant_id", "pot_size");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_orders_order_number_key" ON "master_orders"("order_number");

-- CreateIndex
CREATE INDEX "master_orders_customer_id_placed_at_idx" ON "master_orders"("customer_id", "placed_at");

-- CreateIndex
CREATE INDEX "master_orders_status_idx" ON "master_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orders_order_number_key" ON "vendor_orders"("order_number");

-- CreateIndex
CREATE INDEX "vendor_orders_vendor_id_status_idx" ON "vendor_orders"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "vendor_orders_master_order_id_idx" ON "vendor_orders"("master_order_id");

-- CreateIndex
CREATE INDEX "order_items_vendor_order_id_idx" ON "order_items"("vendor_order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_master_order_id_key" ON "payments"("master_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_created_at_idx" ON "reviews"("vendor_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_product_id_idx" ON "reviews"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_author_id_vendor_order_id_product_id_key" ON "reviews"("author_id", "vendor_order_id", "product_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_categories" ADD CONSTRAINT "vendor_categories_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_categories" ADD CONSTRAINT "vendor_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_categories" ADD CONSTRAINT "plant_categories_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_categories" ADD CONSTRAINT "plant_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_orders" ADD CONSTRAINT "master_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_master_order_id_fkey" FOREIGN KEY ("master_order_id") REFERENCES "master_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_master_order_id_fkey" FOREIGN KEY ("master_order_id") REFERENCES "master_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────── PostGIS & data integrity ───────────────────────────
-- Everything below cannot be expressed in schema.prisma and is applied manually.

-- Spatial index used by the "nurseries near me" query (ST_DWithin / ST_Distance).
CREATE INDEX "vendors_location_gist_idx" ON "vendors" USING GIST ("location");

-- Trigram indexes for typo-tolerant search (Step 6).
CREATE INDEX "plants_common_name_trgm_idx" ON "plants" USING GIN ("common_name" gin_trgm_ops);
CREATE INDEX "plants_scientific_name_trgm_idx" ON "plants" USING GIN ("scientific_name" gin_trgm_ops);
CREATE INDEX "products_title_trgm_idx" ON "products" USING GIN ("title" gin_trgm_ops);

-- Keep the geography column in sync with latitude/longitude so application code
-- (and Prisma, which cannot write the Unsupported column) only ever sets lat/lng.
CREATE OR REPLACE FUNCTION sync_vendor_location() RETURNS trigger AS $$
BEGIN
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendors_sync_location
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "vendors"
  FOR EACH ROW EXECUTE FUNCTION sync_vendor_location();

-- Value constraints
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_delivery_radius_positive" CHECK ("delivery_radius_km" > 0);
