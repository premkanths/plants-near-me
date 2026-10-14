#!/usr/bin/env bash
# One-shot development bootstrap: env file, dependencies, Prisma client,
# database schema and demo data. Safe to re-run.
#
#   ./scripts/dev-setup.sh              # uses Docker (npm run db:up)
#   USE_LOCAL_DB=1 ./scripts/dev-setup.sh   # uses the PGlite fallback instead
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ env"
[ -f .env ] || cp .env.example .env

echo "▸ dependencies"
npm install --silent

echo "▸ prisma client"
npm run db:generate --silent

if [ "${USE_LOCAL_DB:-0}" = "1" ]; then
  echo "▸ starting PGlite (no Docker) on :5432"
  sed -i.bak 's|postgresql://eplant:eplant@|postgresql://postgres:postgres@|; s|@localhost:5432/eplant|@localhost:5432/postgres|' .env && rm -f .env.bak
  (node scripts/local-db.mjs &) 
  sleep 6
  node scripts/apply-migrations.mjs
else
  echo "▸ starting PostgreSQL + PostGIS (docker)"
  npm run db:up
  sleep 5
  npm run db:migrate
fi

echo "▸ seeding"
npm run db:seed

echo
echo "✅ Ready. Start the apps with:  npm run dev"
