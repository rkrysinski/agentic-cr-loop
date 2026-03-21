#!/usr/bin/env bash
# Scenario 19 — modify qa-untracked.txt so the existing comment becomes outdated.
set -euo pipefail

TARGET=/tmp/crloop-tmp/qa-repos/test-repo/qa-untracked.txt

if [ ! -f "$TARGET" ]; then
  echo "Error: $TARGET not found. Run setup-single-repo.sh first." >&2
  exit 1
fi

printf 'modified content - line changed for QA outdated test\n' > "$TARGET"
echo "Modified: $TARGET"
