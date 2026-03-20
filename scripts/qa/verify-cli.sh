#!/usr/bin/env bash
# QA — CLI verification (Scenario 44)
# Exercises every crloop command and error path against a live server on port 3009.
# Exits 0 if all assertions pass, 1 if any fail.
# Safe to run standalone; manages its own server lifecycle.
set -uo pipefail
# Ensure Homebrew binaries (git, node) are available to child processes
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PORT=3009
BASE_URL="http://localhost:$PORT"
SERVER_PID=""
PASS=0
FAIL=0
REPO_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
REPO_A=/tmp/qa-cli-repo-a
REPO_B=/tmp/qa-cli-repo-b
REPO_C=/tmp/qa-cli-repo-c

# ── Helpers ──────────────────────────────────────────────────────────────────

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

assert_exit0() {
  local label="$1"; shift
  if "$@" > /tmp/qa-cli-out.txt 2>&1; then
    pass "$label"
  else
    fail "$label  (exit $?, output: $(cat /tmp/qa-cli-out.txt))"
  fi
}

assert_exit1() {
  local label="$1"; shift
  if ! "$@" > /tmp/qa-cli-out.txt 2>&1; then
    pass "$label"
  else
    fail "$label  (expected exit 1, got 0)"
  fi
}

assert_output_contains() {
  local label="$1"
  local pattern="$2"
  if grep -q "$pattern" /tmp/qa-cli-out.txt; then
    pass "$label"
  else
    fail "$label  (pattern '$pattern' not found in: $(cat /tmp/qa-cli-out.txt))"
  fi
}

run_capturing() {
  "$@" > /tmp/qa-cli-out.txt 2>&1
}

# ── Setup ─────────────────────────────────────────────────────────────────────

setup() {
  echo "--- Setup ---"

  for repo in "$REPO_A" "$REPO_B" "$REPO_C"; do
    rm -rf "$repo"
    mkdir -p "$repo"
    git -C "$repo" init -q
    git -C "$repo" commit --allow-empty -q -m "init"
  done

  # Build if dist is missing
  if [ ! -f "$REPO_ROOT/dist/server/server/cli.js" ]; then
    echo "dist not found — building..."
    npm --prefix "$REPO_ROOT" run build:server > /dev/null 2>&1
  fi

  # Ensure crloop binary is on PATH via npm link
  if ! command -v crloop > /dev/null 2>&1; then
    echo "crloop not on PATH — running npm link..."
    npm --prefix "$REPO_ROOT" link > /dev/null 2>&1
  fi
}

start_server() {
  local output
  output=$(crloop serve --repo "a:$REPO_A" --port "$PORT" 2>&1)
  SERVER_PID=$(echo "$output" | grep -oE 'pid [0-9]+' | grep -oE '[0-9]+' || true)

  local waited=0
  while ! curl -sf "$BASE_URL/api/repos" > /dev/null 2>&1; do
    sleep 0.3
    waited=$((waited + 1))
    if [ "$waited" -gt 30 ]; then
      echo "Server did not start within 9s" >&2
      echo "$output" >&2
      exit 1
    fi
  done
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}

cleanup() {
  stop_server
  rm -rf "$REPO_A" "$REPO_B" "$REPO_C" /tmp/qa-cli-out.txt /tmp/qa-cli-server.log
}

trap cleanup EXIT

setup

# ── Section 1: flags that must exit immediately without starting a server ─────

echo ""
echo "--- 1. --version and --help (no server needed) ---"

run_capturing crloop --version
assert_output_contains "--version prints a version string"  "\."
# version string must match package.json
PKG_VERSION=$(node -p "require('$REPO_ROOT/package.json').version")
run_capturing crloop --version
assert_output_contains "--version matches package.json ($PKG_VERSION)" "$PKG_VERSION"

run_capturing crloop --help
assert_output_contains "--help prints usage header" "crloop"
assert_output_contains "--help documents 'serve' command" "serve"
assert_output_contains "--help documents 'repos' command" "repos"
assert_output_contains "--help documents 'add-repo' command" "add-repo"
assert_output_contains "--help documents 'remove-repo' command" "remove-repo"
assert_output_contains "--help documents 'stop-server' command" "stop-server"
assert_output_contains "--help documents 'schema' command" "schema"
assert_output_contains "--help documents '--json' flag" "\-\-json"
assert_output_contains "--help documents '--dry-run' flag" "\-\-dry\-run"

run_capturing crloop -h
assert_output_contains "-h alias works" "crloop"

