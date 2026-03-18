#!/usr/bin/env bash
# Scenario 19 — restore qa-untracked.txt to its original seed content.
set -euo pipefail

TARGET=/tmp/qa-repos/test-repo/qa-untracked.txt
printf 'untracked content for QA\n' > "$TARGET"
echo "Restored: $TARGET"
