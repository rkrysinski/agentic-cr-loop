#!/usr/bin/env bash
# QA Server start script
# Usage: start-server.sh single|multi|zero
# Writes PID to /tmp/crloop-tmp/qa-server.pid and log to /tmp/crloop-tmp/qa-server.log
set -euo pipefail

MODE="${1:-}"
PROJ_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
LOG=/tmp/crloop-tmp/qa-server.log
PID_FILE=/tmp/crloop-tmp/qa-server.pid

case "$MODE" in
  single)
    CMD="npm run dev -- --repo /tmp/crloop-tmp/qa-repos/test-repo"
    ;;
  multi)
    CMD="npm run dev -- --repo frontend:/tmp/crloop-tmp/qa-repos/frontend --repo backend:/tmp/crloop-tmp/qa-repos/backend --repo shared-libs:/tmp/crloop-tmp/qa-repos/shared-libs"
    ;;
  zero)
    CMD="npm run dev"
    ;;
  *)
    echo "Usage: $0 single|multi|zero" >&2
    exit 1
    ;;
esac

cd "$PROJ_ROOT"
# Kill any existing process already bound to the API port (3000)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
# shellcheck disable=SC2086
$CMD > "$LOG" 2>&1 &
echo $! > "$PID_FILE"
echo "Server started (mode=$MODE, PID=$(cat "$PID_FILE"), log=$LOG)"
