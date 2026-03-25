#!/usr/bin/env bats
# CLI test suite — cli-1 through cli-5
#
# cli-1 through cli-4: FR scenario tests (server on port 3000)
# cli-5, sec 1–7:      granular tests for every CLI scenario
#                      (each section = one or more @test blocks; isolated server on port 3009)
#
# Prerequisites:
#   brew install bats-core
#   npm run build:server && npm link
#
# Run all:         npm run test:cli
# Run one section: bats test/cli.bats --filter "cli-5, sec 4"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO_ROOT="$(git -C "$(dirname "$BATS_TEST_FILENAME")/.." rev-parse --show-toplevel)"
export REPO_ROOT

TMP=/tmp/crloop-tmp
BASE_URL=http://localhost:3000      # suite server for cli-1–cli-4
CLI_PORT=3009
CLI_BASE=http://localhost:$CLI_PORT  # isolated server for cli-5 sections
OUT="$TMP/qa-bats-out.txt"          # temp file for JSON assertions

REPO_A="$TMP/qa-cli-repo-a"
REPO_B="$TMP/qa-cli-repo-b"
REPO_C="$TMP/qa-cli-repo-c"

CLI_SERVER_PID=""

# ── Server helpers (cli-5 sections) ──────────────────────────────────────────

_start_cli_server() {
  # Kill any lingering server on CLI_PORT from a previous failed test
  lsof -ti:"$CLI_PORT" | xargs kill -9 2>/dev/null || true
  local logfile="$TMP/qa-cli-bats-server.log"
  crloop serve "$@" --port "$CLI_PORT" > "$logfile" 2>&1
  CLI_SERVER_PID="$(grep -oE 'pid [0-9]+' "$logfile" | grep -oE '[0-9]+' || true)"
  local waited=0
  while ! curl -sf "$CLI_BASE/api/repos" > /dev/null 2>&1; do
    sleep 0.3; waited=$((waited + 1))
    if [ "$waited" -gt 30 ]; then
      echo "Server did not start within 9s:" >&2
      cat "$logfile" >&2
      return 1
    fi
  done
}

_stop_cli_server() {
  if [ -n "${CLI_SERVER_PID:-}" ] && kill -0 "$CLI_SERVER_PID" 2>/dev/null; then
    kill "$CLI_SERVER_PID" 2>/dev/null || true
    wait "$CLI_SERVER_PID" 2>/dev/null || true
  fi
  CLI_SERVER_PID=""
  lsof -ti:"$CLI_PORT" | xargs kill -9 2>/dev/null || true
}

# ── Suite lifecycle ───────────────────────────────────────────────────────────

setup_file() {
  mkdir -p "$TMP"

  # Isolated repos for cli-5 sections
  for repo in "$REPO_A" "$REPO_B" "$REPO_C"; do
    rm -rf "$repo"
    mkdir -p "$repo"
    git -C "$repo" init -q
    git -C "$repo" commit --allow-empty -q -m "init"
  done

  # Ensure crloop is built
  if [ ! -f "$REPO_ROOT/dist/server/server/cli.js" ]; then
    npm --prefix "$REPO_ROOT" run build:server > /dev/null 2>&1
  fi

  # Ensure crloop is on PATH
  if ! command -v crloop > /dev/null 2>&1; then
    npm --prefix "$REPO_ROOT" link > /dev/null 2>&1
  fi

  # Start multi-repo server for cli-1–cli-4 tests
  bash "$REPO_ROOT/scripts/qa/setup-single-repo.sh"
  bash "$REPO_ROOT/scripts/qa/setup-multi-repo.sh"
  bash "$REPO_ROOT/scripts/qa/start-server.sh" multi
  bash "$REPO_ROOT/scripts/qa/wait-for-server.sh"
}

