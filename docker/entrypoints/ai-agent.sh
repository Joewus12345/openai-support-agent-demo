#!/bin/sh
set -e

# Defensive check: bail out early if any migration directories are missing their SQL file.
MISSING_MIGRATIONS=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d \
  ! -name "migration_lock.toml" \
  -print | while read dir; do
    if [ ! -f "$dir/migration.sql" ]; then
      echo "$dir"
    fi
  done)

if [ -n "$MISSING_MIGRATIONS" ]; then
  echo "Missing migration.sql in the following directories:"
  echo "$MISSING_MIGRATIONS"
  echo "Please rebuild the ai-agent image (e.g., docker compose build --no-cache ai-agent) so Prisma migrations are included."
  exit 1
fi

npx prisma migrate deploy
npm run start
