#!/usr/bin/env sh
set -eu

echo "[startup] Running database migrations..."
bun run scripts/migrate.ts

echo "[startup] Starting application..."
exec bun run start