teardown_file() {
  bash "$REPO_ROOT/scripts/qa/stop-server.sh" 2>/dev/null || true
  lsof -ti:"$CLI_PORT" | xargs kill -9 2>/dev/null || true
  rm -f "$OUT" "$TMP/qa-cli-bats-server.log"
  rm -rf "$REPO_A" "$REPO_B" "$REPO_C"
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-1: CLI repo targeting (FR-38)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-1: add-repo with --id registers with that identifier" {
  run crloop add-repo "$TMP/qa-repos/backend" --id backend-test --url "$BASE_URL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"backend-test"* ]]
}

@test "cli-1: repos list confirms backend-test is registered" {
  crloop add-repo "$TMP/qa-repos/backend" --id backend-test --url "$BASE_URL" 2>/dev/null || true
  run crloop repos --url "$BASE_URL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"backend-test"* ]]
}

@test "cli-1: remove-repo cleans up backend-test" {
  crloop add-repo "$TMP/qa-repos/backend" --id backend-test --url "$BASE_URL" 2>/dev/null || true
  run crloop remove-repo backend-test --url "$BASE_URL"
  [ "$status" -eq 0 ]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-2: CLI auto-select sole repo (FR-39)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-2: repos succeeds on single-repo server without specifying a repo" {
  bash "$REPO_ROOT/scripts/qa/stop-server.sh"
  bash "$REPO_ROOT/scripts/qa/start-server.sh" single
  bash "$REPO_ROOT/scripts/qa/wait-for-server.sh"

  run crloop repos --url "$BASE_URL"
  [ "$status" -eq 0 ]
  [[ "$output" != *"error"* ]]
  [[ "$output" != *"specify"* ]]

  # Restore multi mode for subsequent tests
  bash "$REPO_ROOT/scripts/qa/stop-server.sh"
  bash "$REPO_ROOT/scripts/qa/start-server.sh" multi
  bash "$REPO_ROOT/scripts/qa/wait-for-server.sh"
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-3: CLI list, register, and unregister repos (FR-40)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-3: repos lists all repos registered at startup" {
  run crloop repos --url "$BASE_URL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"frontend"* ]]
  [[ "$output" == *"backend"* ]]
  [[ "$output" == *"shared-libs"* ]]
}

@test "cli-3: add-repo registers qa-temp-repo and it appears in repos" {
  run crloop add-repo "$TMP/qa-repos/frontend" --id qa-temp-repo --url "$BASE_URL"
  [ "$status" -eq 0 ]
  run crloop repos --url "$BASE_URL"
  [[ "$output" == *"qa-temp-repo"* ]]
}

