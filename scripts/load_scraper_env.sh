#!/usr/bin/env sh
# shellcheck shell=sh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRAPER_ENV_FILE="${SCRAPER_ENV_FILE:-$PROJECT_ROOT/.env.scrapers}"

if [ ! -f "$SCRAPER_ENV_FILE" ]; then
  return 0 2>/dev/null || exit 0
fi

set -a
. "$SCRAPER_ENV_FILE"
set +a
