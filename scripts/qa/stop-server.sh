#!/usr/bin/env bash
# QA Server stop script — kills by PID file first, falls back to pkill.
set -euo pipefail

PID_FILE=/tmp/crloop-tmp/qa-server.pid

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped server (PID=$PID)"
  else
    echo "PID $PID not running (already stopped)"
  fi
  rm -f "$PID_FILE"
fi

# Always clean up any remaining child processes (npm spawns node children that
# survive a plain kill on the npm PID).
pkill -f "node scripts/dev.mjs" 2>/dev/null && echo "Killed remaining child processes" || true