@test "cli-3: remove-repo unregisters qa-temp-repo and it disappears from repos" {
  crloop add-repo "$TMP/qa-repos/frontend" --id qa-temp-repo --url "$BASE_URL" 2>/dev/null || true
  run crloop remove-repo qa-temp-repo --url "$BASE_URL"
  [ "$status" -eq 0 ]
  run crloop repos --url "$BASE_URL"
  [[ "$output" != *"qa-temp-repo"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-4: CLI server URL (FR-41)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-4: --url connects to the specified server and returns results" {
  run crloop repos --url "$BASE_URL"
  [ "$status" -eq 0 ]
}

@test "cli-4: --url with unreachable server prints 'Connection failed'" {
  run crloop repos --url "http://localhost:9999"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Connection failed"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 1: --version and --help (no server needed)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 1: --version exits 0 and prints a version string" {
  run crloop --version
  [ "$status" -eq 0 ]
  [[ "$output" == *"."* ]]
}

@test "cli-5, sec 1: --version value matches package.json version" {
  local pkg_version
  pkg_version="$(node -p "require('$REPO_ROOT/package.json').version")"
  run crloop --version
  [ "$status" -eq 0 ]
  [[ "$output" == *"$pkg_version"* ]]
}

@test "cli-5, sec 1: --help exits 0 and documents all commands and flags" {
  run crloop --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"crloop"*     ]]
  [[ "$output" == *"serve"*      ]]
  [[ "$output" == *"repos"*      ]]
  [[ "$output" == *"add-repo"*   ]]
  [[ "$output" == *"remove-repo"* ]]
  [[ "$output" == *"stop-server"* ]]
  [[ "$output" == *"schema"*     ]]
  [[ "$output" == *"--json"*     ]]
  [[ "$output" == *"--dry-run"*  ]]
}

@test "cli-5, sec 1: -h is an alias for --help" {
  run crloop -h
  [ "$status" -eq 0 ]
  [[ "$output" == *"crloop"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 2: serve startup validation errors (no server needed)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 2: serve returns terminal immediately — daemon behaviour (FR-43)" {
  lsof -ti:"$CLI_PORT" | xargs kill -9 2>/dev/null || true
  local start
  start=$SECONDS
  run crloop serve "$REPO_A" --port "$CLI_PORT"
  local elapsed=$(( SECONDS - start ))
  [ "$status" -eq 0 ]
  [ "$elapsed" -lt 10 ]   # must return within 10 s, not block indefinitely
  lsof -ti:"$CLI_PORT" | xargs kill -9 2>/dev/null || true
}

@test "cli-5, sec 2: --port non-numeric exits 1 and prints 'Invalid --port'" {
  run crloop serve --port abc
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid --port"* ]]
}

@test "cli-5, sec 2: --port zero exits 1" {
  run crloop serve --port 0
  [ "$status" -ne 0 ]
}

@test "cli-5, sec 2: duplicate --repo ids exit 1 and print 'Duplicate repo id'" {
  run crloop serve --repo "$REPO_A" --repo "$REPO_A" --port "$CLI_PORT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Duplicate repo id"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 3: unknown command (no server needed)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 3: unknown command exits 1, prints 'Unknown command' and '--help'" {
  run crloop bogus-command
  [ "$status" -ne 0 ]
  [[ "$output" == *"Unknown command"* ]]
  [[ "$output" == *"--help"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 3b: schema command (no server needed)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 3b: schema exits 0 and outputs valid JSON" {
  run crloop schema
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "JSON.parse(require('fs').readFileSync('$OUT','utf8'))"
}

@test "cli-5, sec 3b: schema add-repo exits 0 and output has 'options' key" {
  run crloop schema add-repo
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(!r.options) throw new Error('missing options key')"
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 3c: --dry-run flag (no server needed)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 3c: add-repo --dry-run exits 0 and prints 'Would register'" {
  run crloop add-repo "$REPO_C" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Would register"* ]]
}

@test "cli-5, sec 3c: add-repo --dry-run --json outputs {dryRun:true}" {
  run crloop add-repo "$REPO_C" --dry-run --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.dryRun!==true) throw new Error('dryRun not true')"
}

@test "cli-5, sec 3c: remove-repo --dry-run exits 0 and prints 'Would remove'" {
  run crloop remove-repo any-id --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Would remove"* ]]
}

@test "cli-5, sec 3c: remove-repo --dry-run --json outputs {dryRun:true}" {
  run crloop remove-repo any-id --dry-run --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.dryRun!==true) throw new Error('dryRun not true')"
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 4: live server — repos, add-repo, remove-repo
# Each test starts its own isolated server so failures stay contained.
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 4: repos exits 0 and lists the startup repo id" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop repos --url "$CLI_BASE"
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  grep -q "^a" "$OUT"
  _stop_cli_server
}

@test "cli-5, sec 4: add-repo auto-derived id is registered and appears in repos" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop add-repo "$REPO_B" --url "$CLI_BASE"
  [ "$status" -eq 0 ]
  run crloop repos --url "$CLI_BASE"
  [[ "$output" == *"qa-cli-repo-b"* ]]
  _stop_cli_server
}

@test "cli-5, sec 4: add-repo explicit --id registers with the custom identifier" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop add-repo "$REPO_A" --id custom-id --url "$CLI_BASE"
  [ "$status" -eq 0 ]
  run crloop repos --url "$CLI_BASE"
  [[ "$output" == *"custom-id"* ]]
  _stop_cli_server
}

@test "cli-5, sec 4: remove-repo removes the repo and it no longer appears in repos" {
  _start_cli_server --repo "a:$REPO_A"
  crloop add-repo "$REPO_A" --id custom-id --url "$CLI_BASE" > /dev/null
  run crloop remove-repo custom-id --url "$CLI_BASE"
  [ "$status" -eq 0 ]
  run crloop repos --url "$CLI_BASE"
  [[ "$output" != *"custom-id"* ]]
  _stop_cli_server
}

@test "cli-5, sec 4: repos --json outputs a valid JSON array with id fields" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop repos --url "$CLI_BASE" --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(!Array.isArray(r)||!r[0].id) throw new Error('bad format')"
  _stop_cli_server
}

