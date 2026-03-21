#!/usr/bin/env bash
# QA — wait for the dev server to become ready, then print the log tail.
# Polls the API endpoint rather than sleeping a fixed amount.
set -euo pipefail

LOG=/tmp/crloop-tmp/qa-server.log
MAX_WAIT=30  # seconds
INTERVAL=1

echo "Waiting for server (max ${MAX_WAIT}s)..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -sf http://localhost:3000/api/repos > /dev/null 2>&1; then
    echo "Server ready after ${i}s"
    tail -5 "$LOG"
    exit 0
  fi
  sleep "$INTERVAL"
done

echo "Server did not become ready within ${MAX_WAIT}s" >&2
tail -20 "$LOG" >&2
exit 1
