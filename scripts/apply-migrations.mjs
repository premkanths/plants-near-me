#!/usr/bin/env node
/**
 * Applies `prisma/migrations/*` directly over a normal Postgres connection and
 * records them in `_prisma_migrations`, exactly like `prisma migrate deploy`.
 *
 * Use `npm run db:migrate` (the real Prisma CLI) whenever you can. This script
 * exists for environments where Prisma's migration engine binary cannot be
 * downloaded (offline machines, locked-down CI, this sandbox) — it keeps the
 * bookkeeping compatible, so `prisma migrate status` stays happy afterwards.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: ['.env', '../.env'], quiet: true });

const MIGRATIONS_DIR = path.resolve('apps/api/prisma/migrations');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set — copy .env.example to .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);

const applied = new Set(
  (
    await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
    )
  ).rows.map((r) => r.migration_name),
);

const migrations = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((entry) => fs.statSync(path.join(MIGRATIONS_DIR, entry)).isDirectory())
  .sort();

let count = 0;
for (const name of migrations) {
  if (applied.has(name)) {
    console.log(`↷ ${name} (already applied)`);
    continue;
  }

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), 1)`,
      [crypto.randomUUID(), createHash('sha256').update(sql).digest('hex'), name],
    );
    await client.query('COMMIT');
    console.log(`✅ ${name}`);
    count++;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ ${name}: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(count === 0 ? 'Database already up to date.' : `Applied ${count} migration(s).`);
await client.end();
