#!/usr/bin/env bash
# Scenario 20 — commit all working-dir changes in test-repo to change HEAD.
# This is used to test comment carry-forward behaviour.
set -euo pipefail

TEST_REPO=/tmp/qa-repos/test-repo

if [ ! -d "$TEST_REPO/.git" ] && [ ! -f "$TEST_REPO/.git" ]; then
  echo "Error: $TEST_REPO is not a git repo." >&2
  exit 1
fi

git -C "$TEST_REPO" add -A
git -C "$TEST_REPO" commit -m "qa-carry-forward-test"
echo "Committed in $TEST_REPO"
git -C "$TEST_REPO" log --oneline -3
