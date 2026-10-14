# 🚀 E-PlantShopping 2.0 — Production Deployment Guide

This guide details how to deploy **E-PlantShopping 2.0** to cloud providers (**Vercel**, **Render**, **Railway**, **Supabase**, or **Docker**).

---

## 🏗️ Architecture Overview

The repository is organized as an **npm monorepo**:

- **Frontend (`apps/web`)**: Next.js 16 (React 19, Tailwind CSS 4, Leaflet maps).
- **Backend (`apps/api`)**: NestJS 11 (Prisma 7, Socket.IO, JWT Auth, Razorpay integration).
- **Database**: PostgreSQL 16 + PostGIS extension (for location-based nursery discovery).

---

## 🌐 Option 1: Vercel + Render + Supabase (Free Tier Friendly - Recommended)

### Step 1: Set Up PostgreSQL + PostGIS (Supabase / Render Postgres)

1. Create a free PostgreSQL database on [Supabase](https://supabase.com) or [Neon](https://neon.tech) or [Render](https://render.com).
2. Ensure **PostGIS** extension is enabled on the database:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
3. Copy your database connection string `DATABASE_URL`:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require"
   ```

---

### Step 2: Deploy Backend (`apps/api`) on Render / Railway

1. Connect your GitHub repository to [Render](https://render.com) or [Railway](https://railway.app).
2. Create a new **Web Service**:
   - **Root Directory**: `apps/api`
   - **Build Command**: 
     ```bash
     npm install && npx prisma generate && npx nest build
     ```
   - **Start Command**: 
     ```bash
     node dist/main
     ```
3. Set Environment Variables:
   ```env
   PORT=3001
   NODE_ENV=production
   DATABASE_URL="your-supabase-db-url"
   JWT_ACCESS_SECRET="generate-a-strong-random-secret-key-32-chars"
   JWT_REFRESH_SECRET="generate-a-second-strong-random-secret-key-32-chars"
   FRONTEND_URL="https://your-app.vercel.app"
   ```
4. Deploy service and run database migrations:
   ```bash
   npm run prisma:deploy -w @eplant/api
   npm run db:seed -w @eplant/api
   ```

---

### Step 3: Deploy Frontend (`apps/web`) on Vercel

1. Log in to [Vercel](https://vercel.com) and click **Add New Project**.
2. Select your repository.
3. Configure Project settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npx next build`
   - **Output Directory**: `.next`
4. Set Environment Variables in Vercel settings:
   ```env
   NEXT_PUBLIC_API_BASE_URL="https://your-api-service.onrender.com"
   API_BASE_URL="https://your-api-service.onrender.com"
   ```
5. Click **Deploy**.

---

## 🐳 Option 2: 1-Click Docker Compose Deployment (VPS / DigitalOcean / AWS)

If deploying to an AWS EC2 instance, DigitalOcean Droplet, or Linode server:

```bash
# 1. Clone repo onto your server
git clone <your-repo-url>
cd plants-near-me-main/plants-near-me-main

# 2. Copy and configure environment variables
cp .env.example .env

# 3. Build & start all services (PostgreSQL, PostGIS, NestJS API, Next.js Web)
docker compose up -d --build

# 4. Run initial database migration & seed sample nurseries
docker compose exec api npx prisma migrate deploy
docker compose exec api npx ts-node prisma/seed.ts
```

Your app will be live at `http://your-server-ip:3000`!

---

## 🧪 Option 3: Local Standalone Demo Mode (`npm run db:local`)

You can run the full PostgreSQL database locally without Docker using embedded PGlite:

```bash
# 1. Start local WASM Postgres with PostGIS
npm run db:local &

# 2. Run migrations and seed data
npm run db:migrate && npm run db:seed

# 3. Start dev servers
npm run dev
```

---

## 🔑 Default Demo Login Accounts (After Seeding)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@eplant.test` | `Password123!` |
| **Customer** | `customer@eplant.test` | `Password123!` |
| **Vendor (Lalbagh Nursery)** | `lalbagh@eplant.test` | `Password123!` |
