# 🌱 E-PlantShopping 2.0 — Multi-Vendor Plant Marketplace

Find nurseries near you, shop across multiple vendors in one cart, and track every order live.

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | Next.js 16 (TypeScript, App Router) + Tailwind CSS 4        |
| Backend  | NestJS 11 (TypeScript)                                      |
| Database | PostgreSQL 16 + PostGIS 3.4 (+ `pg_trgm`, `pgvector` later) |
| ORM      | Prisma 7 (driver adapter: `@prisma/adapter-pg`)             |
| Maps     | Leaflet + OpenStreetMap _(Step 5)_                          |
| Auth     | JWT + role guards (CUSTOMER / VENDOR / ADMIN) _(Step 3)_    |
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

# 5. Run both apps (API :3001, web :3000)
npm run dev
```

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
- [ ] **Step 2** — Database schema, migrations, seed data, ER diagram
- [ ] **Step 3** — Auth & role-based access
- [ ] **Step 4** — Vendor dashboard & product CRUD
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