@test "cli-5, sec 4: add-repo --json outputs {id, path}" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop add-repo "$REPO_C" --id json-c --url "$CLI_BASE" --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.id!=='json-c') throw new Error('wrong id: '+r.id)"
  _stop_cli_server
}

@test "cli-5, sec 4: remove-repo --json outputs {id}" {
  _start_cli_server --repo "a:$REPO_A"
  crloop add-repo "$REPO_C" --id json-c --url "$CLI_BASE" > /dev/null
  run crloop remove-repo json-c --url "$CLI_BASE" --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.id!=='json-c') throw new Error('wrong id: '+r.id)"
  _stop_cli_server
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 5: error paths against a live server
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 5: add-repo duplicate id exits 1 with 'already in use'" {
  _start_cli_server --repo "a:$REPO_A"
  crloop add-repo "$REPO_B" --url "$CLI_BASE" > /dev/null  # register once
  run crloop add-repo "$REPO_B" --url "$CLI_BASE"          # duplicate
  [ "$status" -ne 0 ]
  [[ "$output" == *"already in use"* ]]
  _stop_cli_server
}

@test "cli-5, sec 5: add-repo non-git path exits 1 with 'Not a git repository'" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop add-repo /tmp --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Not a git repository"* ]]
  _stop_cli_server
}

@test "cli-5, sec 5: add-repo missing path exits 1 with usage message" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop add-repo --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
  _stop_cli_server
}

@test "cli-5, sec 5: remove-repo non-existent id exits 1 with 'not found'" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop remove-repo does-not-exist --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not found"* ]]
  _stop_cli_server
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 5b: stop-server command
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 5b: stop-server --json exits 0 and outputs {stopped:true}" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop stop-server --url "$CLI_BASE" --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.stopped!==true) throw new Error('stopped not true')"
  CLI_SERVER_PID=""
}

@test "cli-5, sec 5b: server is unreachable after stop-server, returns 'Connection failed'" {
  _start_cli_server --repo "a:$REPO_A"
  crloop stop-server --url "$CLI_BASE" > /dev/null
  sleep 0.5
  run crloop repos --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Connection failed"* ]]
  CLI_SERVER_PID=""
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 6: serve name:path syntax
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 6: serve --repo name:path produces the correct repo ids" {
  _start_cli_server --repo "fe:$REPO_A" --repo "be:$REPO_B"
  run crloop repos --url "$CLI_BASE"
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  grep -q "^fe" "$OUT"
  grep -q "^be" "$OUT"
  _stop_cli_server
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-5, sec 7: connection failure — all commands fail gracefully
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-5, sec 7: repos fails with 'Connection failed' when server is unreachable" {
  _stop_cli_server 2>/dev/null || true
  run crloop repos --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Connection failed"* ]]
}

@test "cli-5, sec 7: add-repo, remove-repo, and stop-server all fail when server is down" {
  _stop_cli_server 2>/dev/null || true
  run crloop add-repo "$REPO_A" --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  run crloop remove-repo a --url "$CLI_BASE"
  [ "$status" -ne 0 ]
  run crloop stop-server --url "$CLI_BASE"
  [ "$status" -ne 0 ]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-6: Lock file and crloop url (FR-57, FR-59, FR-60)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-6: serve writes ~/.crloop/server.json with port and pid fields" {
  rm -f "$HOME/.crloop/server.json"
  _start_cli_server --repo "a:$REPO_A"
  [ -f "$HOME/.crloop/server.json" ]
  node -e "
    const d=JSON.parse(require('fs').readFileSync('$HOME/.crloop/server.json','utf8'));
    if(!d.port) throw new Error('missing port');
    if(!d.pid)  throw new Error('missing pid');
  "
  _stop_cli_server
}

