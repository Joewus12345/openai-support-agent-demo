#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.scrapers"

if [[ -f "$ENV_FILE" ]]; then
  echo "Loading scraper environment variables from $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  echo "No $ENV_FILE file found. Create one to override scraper URLs."
fi

command -v python3 >/dev/null 2>&1 || { echo "python3 is required"; exit 1; }

create_env() {
  local env_dir="$1"
  local requirements_file="$2"

  if [[ ! -f "$requirements_file" ]]; then
    echo "Requirements file not found: $requirements_file" >&2
    exit 1
  fi

  if [[ ! -d "$env_dir" ]]; then
    echo "Creating virtual environment $env_dir"
    python3 -m venv "$env_dir"
  else
    echo "Using existing virtual environment $env_dir"
  fi

  # Choose correct activate script depending on OS (Windows vs Linux/Mac)
  ACTIVATE_SCRIPT="$env_dir/bin/activate"
  if [[ ! -f "$ACTIVATE_SCRIPT" ]]; then
    ACTIVATE_SCRIPT="$env_dir/Scripts/activate"
  fi

  if [[ ! -f "$ACTIVATE_SCRIPT" ]]; then
    echo "Could not find activate script in $env_dir (tried bin/activate and Scripts/activate)" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  source "$ACTIVATE_SCRIPT"
  python -m pip install --upgrade pip
  python -m pip install -r "$requirements_file"
  # python -m playwright install --with-deps chromium # --with-deps is mainly for Linux
  python -m playwright install chromium # chromium is mainly for Windows
  deactivate
}

create_env "$ROOT_DIR/.venv-c4ai-v1" "$ROOT_DIR/crawl4AI-agent/requirements.txt"
create_env "$ROOT_DIR/.venv-c4ai-v2" "$ROOT_DIR/crawl4AI-agent-v2/requirements.txt"

echo "Virtual environments ready."
