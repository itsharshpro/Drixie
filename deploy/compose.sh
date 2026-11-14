#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
[ -f .env ] || { echo "compose.sh: $repo/.env is missing (cp deploy/env.prod.example .env and fill it in)" >&2; exit 1; }
exec docker compose -f deploy/docker-compose.prod.yml --env-file .env "$@"