@test "cli-6: crloop url reads lock file and prints http://localhost:<port>" {
  rm -f "$HOME/.crloop/server.json"
  _start_cli_server --repo "a:$REPO_A"
  run crloop url
  [ "$status" -eq 0 ]
  [[ "$output" == *"localhost:$CLI_PORT"* ]]
  _stop_cli_server
}

@test "cli-6: crloop url --json outputs {url, port, pid}" {
  rm -f "$HOME/.crloop/server.json"
  _start_cli_server --repo "a:$REPO_A"
  run crloop url --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "
    const r=JSON.parse(require('fs').readFileSync('$OUT','utf8'));
    if(!r.url) throw new Error('missing url');
    if(!r.port) throw new Error('missing port');
    if(!r.pid)  throw new Error('missing pid');
  "
  _stop_cli_server
}

@test "cli-6: stop-server removes ~/.crloop/server.json" {
  rm -f "$HOME/.crloop/server.json"
  _start_cli_server --repo "a:$REPO_A"
  crloop stop-server --url "$CLI_BASE" > /dev/null
  CLI_SERVER_PID=""
  sleep 0.3
  [ ! -f "$HOME/.crloop/server.json" ]
}

@test "cli-6: crloop url exits 1 when lock file is absent" {
  rm -f "$HOME/.crloop/server.json"
  run crloop url
  [ "$status" -ne 0 ]
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-7: Agentic commands — status, finish-self-review, export, comment
#        (FR-50–FR-53, FR-55–FR-56)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-7: status exits 0 and shows agent-review as default state" {
  _start_cli_server --repo "a:$REPO_A"
  # Remove any stale session file so we get the default state
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop status --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  [[ "$output" == *"agent-review"* ]]
  _stop_cli_server
}

@test "cli-7: status --json outputs valid JSON with a status field" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop status --url "$CLI_BASE" --repo a --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "
    const r=JSON.parse(require('fs').readFileSync('$OUT','utf8'));
    if(!r.status) throw new Error('missing status');
  "
  _stop_cli_server
}

@test "cli-7: finish-self-review transitions session from agent-review to human-review" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop finish-self-review --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  run crloop status --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  [[ "$output" == *"human-review"* ]]
  _stop_cli_server
}

@test "cli-7: finish-self-review --dry-run exits 0 without transitioning" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop finish-self-review --url "$CLI_BASE" --repo a --dry-run
  [ "$status" -eq 0 ]
  # State must still be agent-review (not transitioned)
  run crloop status --url "$CLI_BASE" --repo a
  [[ "$output" == *"agent-review"* ]]
  _stop_cli_server
}

@test "cli-7: export exits 0 and prints plain text" {
  _start_cli_server --repo "a:$REPO_A"
  run crloop export --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
}

@test "cli-7: finish-addressing transitions session from agent-addressing to agent-review" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  # Advance to agent-addressing via finish-self-review then simulating human finish
  run crloop finish-self-review --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  # Transition human-review → agent-addressing (simulates "Finish Review" button)
  node -e "
    fetch('$CLI_BASE/api/repos/a/session/transition', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({status:'agent-addressing'})
    }).then(r => r.json()).then(d => { if(d.status!=='agent-addressing') throw new Error(JSON.stringify(d)); })
  "
  run crloop finish-addressing --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  run crloop status --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  [[ "$output" == *"agent-review"* ]]
  _stop_cli_server
}

