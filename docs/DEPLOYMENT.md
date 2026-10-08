# Deploying E-PlantShopping 2.0

Three pieces, three free-tier hosts:

| Piece                    | Host                     | Why                                                             |
| ------------------------ | ------------------------ | --------------------------------------------------------------- |
| PostgreSQL + PostGIS     | **Neon**                 | only managed free Postgres with `postgis` + `pg_trgm` available |
| NestJS API (`apps/api`)  | **Render** (Web Service) | long-lived Node process — Socket.IO needs it                    |
| Next.js web (`apps/web`) | **Vercel**               | native Next 16 support, SSR + route handlers                    |

> The API **cannot** go on Vercel: `realtime.gateway.ts` holds persistent WebSocket
> connections and the simulated-delivery timers run in-process. Serverless functions
> are killed between requests.

Deploy in this order — each step needs the URL from the one before.

---

## 0. Before you start

Make sure the branch you want to deploy is pushed:

```bash
git push origin arena/01a0ed5a-plants-near-me
```

Generate two real secrets (don't reuse the dev ones in `.env.example`):

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

---

## 1. Database — Neon

1. neon.tech → sign in with GitHub → **Create project**
   - Name `eplant`, Postgres 16, region **AWS ap-southeast-1 (Singapore)** (lowest latency from India).
2. Copy both connection strings from **Connection Details**:
   - pooled → ends in `-pooler.<region>.aws.neon.tech`
   - direct → the same host without `-pooler`
3. Enable the extensions once, in the Neon **SQL Editor**:

   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

   `prisma/migrations/20260929140000_init` also issues these, but Neon wants
   them created by the project owner first.

4. Run the migrations and seed from your laptop (the API host doesn't need to):

   ```bash
   export DATABASE_URL="postgresql://…-pooler…/eplant?sslmode=require"
   npm run db:deploy        # prisma migrate deploy — all 5 migrations
   npm run db:seed          # 7 categories, 8 users, 5 vendors, 20 plants, 38 products
   ```

   Use the **direct** (non-pooler) URL if `migrate deploy` hangs — Prisma's
   advisory locks don't survive PgBouncer in transaction mode.

**Seeded demo logins** (password `Password123!`): `admin@eplant.test`,
`customer@eplant.test`, `lalbagh@eplant.test`. Change the admin password after
the first login if the URL is public.

---

## 2. API — Render

Render dashboard → **New → Web Service** → connect this repo.

| Setting           | Value                                          |
| ----------------- | ---------------------------------------------- |
| Branch            | `arena/01a0ed5a-plants-near-me`                |
| Root Directory    | _(leave blank — build from the monorepo root)_ |
| Runtime           | Node                                           |
| Build Command     | `npm install && npm run build -w @eplant/api`  |
| Start Command     | `node apps/api/dist/main.js`                   |
| Instance type     | Free                                           |
| Health Check Path | `/api/health`                                  |

`apps/api`'s `postinstall` runs `prisma generate`, so the client is built during
install — no extra step.

### Environment variables

| Key                                                   | Value                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                                            | `production`                                                                            |
| `DATABASE_URL`                                        | Neon **pooled** URL, must include `?sslmode=require`                                    |
| `JWT_ACCESS_SECRET`                                   | the first `openssl rand` output                                                         |
| `JWT_REFRESH_SECRET`                                  | the second one                                                                          |
| `JWT_ACCESS_TTL`                                      | `15m`                                                                                   |
| `JWT_REFRESH_TTL`                                     | `7d`                                                                                    |
| `CORS_ORIGINS`                                        | your Vercel URL, e.g. `https://eplant.vercel.app` — fill in after step 3, then redeploy |
| `CLOUDINARY_URL`                                      | `cloudinary://<key>:<secret>@<cloud>` — **required in production**                      |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | optional; blank keeps the stub gateway                                                  |
| `OPENAI_API_KEY`                                      | optional; blank keeps rule-based recommendation reasons                                 |

Don't set `PORT` — Render injects it and `main.ts` already reads it.

Note the service URL, e.g. `https://eplant-api.onrender.com`. Verify:

```bash
curl https://eplant-api.onrender.com/api/health
```

**Cloudinary is not optional here.** Without `CLOUDINARY_URL` the uploads
service falls back to local disk (`uploads/`), and Render's filesystem is
ephemeral — every vendor image vanishes on redeploy. Free tier at
cloudinary.com → Dashboard → copy the "API Environment variable".

**Free-tier caveat:** Render sleeps the service after 15 min idle; the next
request takes ~50 s to wake it and open sockets reconnect. Fine for a demo,
upgrade to Starter ($7/mo) if you're sharing the link with recruiters.

---

## 3. Web — Vercel

vercel.com → **Add New → Project** → import this repo.

| Setting              | Value                                                                             |
| -------------------- | --------------------------------------------------------------------------------- |
| Framework Preset     | Next.js                                                                           |
| Root Directory       | `apps/web`                                                                        |
| Build/Install/Output | leave as detected — Vercel sees the npm workspace and installs from the repo root |
| Production Branch    | `arena/01a0ed5a-plants-near-me` (Settings → Git)                                  |

### Environment variables

| Key                        | Value                             | Notes                                                                        |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `API_BASE_URL`             | `https://eplant-api.onrender.com` | **server-side only**; used by RSC + the `/api/[...path]` BFF proxy           |
| `NEXT_PUBLIC_API_WS_URL`   | `https://eplant-api.onrender.com` | browser Socket.IO target; `socket.io-client` upgrades `https` → `wss` itself |
| `NEXT_PUBLIC_API_BASE_URL` | _leave unset_                     | unset = browser uses the same-origin `/api` proxy, which is what you want    |

No trailing slashes on either URL.

Deploy, then go back to **Render → Environment** and set `CORS_ORIGINS` to the
Vercel production URL. Add the `*.vercel.app` preview URLs too if you want
preview deployments to work — it's a comma-separated list:

```
https://eplant.vercel.app,https://eplant-git-arena-you.vercel.app
```

---

## 4. Post-deploy checklist

Walk the whole flow on the live URL:

- [ ] `/` loads, health card shows the API as reachable
- [ ] register a customer → log in → `eplant_access` cookie is `Secure` + `HttpOnly`
- [ ] `/nearby` — allow location, Leaflet map renders, distances are sane
- [ ] `/search?q=moonsy` — trigram fuzzy match still returns Monstera
- [ ] add items from **two different vendors** → checkout COD → one master order splits into two vendor orders
- [ ] log in as `lalbagh@eplant.test` in a second browser → accept the order → the customer's `/orders/[id]` updates **without a refresh** (Socket.IO is alive)
- [ ] mark DELIVERED → customer can post a review → vendor's rating moves
- [ ] `/admin` as `admin@eplant.test` → charts render, CSV export downloads

If realtime is the only thing broken, it's almost always `CORS_ORIGINS` on
Render or a typo'd `NEXT_PUBLIC_API_WS_URL` — open the browser console and look
for the `/realtime` handshake 400.

---

## 5. Razorpay (optional)

Only needed if you want the real checkout instead of the stub:

1. Razorpay dashboard → **Test Mode** → Settings → API Keys → generate.
2. Put the key/secret in Render's env.
3. Webhooks → **Add New Webhook**
   - URL `https://eplant-api.onrender.com/api/payments/webhook`
   - Events `payment.captured`, `payment.failed`
   - Secret → same value as `RAZORPAY_WEBHOOK_SECRET`.

The webhook verifies an HMAC over the **raw** body, which is why `main.ts`
bootstraps with `rawBody: true`. Don't put a body-rewriting proxy in front of it.

---

## Costs

Everything above is $0: Neon free (0.5 GB), Render free (sleeps when idle),
Vercel Hobby, Cloudinary free (25 GB bandwidth). The only upgrade worth paying
for is Render Starter to kill the cold start.

## Custom domain

Vercel → Settings → Domains → add `shop.yourdomain.com`, point the CNAME at
`cname.vercel-dns.com`. Then update `CORS_ORIGINS` on Render to match.
