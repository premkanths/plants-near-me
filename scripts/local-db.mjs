#!/usr/bin/env node
/**
 * Docker-free PostgreSQL for development.
 *
 * Runs PGlite (Postgres compiled to WASM) with the PostGIS and pg_trgm extensions
 * and exposes it on a normal TCP port, so Prisma, psql and the API can connect to
 * it exactly like a real server.
 *
 *   node scripts/local-db.mjs          # listens on 0.0.0.0:5432, data in .pglite/
 *   PGLITE_PORT=5433 node scripts/local-db.mjs
 *
 * Prefer `npm run db:up` (real PostgreSQL + PostGIS in Docker) when Docker is
 * available — this is the fallback for sandboxes and machines without Docker.
 */
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.PGLITE_PORT ?? 5432);
const host = process.env.PGLITE_HOST ?? '0.0.0.0';
const dataDir = process.env.PGLITE_DATA ?? './.pglite';

const db = await PGlite.create({ dataDir, extensions: { postgis, pg_trgm } });
await db.exec('CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;');

const { rows } = await db.query('SELECT postgis_version() AS version');
console.log(`PostGIS ${rows[0].version}`);

const server = new PGLiteSocketServer({ db, port, host, maxConnections: 20 });
await server.start();
console.log(`Local Postgres listening on ${host}:${port} (data: ${dataDir})`);
console.log(`DATABASE_URL="postgresql://postgres:postgres@localhost:${port}/postgres"`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
