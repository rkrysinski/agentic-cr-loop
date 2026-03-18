#!/usr/bin/env bash
# QA Cleanup — removes all worktrees, branches, and temp files created during the test run.
# Safe to run even if some items no longer exist.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"

# Stop the server if still running
bash "$(dirname "$0")/stop-server.sh" || true

# Remove worktrees
for NAME in frontend backend shared-libs test-repo; do
  TARGET="/tmp/qa-repos/$NAME"
  if git -C "$REPO_ROOT" worktree list | grep -q "$TARGET"; then
    git -C "$REPO_ROOT" worktree remove --force "$TARGET"
    echo "Removed worktree: $TARGET"
  fi
done

# Delete QA branches
for BRANCH in qa/frontend qa/backend qa/shared-libs qa/test-repo; do
  if git -C "$REPO_ROOT" branch | grep -q "${BRANCH#qa/}" 2>/dev/null || \
     git -C "$REPO_ROOT" branch --list "$BRANCH" | grep -q "$BRANCH"; then
    git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null && echo "Deleted branch: $BRANCH" || true
  fi
done

# Remove temp directory
if [ -d /tmp/qa-repos ]; then
  rm -rf /tmp/qa-repos
  echo "Removed /tmp/qa-repos"
fi

# Remove log files
rm -f /tmp/qa-server.log /tmp/qa-server-multi.log /tmp/qa-server-zero.log \
       /tmp/qa-server-sole.log /tmp/qa-server-cli.log /tmp/qa-server.pid
echo "Removed log files"

echo "QA cleanup complete."