# ── Section 2: serve flag validation (no running server needed) ───────────────

echo ""
echo "--- 2. serve — startup errors ---"

assert_exit1 "--port non-numeric rejected"         crloop serve --port abc
run_capturing crloop serve --port abc || true
assert_output_contains "--port non-numeric error message"  "Invalid --port"

assert_exit1 "--port zero rejected"                crloop serve --port 0
assert_exit1 "duplicate --repo ids rejected"       crloop serve --repo "$REPO_A" --repo "$REPO_A" --port "$PORT"
run_capturing crloop serve --repo "$REPO_A" --repo "$REPO_A" --port "$PORT" || true
assert_output_contains "duplicate --repo error message"   "Duplicate repo id"

# ── Section 3: unknown command ────────────────────────────────────────────────

echo ""
echo "--- 3. unknown command ---"

assert_exit1 "unknown command exits 1"  crloop bogus-command
run_capturing crloop bogus-command || true
assert_output_contains "unknown command error message"     "Unknown command"
assert_output_contains "unknown command suggests --help"   "\-\-help"

# ── Section 3b: schema command (no server needed) ─────────────────────────────

echo ""
echo "--- 3b. schema command ---"

assert_exit0 "schema exits 0" crloop schema
if node -e "JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'))" 2>/dev/null; then
  pass "schema outputs valid JSON"
else
  fail "schema output is not valid JSON ($(cat /tmp/qa-cli-out.txt))"
fi

assert_exit0 "schema add-repo exits 0" crloop schema add-repo
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(!r.options)throw new Error()" 2>/dev/null; then
  pass "schema add-repo output has 'options' key"
else
  fail "schema add-repo output missing 'options' key ($(cat /tmp/qa-cli-out.txt))"
fi

# ── Section 3c: --dry-run flag (no server needed) ─────────────────────────────

echo ""
echo "--- 3c. --dry-run flag ---"

assert_exit0 "add-repo --dry-run exits 0" crloop add-repo "$REPO_C" --dry-run
run_capturing crloop add-repo "$REPO_C" --dry-run
assert_output_contains "add-repo --dry-run prints 'Would register'" "Would register"

run_capturing crloop add-repo "$REPO_C" --dry-run --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(r.dryRun!==true)throw new Error()" 2>/dev/null; then
  pass "add-repo --dry-run --json outputs {dryRun:true}"
else
  fail "add-repo --dry-run --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi

assert_exit0 "remove-repo --dry-run exits 0" crloop remove-repo any-id --dry-run
run_capturing crloop remove-repo any-id --dry-run
assert_output_contains "remove-repo --dry-run prints 'Would remove'" "Would remove"

run_capturing crloop remove-repo any-id --dry-run --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(r.dryRun!==true)throw new Error()" 2>/dev/null; then
  pass "remove-repo --dry-run --json outputs {dryRun:true}"
else
  fail "remove-repo --dry-run --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi

# ── Section 4: live server — repos, add-repo, remove-repo ────────────────────

echo ""
echo "--- 4. live server commands ---"
start_server

# repos — server started with repo-a as 'a'
run_capturing crloop repos --url "$BASE_URL"
assert_exit0     "repos exits 0"                           crloop repos --url "$BASE_URL"
assert_output_contains "repos lists startup repo id"       "^a"

# add-repo — auto-derived id
assert_exit0     "add-repo exits 0 (auto-id)"              crloop add-repo "$REPO_B" --url "$BASE_URL"
run_capturing crloop repos --url "$BASE_URL"
assert_output_contains "repos shows newly added repo"      "qa-cli-repo-b"

# add-repo — explicit --id
assert_exit0     "add-repo exits 0 (explicit --id)"        crloop add-repo "$REPO_A" --id custom-id --url "$BASE_URL"
run_capturing crloop repos --url "$BASE_URL"
assert_output_contains "repos shows custom-id"             "custom-id"

# remove-repo
assert_exit0     "remove-repo exits 0"                     crloop remove-repo custom-id --url "$BASE_URL"
run_capturing crloop repos --url "$BASE_URL"
if grep -q "custom-id" /tmp/qa-cli-out.txt; then
  fail "removed repo no longer appears in repos list"
else
  pass "removed repo no longer appears in repos list"
fi

# repos — column alignment check (all ids present, padded)
run_capturing crloop repos --url "$BASE_URL"
assert_output_contains "repos output contains 'a'" "^a"
assert_output_contains "repos output contains derived id" "qa-cli-repo-b"

