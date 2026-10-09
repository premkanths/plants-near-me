import { config } from 'dotenv';

// Single source of truth for env vars: the repo-root .env (falls back to apps/api/.env)
config({ path: ['.env', '../../.env'], quiet: true });
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 keeps the connection URL out of schema.prisma.
 * Migration/introspection commands read it from here; the runtime client
 * gets it through the pg driver adapter (src/prisma/prisma.service.ts).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