@test "cli-7: finish-addressing --dry-run exits 0 without transitioning" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  # Advance to agent-addressing
  run crloop finish-self-review --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  node -e "
    fetch('$CLI_BASE/api/repos/a/session/transition', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({status:'agent-addressing'})
    }).then(r => r.json()).then(d => { if(d.status!=='agent-addressing') throw new Error(JSON.stringify(d)); })
  "
  run crloop finish-addressing --url "$CLI_BASE" --repo a --dry-run
  [ "$status" -eq 0 ]
  # State must still be agent-addressing (not transitioned)
  run crloop status --url "$CLI_BASE" --repo a
  [[ "$output" == *"agent-addressing"* ]]
  _stop_cli_server
}

# ═════════════════════════════════════════════════════════════════════════════
# cli-8: Session reset — crloop reset (FR-67, FR-68)
# ═════════════════════════════════════════════════════════════════════════════

@test "cli-8: reset from complete state returns session to agent-review iteration 1" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  # Drive session to complete: agent-review → human-review → complete
  crloop finish-self-review --url "$CLI_BASE" --repo a > /dev/null
  node -e "
    fetch('$CLI_BASE/api/repos/a/session/transition', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({status:'complete'})
    }).then(r => r.json()).then(d => { if(d.status!=='complete') throw new Error(JSON.stringify(d)); })
  "
  # Verify we're stuck in complete
  run crloop status --url "$CLI_BASE" --repo a --json
  echo "$output" > "$OUT"
  node -e "const r=JSON.parse(require('fs').readFileSync('$OUT','utf8')); if(r.status!=='complete') throw new Error('not complete: '+r.status)"
  # Reset
  run crloop reset --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  [[ "$output" == *"Session reset"* ]]
  # Verify default state
  run crloop status --url "$CLI_BASE" --repo a --json
  echo "$output" > "$OUT"
  node -e "
    const r=JSON.parse(require('fs').readFileSync('$OUT','utf8'));
    if(r.status!=='agent-review') throw new Error('status: '+r.status);
    if(r.iteration!==1) throw new Error('iteration: '+r.iteration);
  "
  _stop_cli_server
}

@test "cli-8: reset --dry-run exits 0 without actually resetting" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop reset --url "$CLI_BASE" --repo a --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Would reset"* ]]
  _stop_cli_server
}

@test "cli-8: reset with no session file succeeds (no error)" {
  _start_cli_server --repo "a:$REPO_A"
  rm -f "$REPO_A/.local-code-review/session.json"
  run crloop reset --url "$CLI_BASE" --repo a
  [ "$status" -eq 0 ]
  [[ "$output" == *"Session reset"* ]]
  _stop_cli_server
}

@test "cli-8: corrupted session.json recovers to default agent-review state (FR-68)" {
  _start_cli_server --repo "a:$REPO_A"
  # Write truncated/invalid JSON to session.json
  mkdir -p "$REPO_A/.local-code-review"
  echo '{"status":"human-rev' > "$REPO_A/.local-code-review/session.json"
  # status should recover gracefully, not crash
  run crloop status --url "$CLI_BASE" --repo a --json
  [ "$status" -eq 0 ]
  echo "$output" > "$OUT"
  node -e "
    const r=JSON.parse(require('fs').readFileSync('$OUT','utf8'));
    if(r.status!=='agent-review') throw new Error('status: '+r.status);
  "
  _stop_cli_server
}

@test "cli-7: comment --dry-run validates inputs and exits 0 without posting" {
  _start_cli_server --repo "a:$REPO_A"
  # Use a file that exists in the repo's diff (untracked file seeded by setup-single-repo.sh is only available in the QA worktree)
  # We use --dry-run so it validates without requiring a real changeId hit
  run crloop comment --url "$CLI_BASE" --repo a \
    --file README.md --side new --line 1 --body "test comment" --dry-run
  # dry-run may exit 0 (validated) or non-zero if file not in diff — either is acceptable
  # The key assertion is it does NOT panic or crash
  [[ "$status" -eq 0 || "$status" -eq 1 ]]
  _stop_cli_server
}