# --json output
run_capturing crloop repos --url "$BASE_URL" --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(!Array.isArray(r)||!r[0].id)throw new Error()" 2>/dev/null; then
  pass "repos --json outputs valid JSON array with id/path"
else
  fail "repos --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi

assert_exit0 "add-repo --json exits 0" crloop add-repo "$REPO_C" --id json-c --url "$BASE_URL" --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(r.id!=='json-c')throw new Error()" 2>/dev/null; then
  pass "add-repo --json outputs {id, path}"
else
  fail "add-repo --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi

assert_exit0 "remove-repo --json exits 0" crloop remove-repo json-c --url "$BASE_URL" --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(r.id!=='json-c')throw new Error()" 2>/dev/null; then
  pass "remove-repo --json outputs {id}"
else
  fail "remove-repo --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi

# ── Section 5: error paths against live server ───────────────────────────────

echo ""
echo "--- 5. error paths (live server) ---"

# add-repo — duplicate id
assert_exit1     "add-repo duplicate id exits 1"           crloop add-repo "$REPO_B" --url "$BASE_URL"
run_capturing crloop add-repo "$REPO_B" --url "$BASE_URL" || true
assert_output_contains "add-repo duplicate id error"       "already in use"

# add-repo — invalid path (not a git repo)
assert_exit1     "add-repo non-git path exits 1"           crloop add-repo /tmp --url "$BASE_URL"
run_capturing crloop add-repo /tmp --url "$BASE_URL" || true
assert_output_contains "add-repo non-git path error"       "Not a git repository"

# add-repo — missing path argument
assert_exit1     "add-repo missing path exits 1"           crloop add-repo --url "$BASE_URL"
run_capturing crloop add-repo --url "$BASE_URL" || true
assert_output_contains "add-repo missing path shows usage" "Usage:"

# remove-repo — non-existent id
assert_exit1     "remove-repo non-existent id exits 1"     crloop remove-repo does-not-exist --url "$BASE_URL"
run_capturing crloop remove-repo does-not-exist --url "$BASE_URL" || true
assert_output_contains "remove-repo not-found error"       "not found"

# ── Section 5b: stop-server ───────────────────────────────────────────────────

echo ""
echo "--- 5b. stop-server ---"

assert_exit0     "stop-server --json exits 0"              crloop stop-server --url "$BASE_URL" --json
if node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/qa-cli-out.txt','utf8'));if(r.stopped!==true)throw new Error()" 2>/dev/null; then
  pass "stop-server --json outputs {stopped:true}"
else
  fail "stop-server --json output malformed ($(cat /tmp/qa-cli-out.txt))"
fi
SERVER_PID=""
assert_exit1     "server is down after stop-server"        crloop repos --url "$BASE_URL"
assert_output_contains "stop-server leaves server unreachable"  "Connection failed"

# ── Section 6: serve name:path syntax ────────────────────────────────────────

echo ""
echo "--- 6. serve name:path syntax ---"

OUTPUT=$(crloop serve --repo "fe:$REPO_A" --repo "be:$REPO_B" --port "$PORT" 2>&1)
SERVER_PID=$(echo "$OUTPUT" | grep -oE 'pid [0-9]+' | grep -oE '[0-9]+' || true)
waited=0
while ! curl -sf "$BASE_URL/api/repos" > /dev/null 2>&1; do
  sleep 0.3; waited=$((waited+1))
  [ "$waited" -gt 30 ] && { echo "Server did not start" >&2; exit 1; }
done

run_capturing crloop repos --url "$BASE_URL"
assert_output_contains "name:path produces 'fe' id"  "^fe"
assert_output_contains "name:path produces 'be' id"  "^be"

stop_server

# ── Section 7: connection failure ────────────────────────────────────────────

echo ""
echo "--- 7. connection failure ---"

assert_exit1     "repos fails when server is down"         crloop repos --url "$BASE_URL"
run_capturing crloop repos --url "$BASE_URL" || true
assert_output_contains "repos connection failure message"  "Connection failed"

assert_exit1     "add-repo fails when server is down"      crloop add-repo "$REPO_A" --url "$BASE_URL"
assert_exit1     "remove-repo fails when server is down"   crloop remove-repo a --url "$BASE_URL"
assert_exit1     "stop-server fails when server is down"   crloop stop-server --url "$BASE_URL"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "========================================="
echo "  CLI verification: $PASS passed, $FAIL failed"
echo "========================================="
[ "$FAIL" -eq 0 ]
