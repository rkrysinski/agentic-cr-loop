#!/usr/bin/env bash
# Scenario 20 — undo the qa-carry-forward-test commit and re-stage the rename.
set -euo pipefail

TEST_REPO=/tmp/qa-repos/test-repo

git -C "$TEST_REPO" reset --soft HEAD~1
git -C "$TEST_REPO" reset HEAD .
# Re-stage the rename so README-renamed.md still appears as a rename diff
git -C "$TEST_REPO" add README-renamed.md README.md 2>/dev/null || true
echo "Reverted carry-forward commit in $TEST_REPO"
git -C "$TEST_REPO" status --short
