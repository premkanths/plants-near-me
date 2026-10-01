# 🌱 E-PlantShopping 2.0 — Multi-Vendor Plant Marketplace

Find nurseries near you, shop across multiple vendors in one cart, and track every order live.

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Frontend | Next.js 16 (TypeScript, App Router) + Tailwind CSS 4           |
| Backend  | NestJS 11 (TypeScript)                                         |
| Database | PostgreSQL 16 + PostGIS 3.4 (+ `pg_trgm`, `pgvector` later)    |
| ORM      | Prisma 7 (driver adapter: `@prisma/adapter-pg`)                |
| Maps     | Leaflet + OpenStreetMap _(Step 5)_                             |
| Auth     | JWT (access+refresh) + role guards (CUSTOMER / VENDOR / ADMIN) |
| Realtime | Socket.IO                                                      |
| Payments | Razorpay test mode _(Step 9)_                                  |
| Images   | Cloudinary _(Step 4)_                                          |
| AI       | Plant.id / PlantNet + LLM API _(Steps 12–13)_                  |
| Dev/CI   | Docker Compose, GitHub Actions _(Step 14)_                     |

## Repository layout

```
.
├── apps
│   ├── api                 # NestJS API  (http://localhost:3001/api)
│   │   ├── prisma          # schema.prisma, migrations, seed
│   │   └── src
│   │       ├── health      # GET /api/health
│   │       └── prisma      # PrismaService (global module)
│   └── web                 # Next.js app (http://localhost:3000)
│       └── src
│           ├── app         # App Router pages
│           ├── components  # UI components
│           └── lib         # API client helpers
├── docker/initdb           # SQL run once on DB container creation (PostGIS, pg_trgm)
├── docker-compose.yml      # PostgreSQL + PostGIS + Adminer
└── .env.example
```

npm **workspaces** drive the monorepo — one `npm install` at the root installs both apps.

## Prerequisites

- Node.js **20+** (tested on 22)
- Docker + Docker Compose (for PostgreSQL/PostGIS)

## Getting started

```bash
# 1. Install dependencies (root — installs both workspaces)
npm install

# 2. Create your env file
cp .env.example .env

# 3. Start PostgreSQL + PostGIS
npm run db:up            # docker compose up -d db

# 4. Create the database schema
npm run db:migrate       # prisma migrate dev

# 5. Load demo data (5 Bengaluru vendors, 20 plants, ~38 products)
npm run db:seed

# 6. Run both apps (API :3001, web :3000)
npm run dev
```

### No Docker? Use the built-in local database

`npm run db:local` starts PGlite (PostgreSQL compiled to WASM) with **PostGIS and
pg_trgm** on port 5432 — a drop-in replacement for the Docker container:

```bash
npm run db:local &                     # listens on 0.0.0.0:5432, data in .pglite/
# set DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
npm run db:migrate && npm run db:seed
```

### Demo accounts (after seeding)

| Role     | Email                  | Password       |
| -------- | ---------------------- | -------------- |
| Admin    | `admin@eplant.test`    | `Password123!` |
| Customer | `customer@eplant.test` | `Password123!` |
| Vendor   | `lalbagh@eplant.test`  | `Password123!` |

(Vendor `hebbal@eplant.test` is intentionally left **unapproved** to exercise the
admin approval flow.)

Open <http://localhost:3000> — the home page shows live API / PostgreSQL / PostGIS status.
Adminer (DB browser) is available with `docker compose up -d adminer` at <http://localhost:8080>
(system: PostgreSQL, server: `db`, user/pass/db: `eplant`).

### Run the apps individually

```bash
npm run dev:api          # NestJS in watch mode
npm run dev:web          # Next.js dev server
```

## How to test Step 1

```bash
# API health endpoint (db.status is "down" until docker compose is up)
curl -s http://localhost:3001/api/health | jq

# Same endpoint through the Next.js proxy — proves the web→API wiring
curl -s http://localhost:3000/api/health | jq

# Unit + e2e tests
npm run test -w @eplant/api
npm run test:e2e -w @eplant/api

# Lint + build everything
npm run lint
npm run build
```

Expected healthy response:

```json
{
  "status": "ok",
  "service": "e-plantshopping-api",
  "version": "0.1.0",
  "uptimeSeconds": 12,
  "timestamp": "2026-09-29T13:37:35.729Z",
  "db": { "status": "up", "postgis": "3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1" }
}
```

