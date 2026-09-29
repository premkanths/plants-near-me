# E-PlantShopping 2.0 — Entity Relationship Diagram

> Renders directly on GitHub. Source of truth is
> [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).

```mermaid
erDiagram
    USER ||--o| VENDOR : "owns (role=VENDOR)"
    USER ||--o| CART : has
    USER ||--o{ MASTER_ORDER : places
    USER ||--o{ REVIEW : writes

    VENDOR ||--o{ PRODUCT : lists
    VENDOR ||--o{ VENDOR_ORDER : fulfils
    VENDOR ||--o{ REVIEW : receives
    VENDOR }o--o{ CATEGORY : "vendor_categories"

    PLANT ||--o{ PRODUCT : "sold as"
    PLANT }o--o{ CATEGORY : "plant_categories"

    PRODUCT ||--o{ CART_ITEM : "added to"
    PRODUCT ||--o{ ORDER_ITEM : "ordered as"
    PRODUCT ||--o{ REVIEW : "reviewed in"

    CART ||--o{ CART_ITEM : contains

    MASTER_ORDER ||--|{ VENDOR_ORDER : "split into"
    MASTER_ORDER ||--o| PAYMENT : "paid by"
    VENDOR_ORDER ||--|{ ORDER_ITEM : contains
    VENDOR_ORDER ||--o{ REVIEW : "unlocks"

    USER {
        uuid id PK
        string email UK
        string password_hash
        string name
        string phone
        enum role "CUSTOMER|VENDOR|ADMIN"
        bool is_active
    }

    VENDOR {
        uuid id PK
        uuid user_id FK,UK
        string name
        string slug UK
        string description
        float latitude
        float longitude
        geography location "Point 4326, GiST index"
        float delivery_radius_km
        decimal delivery_fee
        float rating_avg
        int rating_count
        bool approved
        bool suspended
    }

    CATEGORY {
        uuid id PK
        string name UK
        string slug UK
        enum scope "VENDOR|PLANT"
    }

    PLANT {
        uuid id PK
        string common_name
        string scientific_name UK
        string slug UK
        enum sunlight "FULL_SUN|PARTIAL_SUN|SHADE"
        enum water "LOW|MEDIUM|HIGH"
        enum difficulty "EASY|MODERATE|HARD"
        enum placement "INDOOR|OUTDOOR|BOTH"
        bool pet_friendly
        bool air_purifying
    }

    PRODUCT {
        uuid id PK
        uuid vendor_id FK
        uuid plant_id FK
        string title
        decimal price
        int stock
        string pot_size
        string_array images
        bool active
    }

    CART {
        uuid id PK
        uuid user_id FK,UK
    }

    CART_ITEM {
        uuid id PK
        uuid cart_id FK
        uuid product_id FK
        int quantity
    }

    MASTER_ORDER {
        uuid id PK
        string order_number UK
        uuid customer_id FK
        enum status "PENDING_PAYMENT|PLACED|PARTIALLY_FULFILLED|COMPLETED|CANCELLED"
        decimal items_total
        decimal grand_total
        string recipient_name
        string address_line1
        string pincode
    }

    VENDOR_ORDER {
        uuid id PK
        string order_number UK
        uuid master_order_id FK
        uuid vendor_id FK
        enum status "ORDERED|ACCEPTED|PACKING|READY_FOR_PICKUP|OUT_FOR_DELIVERY|DELIVERED|REJECTED"
        decimal total
        string rejection_reason
    }

    ORDER_ITEM {
        uuid id PK
        uuid vendor_order_id FK
        uuid product_id FK
        string product_title "snapshot"
        decimal unit_price "snapshot"
        int quantity
        decimal line_total
    }

    PAYMENT {
        uuid id PK
        uuid master_order_id FK,UK
        enum provider "RAZORPAY|COD"
        enum status "PENDING|PAID|FAILED|REFUNDED"
        decimal amount
        string razorpay_order_id UK
        string razorpay_payment_id UK
    }

    REVIEW {
        uuid id PK
        uuid author_id FK
        uuid vendor_id FK
        uuid product_id FK "nullable"
        uuid vendor_order_id FK
        int rating "CHECK 1..5"
        string comment
    }
```

## Order status flow (Step 8 will enforce this)

```mermaid
stateDiagram-v2
    [*] --> ORDERED
    ORDERED --> ACCEPTED
    ORDERED --> REJECTED
    ACCEPTED --> PACKING
    PACKING --> READY_FOR_PICKUP
    READY_FOR_PICKUP --> OUT_FOR_DELIVERY
    OUT_FOR_DELIVERY --> DELIVERED
    DELIVERED --> [*]
    REJECTED --> [*]
```

## Design notes

**1. Two order levels.** A customer checks out once (`MasterOrder`, one payment,
one address) but each vendor works on their own `VendorOrder` with an independent
status. That is what makes the marketplace multi-vendor rather than multi-cart.

**2. `Plant` vs `Product`.** `Plant` is species knowledge (sunlight, water,
difficulty) shared by everyone — it powers search, recommendations and photo
identification. `Product` is one vendor's listing of that species (price, stock,
pot size). Without the split, "20 vendors selling Monstera" would mean 20
inconsistent copies of the care information.

**3. Snapshots on `OrderItem`.** `product_title`, `plant_name` and `unit_price`
are copied at checkout, so a later price change or deleted listing never rewrites
history. Product deletion is additionally blocked by `ON DELETE RESTRICT`.

**4. `latitude`/`longitude` + `location`.** Prisma cannot read or write PostGIS
types, so the canonical lat/lng live in ordinary columns and a `BEFORE INSERT OR
UPDATE` trigger (`sync_vendor_location`) derives the `geography(Point,4326)`
column. Application code only ever touches lat/lng, and the two can never drift.
Spatial queries then use raw SQL with `ST_DWithin` / `ST_Distance` against the
GiST index.

**5. Denormalised `rating_avg` / `rating_count` on `Vendor`.** Nearby-vendor
ranking sorts by distance _and_ rating on every request; recomputing an average
over all reviews each time would not scale. Step 10 updates both counters inside
the same transaction as the review insert.
