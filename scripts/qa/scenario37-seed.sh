#!/usr/bin/env bash
# Scenario 37 — add an untracked file to shared-libs so there is a diff to comment on.
set -euo pipefail

TARGET=/tmp/qa-repos/shared-libs/qa-shared-test.txt

if [ ! -d /tmp/qa-repos/shared-libs ]; then
  echo "Error: /tmp/qa-repos/shared-libs not found. Run setup-multi-repo.sh first." >&2
  exit 1
fi

printf 'qa-shared-libs change\n' > "$TARGET"
echo "Seeded: $TARGET"
