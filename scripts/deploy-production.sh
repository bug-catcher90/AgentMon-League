#!/usr/bin/env bash
# First-time production deploy (main branch).
# Prerequisites:
#   - .env with DATABASE_URL (managed Postgres) and optionally NEXT_PUBLIC_APP_URL, EMULATOR_ROM_DIR
#   - ./rom/PokemonRed.gb (or EMULATOR_ROM_DIR pointing to a directory that contains it)
# Run from repo root: ./scripts/deploy-production.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ]; then
  if [ -f .env ]; then
    set -a
    source .env
    set +a
  fi
fi
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set. Add it to .env or export it."
  exit 1
fi

echo "Running migrations..."
pnpm prisma migrate deploy

echo "Seeding database (template agent, seasons)..."
pnpm prisma db seed

ROM_DIR="${EMULATOR_ROM_DIR:-./rom}"
if [ ! -f "$ROM_DIR/PokemonRed.gb" ]; then
  echo "Warning: $ROM_DIR/PokemonRed.gb not found. Emulator will fail to start until the ROM is available."
  echo "Set EMULATOR_ROM_DIR in .env to the directory containing PokemonRed.gb (e.g. . for project root, or ./emulator)."
fi

echo "Building and starting containers..."
docker compose up -d --build

echo "Done. App: http://localhost:3000 (or https://agentmonleague.com if NEXT_PUBLIC_APP_URL is set)."
echo "Logs: docker compose logs -f"
