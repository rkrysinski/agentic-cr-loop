#!/usr/bin/env bash
# QA Setup — multi-repo mode (Scenarios 23–38)
# Creates frontend, backend, shared-libs worktrees under /tmp/crloop-tmp/qa-repos.
# Safe to re-run: skips worktrees that already exist.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"

mkdir -p /tmp/crloop-tmp/qa-repos

for NAME in frontend backend shared-libs; do
  TARGET="/tmp/crloop-tmp/qa-repos/$NAME"
  if git -C "$REPO_ROOT" worktree list | grep -q "$TARGET"; then
    echo "Worktree $TARGET already exists, skipping."
  else
    git -C "$REPO_ROOT" worktree add "$TARGET" -b "qa/$NAME" HEAD
    echo "Worktree created: $TARGET"
  fi
done

echo "Multi-repo setup complete: frontend, backend, shared-libs"