If the DB is not running you get `"status": "degraded"` with `db.status: "down"` — by design,
the API stays up so the frontend can show a meaningful status instead of a blank error.

## Data model (Step 2)

Full **[ER diagram + design notes → `docs/er-diagram.md`](./docs/er-diagram.md)**.

15 tables: `users`, `vendors`, `categories`, `vendor_categories`, `plants`,
`plant_categories`, `products`, `carts`, `cart_items`, `master_orders`,
`vendor_orders`, `order_items`, `payments`, `reviews` (+ PostGIS `spatial_ref_sys`).

Things worth knowing:

- **PostGIS**: `vendors.location` is `geography(Point,4326)` with a **GiST index**.
  A `BEFORE INSERT/UPDATE` trigger derives it from `latitude`/`longitude`, so
  application code (and Prisma, which can't write PostGIS types) only sets lat/lng.
- **pg_trgm**: GIN trigram indexes on `plants.common_name`, `plants.scientific_name`
  and `products.title` — typo-tolerant search is ready for Step 6
  (`"snak plnt"` → Snake Plant, `"hibiscas"` → Hibiscus).
- **Money** is `DECIMAL(10,2)`, never float.
- **CHECK constraints**: rating 1–5, non-negative stock/price, positive quantities.
- **Order history is immutable**: `order_items` snapshot title/price, and products
  referenced by an order can't be deleted (`ON DELETE RESTRICT`).

### Verify Step 2

```bash
npm run db:migrate && npm run db:seed   # seed is idempotent — safe to re-run

# nearby vendors (the Step 5 query, tested today)
psql "$DATABASE_URL" -c "SELECT name, ROUND((ST_Distance(location,
  ST_SetSRID(ST_MakePoint(77.6045,12.9758),4326)::geography)/1000)::numeric,2) AS km
  FROM vendors WHERE ST_DWithin(location,
  ST_SetSRID(ST_MakePoint(77.6045,12.9758),4326)::geography, 6000) ORDER BY km;"
```

```
Lalbagh Green Nursery      3.50 km
Indiranagar Urban Jungle   3.95 km
Jayanagar Flower Bazaar    5.74 km
```

## Auth (Step 3)

| Endpoint                         | Auth   | Purpose                                          |
| -------------------------------- | ------ | ------------------------------------------------ |
| `POST /api/auth/register`        | public | Customer sign-up (also creates their cart)       |
| `POST /api/auth/register/vendor` | public | Vendor sign-up → Vendor profile `approved=false` |
| `POST /api/auth/login`           | public | Returns access + refresh tokens                  |
| `POST /api/auth/refresh`         | public | Rotates the token pair                           |
| `POST /api/auth/logout`          | bearer | Invalidates the stored refresh token             |
| `GET  /api/auth/me`              | bearer | Current profile                                  |

- **Access token** 15 min, **refresh token** 7 days, rotated on every use; only a
  SHA-256 hash of the active refresh token is stored (`users.refresh_token_hash`),
  and reuse of an old token wipes the session.
- Passwords: **bcrypt, 12 rounds**. Login compares against a dummy hash for unknown
  emails so response timing can't be used to enumerate accounts.
- Guards are **global**: every route needs a valid token unless marked `@Public()`.
  `@Roles('VENDOR')` adds authorisation on top.

### Frontend session (BFF pattern)

The browser never holds a JWT. `POST /api/session` (a Next.js route handler) logs in
upstream and stores the tokens in **httpOnly cookies**; every other `/api/*` call goes
through `src/app/api/[...path]/route.ts`, which injects the access token server-side
and transparently refreshes it on a 401. `src/middleware.ts` redirects by role — purely
for UX, since the API always re-verifies.

Pages: `/login`, `/register` (customer ⇄ vendor toggle, with browser geolocation for the
shop pin), `/account`, `/vendor`, `/admin`.

### Verify Step 3

```bash
npm run test -w @eplant/api      # 14 unit tests (guards)
npm run test:e2e -w @eplant/api  # 18 e2e tests (needs a running DB)

curl -s -c c.txt -X POST localhost:3000/api/session -H 'Content-Type: application/json' \
  -d '{"intent":"login","payload":{"email":"customer@eplant.test","password":"Password123!"}}'
curl -s -b c.txt localhost:3000/api/auth/me           # works, no token in JS
curl -s -b c.txt localhost:3000/api/auth/vendor-only  # 403 Requires role: VENDOR
```

## Vendor features (Step 4)

| Endpoint                                    | Role   | Purpose                             |
| ------------------------------------------- | ------ | ----------------------------------- |
| `GET    /api/vendor/products`               | VENDOR | Own products (search, paging)       |
| `GET    /api/vendor/products/stats`         | VENDOR | Counts + inventory value            |
| `POST   /api/vendor/products`               | VENDOR | Create listing                      |
| `GET/PATCH/DELETE /api/vendor/products/:id` | VENDOR | Read / edit / remove own listing    |
| `PATCH  /api/vendor/products/:id/stock`     | VENDOR | Quick restock                       |
| `GET/PATCH /api/vendor/profile`             | VENDOR | Shop details, delivery radius & fee |
| `POST   /api/uploads/product-image`         | VENDOR | Image upload (≤5 MB, image types)   |
| `GET    /api/plants`                        | public | Species catalogue for the form      |

Pages: `/vendor` (stats + inventory table with inline stock editing), `/vendor/products/new`,
`/vendor/products/[id]`, `/vendor/settings` (radius slider, geolocation pin).

**Ownership is enforced in the WHERE clause**, e.g. `updateMany({ where: { id, vendorId } })` —
the vendor id always comes from the JWT and is never read from the request body. A vendor
touching another vendor's product gets `403`; the edit page renders `404`.

**Images**: uploaded through the backend so the Cloudinary secret never reaches the browser.
With `CLOUDINARY_URL` unset, files are written to `uploads/` and served by the API — the
project runs end-to-end with no third-party account.

### Verify Step 4

```bash
npm run test -w @eplant/api      # 24 unit tests (10 ownership-focused)
npm run test:e2e -w @eplant/api  # 38 e2e tests
```

## Nearby discovery (Step 5)

| Endpoint                   | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `GET /api/nearby/vendors`  | Shops inside a radius, nearest first                      |
| `GET /api/nearby/products` | In-stock listings from nearby shops                       |
| `GET /api/shops/:slug`     | Public shop page (distance included when lat/lng is sent) |

All three are public. Query params: `lat`, `lng` (required), `radiusKm` (≤ 50),
`deliverableOnly`, `category`, `q`, `maxPrice`, `sort`, `page`, `pageSize`.

```bash
curl "http://localhost:3001/api/nearby/vendors?lat=12.9758&lng=77.6045&radiusKm=5"
```

**How the spatial query works.** `ST_DWithin` does the filtering — it is the only
form PostGIS can answer with the GiST index on `vendors.location`:

```
Index Scan using vendors_location_gist_idx on vendors v
  Index Cond: (location && _st_expand(<origin>, 5000))
```

`ST_Distance` then runs only on the surviving rows, for display and ordering.
Writing `ST_Distance(...) <= 5000` in the `WHERE` clause instead would return the
same rows but force a sequential scan, so the two are not interchangeable.
`deliversToYou` is a second `ST_DWithin` against each vendor's _own_
`delivery_radius_km`, which is why a 6 km-away shop can still deliver while a
4 km-away one cannot.

Pages: `/nearby` (Leaflet + OpenStreetMap map beside a synced result list,
geolocation, radius slider, click-to-move pin) and `/shops/[slug]`.

### Verify Step 5

```bash
npm run test -w @eplant/api      # 40 unit tests (16 for discovery)
npm run test:e2e -w @eplant/api  # 66 e2e tests (28 for discovery)
```

## Search (Step 6)

| Endpoint                  | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `GET /api/search`         | Full-text + fuzzy search with facets      |
| `GET /api/search/suggest` | Trigram autocomplete for plants and shops |

```bash
curl "http://localhost:3001/api/search?q=mony+plnt"   # -> strategy "fuzzy", didYouMean "Money Plant"
```

**Two tiers.** `plants.search_vector` and `products.search_vector` are
`GENERATED ALWAYS ... STORED` tsvectors with weights (A = name, B = scientific
name, C = description, D = care notes), each behind a GIN index. A query runs
`websearch_to_tsquery` first — so `"quoted phrases"` and `-negation` work, and
English stemming means `grow` and `growing` return the same set. Only if that
finds nothing does `pg_trgm` similarity take over, which is what turns
`mony plnt` into Money Plant, plus a `didYouMean` suggestion.

Generated columns rather than triggers: PostgreSQL recomputes the vector inside
the same statement that changes the row, so a listing can never drift out of
sync with its index.

**Relevance** is a sum of named components (`ts_rank_cd` on the title ×1.0, on
the species ×0.6, a capped rating nudge, and a proximity term when coordinates
are supplied) rather than one opaque expression — each can be tuned, explained,
or joined by a semantic score later.

**pgvector readiness.** Semantic search is intentionally _not_ switched on: it
needs the extension plus an embedding pipeline (Step 12). The exact migration
and the ranking term it plugs into are written out at the bottom of
`apps/api/prisma/migrations/20260930090000_search/migration.sql`.

Page: `/search` — autocomplete, facet chips whose counts match the filtered
result set, price slider, "only shops near me", and typo recovery.

### Verify Step 6

```bash
npm run test -w @eplant/api      # 57 unit tests (17 for search)
npm run test:e2e -w @eplant/api  # 92 e2e tests (26 for search)
```

## Cart & multi-vendor checkout (Step 7)

| Endpoint                      | Role     | Purpose                             |
| ----------------------------- | -------- | ----------------------------------- |
| `GET    /api/cart`            | CUSTOMER | Cart grouped by vendor, with issues |
| `POST   /api/cart/items`      | CUSTOMER | Add (tops up an existing line)      |
| `PATCH  /api/cart/items/:id`  | CUSTOMER | Change quantity                     |
| `DELETE /api/cart/items/:id`  | CUSTOMER | Remove a line                       |
| `DELETE /api/cart`            | CUSTOMER | Empty the cart                      |
| `POST   /api/orders/checkout` | CUSTOMER | Place the order (COD for now)       |
| `GET    /api/orders`          | CUSTOMER | Own order history                   |
| `GET    /api/orders/:id`      | CUSTOMER | Own order detail                    |

One cart becomes **one `MasterOrder` + one `VendorOrder` per shop**, each with
its own number (`EP-260930-4F2A9C`, `…-V1`, `…-V2`), its own delivery fee and
its own status, so shops fulfil independently while the customer sees a single
order.

**The whole checkout is one transaction:**

1. `SELECT … FOR UPDATE` locks every product in the cart, **ordered by id** —
   the deterministic order is what stops two concurrent checkouts deadlocking;
2. availability, shop status and per-shop minimums are re-checked against the
   locked rows (the cart preview can be minutes stale);
3. stock is decremented with a guarded `UPDATE … WHERE stock >= qty`;
4. the order tree and its price/title snapshots are written;
5. the cart is emptied.

Any failure throws, and Postgres rolls back all of it — no half-placed order,
no leaked stock, cart untouched. Conflicts come back as **409** listing _every_
problem at once, not one per retry.

Isolation is Read Committed plus explicit row locks rather than Serializable:
the locks already make the read-modify-write safe, without exposing customers
to random serialization failures.

Pages: `/cart`, `/checkout`, `/orders`, `/orders/[id]`.

### Verify Step 7

```bash
npm run test -w @eplant/api      # 92 unit tests (35 for cart + checkout)
npm run test:e2e -w @eplant/api  # 115 e2e tests (23 for cart + checkout)
```

Two of the e2e tests are the interesting ones: `lets exactly one of two
simultaneous checkouts win` (last unit in stock, two buyers, expects `[201, 409]`)
and `never oversells under a burst of concurrent buyers`.

## Order status & realtime (Step 8)

Each shop moves its own slice of an order through a state machine; the customer
watches it happen over a websocket.

```
ORDERED ──accept──▶ ACCEPTED ──▶ PACKING ──▶ READY_FOR_PICKUP
   │                                              │
   └──reject──▶ REJECTED (terminal)               ▼
                                       OUT_FOR_DELIVERY ──▶ DELIVERED (terminal)
```

The table lives in [`apps/api/src/orders/order-status.ts`](./apps/api/src/orders/order-status.ts)
and is the single source of truth: the API enforces it, the tests assert it, and
the vendor's buttons are rendered from the `allowedNext` array the API returns —
so the UI can never offer a move the server would reject with a 400.

**The master order has no status of its own.** It is derived from its children
every time one of them moves, so a partly rejected order cannot drift out of
sync:

| Vendor slices                | Master order          |
| ---------------------------- | --------------------- |
| all still working            | `PLACED`              |
| all delivered                | `COMPLETED`           |
| all rejected                 | `CANCELLED`           |
| mixed, or one finished early | `PARTIALLY_FULFILLED` |

Rejecting a slice **returns its stock to the shelf** inside the same
transaction that writes the status — otherwise units reserved at checkout would
be lost forever.

### Endpoints

| Method | Path                            | Role     | Purpose                                 |
| ------ | ------------------------------- | -------- | --------------------------------------- |
| GET    | `/api/vendor/orders?status=`    | VENDOR   | The shop's queue (own slices only)      |
| GET    | `/api/vendor/orders/stats`      | VENDOR   | Counts + delivered revenue              |
| GET    | `/api/vendor/orders/:id`        | VENDOR   | One slice, with the delivery address    |
| PATCH  | `/api/vendor/orders/:id/status` | VENDOR   | Advance it; `reason` required to reject |
| POST   | `/api/realtime/ticket`          | any user | Mint a socket handshake ticket          |

### Websocket authentication

The access token is httpOnly and belongs to the **web** origin, so browser JS
cannot read it and it is never sent to the API origin. Instead the browser asks
its own BFF for a **single-use, 60-second ticket** and presents that in the
handshake. A stolen ticket is worth one minute of read-only access to rooms the
user could already see.

Rooms: `user:<id>`, `vendor:<id>`, `order:<masterOrderId>`. Joining an order
room is authorised against the database, so a socket cannot watch a stranger's
order. All the rooms for one event are passed to `to()` in a single call, so a
customer who is in two of them still receives exactly one copy.

| Event               | Direction       | When                                  |
| ------------------- | --------------- | ------------------------------------- |
| `ready`             | server → client | Handshake accepted                    |
| `watchOrder`        | client → server | Subscribe to one order (acked)        |
| `order.created`     | server → vendor | A new order lands in the shop's queue |
| `order.status`      | server → client | A slice changed status                |
| `delivery.position` | server → client | Simulated driver moved                |

Events are emitted **after** the transaction commits, so a listener never sees a
state the database does not already hold, and a dropped socket can never fail
the HTTP request that caused the change.

### Simulated delivery

Marking a slice `OUT_FOR_DELIVERY` dispatches a stand-in driver: a timer
interpolates a straight line from the shop to the delivery address, emits
`delivery.position` every 3 s for ~45 s, then marks the order `DELIVERED`.
Real couriers would post GPS fixes to the same channel and a queue worker would
close the order; the timer keeps the demo self-contained.

Pages: `/vendor/orders` (live queue with action buttons) and the tracker on
`/orders/[id]`.

> The socket connects to the API origin directly, because a Next.js route
> handler cannot proxy a websocket upgrade. It is derived from the page origin
> (`:3000` → `:3001`) and can be overridden with `NEXT_PUBLIC_API_WS_URL`.

### Verify Step 8

```bash
npm run test -w @eplant/api      # 141 unit tests (49 for the machine + realtime)
npm run test:e2e -w @eplant/api  # 145 e2e tests (30 for status + sockets)
```

The e2e suite drives a real order with a real socket attached: it asserts
illegal transitions are refused, one shop cannot touch another's slice, a
rejection restocks, the master status is derived correctly, and a replayed
ticket is rejected.

## Payments (Step 9)

Two ways to pay, one order pipeline.

| Method     | What happens at checkout                                   | When it becomes the shop's problem  |
| ---------- | ---------------------------------------------------------- | ----------------------------------- |
| **COD**    | Order is `PLACED` immediately, payment row `COD`/`PENDING` | Straight away                       |
| **ONLINE** | Stock is reserved, order waits in `PENDING_PAYMENT`        | Only once a signed payment verifies |

An unpaid online order is **invisible to the vendor** — it is absent from the
queue, 404s on direct access, and cannot be advanced. That is the point of
`PENDING_PAYMENT`: the stock is held, but no shop starts packing something
nobody has paid for. A COD payment settles itself the moment the last shop
marks its slice delivered.

### Endpoints

| Method | Path                               | Role     | Purpose                               |
| ------ | ---------------------------------- | -------- | ------------------------------------- |
| GET    | `/api/payments/config`             | public   | Public key id for the browser widget  |
| POST   | `/api/orders/:id/payment/confirm`  | CUSTOMER | Verify what the widget returned       |
| POST   | `/api/orders/:id/payment/failed`   | CUSTOMER | Abandoned/declined → cancel + restock |
| POST   | `/api/orders/:id/payment/simulate` | CUSTOMER | Demo-only; 400 once real keys exist   |
| POST   | `/api/payments/webhook`            | public   | Razorpay's server-to-server signal    |

### What makes it trustworthy

Nothing the browser says is believed. A confirmation is accepted only if
`HMAC-SHA256(razorpay_order_id|razorpay_payment_id, key_secret)` matches, and
the order id used is the one **we stored**, never one the client supplied. A
failed check is recorded on the payment row rather than silently dropped.

The webhook is verified against the **raw request body** — re-serialising the
JSON would change the bytes and break the HMAC, which is why the app is
bootstrapped with `rawBody: true`.

Browser callback and webhook can both arrive. Both funnel into one guarded
`updateMany ... where status = 'PENDING'`, so exactly one of them transitions
the order and notifies the shops; the loser is a no-op. The same guard makes
"payment failed" idempotent, so stock is never returned twice.

### Running without Razorpay keys

`RazorpayGateway` has two implementations, chosen at startup:

- **live** — `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` are set; talks to the
  real test-mode API and opens the hosted checkout widget.
- **stub** — no keys; mints realistic `order_…` ids and signs with the _same_
  HMAC. Every signature check, webhook and race test still runs for real — only
  the HTTP call to Razorpay is faked.

So the whole flow is demonstrable offline, and `/payment/simulate` (the only
shortcut) refuses to work the instant real keys are configured.

```bash
# .env — leave blank to use the stub
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

### Verify Step 9

```bash
npx jest --config apps/api/test/jest-e2e.json payments   # 25 e2e tests
npx jest --config apps/api/package.json --rootDir apps/api src/payments  # 33 unit tests
```

The interesting ones: a forged signature leaves the order in
`PENDING_PAYMENT`, a tampered webhook body is rejected, an abandoned payment
returns every reserved unit, and a browser/webhook race notifies the shops once.

> **Known trade-off:** the cart is emptied when the order is created, so a
> customer who abandons payment gets a cancelled order rather than their cart
> back. Restoring the cart on failure would be the kinder behaviour; it is not
> built yet.

## Reviews & ratings (Step 10)

Only a customer who actually received the goods can rate a shop. The right to
review is derived from a `VendorOrder`, not granted by a flag:

- the order must belong to the caller — someone else's order answers **404**,
  never 403, so the API does not confirm that an order id exists;
- the order must be `DELIVERED` — anything earlier answers **400**;
- an optional `productId` must appear in that order's own lines, otherwise
  **400**. The web form builds its dropdown from the order, so it cannot ask
  for something the API would refuse.

Each delivered order therefore earns one shop-level review plus at most one
review per plant in it.

| Method | Path                      | Who         | Does                                                          |
| ------ | ------------------------- | ----------- | ------------------------------------------------------------- |
| GET    | `/api/reviews/shop/:slug` | public      | Paged reviews + average and a 5→1 star breakdown              |
| GET    | `/api/reviews/mine`       | customer    | `{ written, awaiting }` — delivered orders you can still rate |
| POST   | `/api/reviews`            | customer    | `{ vendorOrderId, productId?, rating 1-5, comment? }`         |
| PATCH  | `/api/reviews/:id`        | author only | Edit rating/comment                                           |
| DELETE | `/api/reviews/:id`        | author only | Remove it                                                     |

### Keeping the averages honest

`Vendor.ratingAvg/ratingCount` and `Product.ratingAvg/ratingCount` are
denormalised so listings can sort and filter without joining every review. Every
write **recomputes** them with an `aggregate` inside the same transaction rather
than nudging a running total — an edit from 5★ to 1★ or a deleted last review
would quietly corrupt an incremental counter, and a crash between the two
statements would leave the cached number lying forever. Deleting the last review
resets both fields to 0.

### Why a partial unique index

`@@unique([authorId, vendorOrderId, productId])` does not stop a customer
spamming shop-level reviews: `product_id` is `NULL` there, and Postgres treats
two NULLs as distinct, so the constraint never fires. An e2e test caught it.
Migration `20261001130000_one_shop_review_per_order` adds

```sql
CREATE UNIQUE INDEX "reviews_author_order_shop_level_key"
  ON "reviews"("author_id", "vendor_order_id")
  WHERE "product_id" IS NULL;
```

Both indexes surface as Prisma `P2002`, which the service maps to **409**.

### Verify Step 10

```bash
# log in, then drive an order to DELIVERED as the vendor, then:
curl -b c.txt localhost:3000/api/reviews/mine                      # awaiting[]
curl -b c.txt -X POST localhost:3000/api/reviews \
  -H 'content-type: application/json' \
  -d '{"vendorOrderId":"<id>","rating":5,"comment":"Healthy aloe"}'
curl -b c.txt -X POST localhost:3000/api/reviews \
  -H 'content-type: application/json' -d '{"vendorOrderId":"<id>","rating":1}'  # 409
curl localhost:3000/api/reviews/shop/lalbagh-green-nursery         # avg + breakdown
```

In the browser: **Reviews** in the header lists orders waiting to be rated, and
`/shops/<slug>` shows the shop's average, the star breakdown and per-plant stars.

## Admin console (Step 11)

`/admin` is gated twice: middleware keeps non-admins off the route, and every
`/api/admin/*` endpoint carries `@Roles('ADMIN')` so the API is not relying on
the UI to hide anything. Three tabs: dashboard, nurseries, users.

| Method | Path                         | Does                                                          |
| ------ | ---------------------------- | ------------------------------------------------------------- |
| GET    | `/api/admin/overview`        | Headline counters (users, shops, listings, orders, revenue)   |
| GET    | `/api/admin/analytics?days=` | Daily orders/revenue, top shops, pipeline split, best sellers |
| GET    | `/api/admin/vendors`         | `?status=all\|pending\|approved\|suspended&q=` paged          |
| PATCH  | `/api/admin/vendors/:id`     | `{ approved?, suspended? }`                                   |
| GET    | `/api/admin/users`           | `?role=&q=` paged                                             |
| PATCH  | `/api/admin/users/:id`       | `{ isActive }`                                                |
| GET    | `/api/admin/export/:dataset` | CSV download — `orders`, `vendors`, `users`, `products`       |

Charts are Recharts (`ComposedChart` for orders-vs-revenue, so counts and
rupees get their own axes instead of one flattening the other).

### Details that are easy to get wrong

- **Zero-filled days.** The daily series is built with `generate_series`
  left-joined onto orders, so a day with no trade still produces a point. Group
  by `placed_at` alone and a line chart quietly joins across the gap, turning a
  dead week into steady trade.
- **Revenue means money that cleared** — `SUM(payments.amount) WHERE status =
'PAID'`. Abandoned `PENDING_PAYMENT` checkouts are excluded from order counts
  everywhere in this module.
- **Moderation has teeth.** Suspending a shop removes it from discovery
  immediately (there is an e2e test that suspends, expects `/api/shops/:slug`
  to 404, then restores). Deactivating a user clears their refresh token hash,
  so the session dies now rather than at token expiry.
- **An admin cannot deactivate themselves** — 400, and the button is disabled.
- **Re-approving keeps the original `approvedAt`**, so the audit trail records
  when the shop was let in, not when a checkbox was last clicked.
- **CSV hardening.** Fields starting `=`, `+`, `-` or `@` are prefixed with an
  apostrophe: without it, a shop named `=HYPERLINK(...)` executes when an admin
  opens the export in Excel. The file also carries a UTF-8 BOM and CRLF line
  endings, and the users export contains no password or token columns.
  `Content-Disposition` is forwarded by the BFF proxy, otherwise the download
  renders in the tab.

### Verify Step 11

```bash
curl -b admin.txt localhost:3000/api/admin/overview
curl -b admin.txt 'localhost:3000/api/admin/analytics?days=7'
curl -b admin.txt -D - -o orders.csv localhost:3000/api/admin/export/orders
curl -b customer.txt localhost:3000/api/admin/overview      # 403
```

## Recommendations (Step 12)

Rule-based first, LLM strictly on top. Everything that decides _what_ to
recommend lives in `apps/api/src/recommendations/recommendation-rules.ts` as
pure functions — no Prisma, no Nest, no network — so the interesting logic is
covered by fast unit tests and can be read without tracing through a service.

| Method | Path                                         | Who    | Does                                          |
| ------ | -------------------------------------------- | ------ | --------------------------------------------- |
| GET    | `/api/recommendations?lat&lng&limit&explain` | anyone | Personalised when signed in, popular when not |
| GET    | `/api/recommendations/similar/:productId`    | anyone | Content-based "more like this"                |

One URL serves both audiences. `@Public()` routes now decode a bearer token
when one happens to be present (and ignore a bad one), so the home page can
call a single endpoint and get picks shaped by history for signed-in shoppers.

### How a pick is scored

A transparent weighted sum, every term of which produces a human-readable
reason that the card actually shows:

- **Taste match** — placement, light, water and care level, scored as the share
  of the customer's past purchases with that attribute; plus shared categories,
  pet-safe/air-purifying affinity, and a bonus for shops they rated 4★+.
- **Price fit** — distance in log-space from their _median_ spend (median, so
  one expensive palm does not drag the profile upmarket).
- **Quality** — a Bayesian average shrunk toward a 3.5 prior with the weight of
  five reviews, so a single 5★ listing cannot outrank a 4.6★ with forty.
- **Popularity** — `log1p(unitsSold)`, diminishing returns.
- **Proximity** — 1 at the doorstep, 0 beyond 15 km; candidates are dropped
  entirely if the shop does not deliver to the given point.
- **Low stock penalty** — a recommendation that 404s on the next click is worse
  than none.

Then three hard rules: never a plant they already own, never anything out of
stock, and never more than one listing per species or two per shop. Ten
monsteras from ten shops is not a recommendations page.

Cold start (no history) falls back to easy-care, well-rated and nearby.

### The LLM layer

`?explain=true` asks an LLM to rewrite the rule-based facts into one friendly
line. It never chooses or reorders the products: a hallucinated sentence is
cosmetic, a hallucinated ranking would surface out-of-stock or irrelevant
plants. With no `OPENAI_API_KEY` the module logs once at boot, binds a
`NullLlmGateway` and the endpoint simply returns the rule-based reasons — same
as payments, the project runs fully offline. The call has a 6 s abort, a
tolerant JSON parser, and any failure silently falls back.

### Verify Step 12

```bash
curl 'localhost:3000/api/recommendations?limit=3'                  # strategy: popular
curl -b customer.txt 'localhost:3000/api/recommendations?lat=12.9716&lng=77.5946'
curl 'localhost:3000/api/recommendations/similar/<productId>?limit=4'
```

In the browser: the home page shows "Popular right now" logged out and "Picked
for you" once you have bought something, and the cart suggests plants that go
with what is already in it.

## Useful scripts

| Command              | What it does                        |
| -------------------- | ----------------------------------- |
| `npm run dev`        | API + web together (concurrently)   |
| `npm run build`      | Build both apps                     |
| `npm run lint`       | ESLint on both apps                 |
| `npm run format`     | Prettier across the repo            |
| `npm run db:up`      | Start the PostGIS container         |
| `npm run db:down`    | Stop containers                     |
| `npm run db:reset`   | Drop the volume and recreate the DB |
| `npm run db:migrate` | `prisma migrate dev`                |
| `npm run db:studio`  | Prisma Studio                       |

## Environment variables

See [`.env.example`](./.env.example). Step 1 only needs:

| Variable                   | Purpose                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`             | Postgres connection string used by Prisma and the API           |
| `PORT`                     | API port (default 3001)                                         |
| `CORS_ORIGINS`             | Comma-separated allowed origins for the API                     |
| `API_BASE_URL`             | Where Next.js (server side + proxy) reaches the API             |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-side API base; empty = use the same-origin `/api` proxy |

> The browser never calls the API host directly: `next.config.ts` rewrites `/api/*` to
> `API_BASE_URL/api/*`. This keeps the setup working behind proxies, in containers and in
> cloud preview environments.

## Roadmap

- [x] **Step 1** — Monorepo, Docker/PostGIS, Prisma, health check, lint/format
- [x] **Step 2** — Database schema, migrations, seed data, ER diagram
- [x] **Step 3** — Auth & role-based access (JWT + guards + BFF cookies)
- [x] **Step 4** — Vendor dashboard & product CRUD
- [x] **Step 5** — Nearby nursery discovery (PostGIS + Leaflet)
- [x] **Step 6** — Search (full-text + `pg_trgm`)
- [x] **Step 7** — Cart & multi-vendor checkout
- [x] **Step 8** — Order status & realtime tracking
- [x] **Step 9** — Payments (Razorpay test mode + COD)
- [x] **Step 10** — Reviews & ratings
- [x] **Step 11** — Admin panel & analytics
- [x] **Step 12** — Plant recommendation (rules → LLM)
- [ ] **Step 13** — Plant identification from a photo
- [ ] **Step 14** — Hardening, docs, CI
- [ ] **Step 15** — Deployment
