#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$#" -lt 2 ]; then
  echo "usage: $0 <workspace-filter> [-D] <pkg...>" >&2
  exit 2
fi
FILTER="$1"; shift
LOCK=".data/.pnpm-lock-dir"
mkdir -p .data
for i in $(seq 1 600); do
  if mkdir "$LOCK" 2>/dev/null; then
    trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
    pnpm add --filter "$FILTER" "$@"
    exit $?
  fi
  sleep 1
done
echo "timed out waiting for dependency lock ($LOCK); remove it if no install is running" >&2
exit 1
