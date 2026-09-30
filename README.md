# 🌱 E-PlantShopping 2.0 — Multi-Vendor Plant Marketplace

Find nurseries near you, shop across multiple vendors in one cart, and track every order live.

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | Next.js 16 (TypeScript, App Router) + Tailwind CSS 4        |
| Backend  | NestJS 11 (TypeScript)                                      |
| Database | PostgreSQL 16 + PostGIS 3.4 (+ `pg_trgm`, `pgvector` later) |
| ORM      | Prisma 7 (driver adapter: `@prisma/adapter-pg`)             |
| Maps     | Leaflet + OpenStreetMap _(Step 5)_                          |
| Auth     | JWT (access+refresh) + role guards (CUSTOMER / VENDOR / ADMIN) |
| Realtime | Socket.IO _(Step 8)_                                        |
| Payments | Razorpay test mode _(Step 9)_                               |
| Images   | Cloudinary _(Step 4)_                                       |
| AI       | Plant.id / PlantNet + LLM API _(Steps 12–13)_               |
| Dev/CI   | Docker Compose, GitHub Actions _(Step 14)_                  |

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

| Endpoint                        | Auth       | Purpose                                     |
| ------------------------------- | ---------- | ------------------------------------------- |
| `POST /api/auth/register`        | public     | Customer sign-up (also creates their cart)  |
| `POST /api/auth/register/vendor` | public     | Vendor sign-up → Vendor profile `approved=false` |
| `POST /api/auth/login`           | public     | Returns access + refresh tokens             |
| `POST /api/auth/refresh`         | public     | Rotates the token pair                      |
| `POST /api/auth/logout`          | bearer     | Invalidates the stored refresh token        |
| `GET  /api/auth/me`              | bearer     | Current profile                             |

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

| Endpoint                                | Role   | Purpose                             |
| --------------------------------------- | ------ | ----------------------------------- |
| `GET    /api/vendor/products`            | VENDOR | Own products (search, paging)       |
| `GET    /api/vendor/products/stats`      | VENDOR | Counts + inventory value            |
| `POST   /api/vendor/products`            | VENDOR | Create listing                      |
| `GET/PATCH/DELETE /api/vendor/products/:id` | VENDOR | Read / edit / remove own listing |
| `PATCH  /api/vendor/products/:id/stock`  | VENDOR | Quick restock                       |
| `GET/PATCH /api/vendor/profile`          | VENDOR | Shop details, delivery radius & fee |
| `POST   /api/uploads/product-image`      | VENDOR | Image upload (≤5 MB, image types)   |
| `GET    /api/plants`                     | public | Species catalogue for the form      |

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
- [ ] **Step 5** — Nearby nursery discovery (PostGIS + Leaflet)
- [ ] **Step 6** — Search (full-text + `pg_trgm`)
- [ ] **Step 7** — Cart & multi-vendor checkout
- [ ] **Step 8** — Order status & realtime tracking
- [ ] **Step 9** — Payments (Razorpay)
- [ ] **Step 10** — Reviews & ratings
- [ ] **Step 11** — Admin panel & analytics
- [ ] **Step 12** — Plant recommendation (rules → LLM)
- [ ] **Step 13** — Plant identification from a photo
- [ ] **Step 14** — Hardening, docs, CI
- [ ] **Step 15** — Deployment
