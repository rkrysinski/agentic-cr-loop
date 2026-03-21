#!/usr/bin/env bash
# QA Setup — single-repo mode (Scenarios 1–22)
# Creates /tmp/crloop-tmp/qa-repos/test-repo worktree and seeds scenario-specific files.
# Safe to re-run: skips steps already done.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
TEST_REPO=/tmp/crloop-tmp/qa-repos/test-repo

mkdir -p /tmp/crloop-tmp/qa-repos

if git -C "$REPO_ROOT" worktree list | grep -q "$TEST_REPO"; then
  echo "Worktree $TEST_REPO already exists, skipping."
else
  # Remove stale branch left over from a previous interrupted run
  git -C "$REPO_ROOT" branch -D qa/test-repo 2>/dev/null || true
  git -C "$REPO_ROOT" worktree add "$TEST_REPO" -b qa/test-repo HEAD
  echo "Worktree created: $TEST_REPO"
fi

# Scenario 14 — untracked file
if [ ! -f "$TEST_REPO/qa-untracked.txt" ]; then
  printf 'untracked content for QA\n' > "$TEST_REPO/qa-untracked.txt"
  echo "Seeded qa-untracked.txt"
fi

# Scenario 15 — renamed file (stage the rename so it shows in diff)
if [ -f "$TEST_REPO/README.md" ] && [ ! -f "$TEST_REPO/README-renamed.md" ]; then
  git -C "$TEST_REPO" mv README.md README-renamed.md
  echo "Staged rename: README.md -> README-renamed.md"
fi

# Scenario 16 — binary file
if [ ! -f "$TEST_REPO/qa-binary.bin" ]; then
  cp /bin/echo "$TEST_REPO/qa-binary.bin"
  echo "Seeded qa-binary.bin"
fi

# Scenario 17 — syntax highlighting: modified .ts file in working dir (unstaged)
TS_FILE="$TEST_REPO/src/server/hash.ts"
if [ -f "$TS_FILE" ] && ! grep -q 'qa-syntax-highlight' "$TS_FILE"; then
  printf '\n// qa-syntax-highlight\n' >> "$TS_FILE"
  echo "Seeded syntax-highlight modification: src/server/hash.ts"
fi

echo "Single-repo setup complete: $TEST_REPO"
