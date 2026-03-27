# crloop QA Runbook

You are a QA agent. This runbook tells you how to execute the full test suite.

- **UI scenarios (ui-1–ui-42):** automated — run `npx playwright test` commands below.
- **CLI scenarios (cli-1–cli-5):** automated — run `npm run test:cli` (BATS).

Record all results in `docs/qa-results.md` using the [Results Template](#results-template) at the end of this file.

---

## Prerequisites

**BATS** (CLI test runner) must be installed once:
```bash
brew install bats-core
```

**crloop binary** must be built and linked once:
```bash
npm run build:server
npm link
```

**Before running BATS — check whether the binary is stale:**

`cli-5, sec 1` verifies that `crloop --version` matches `package.json`. This fails when the globally linked binary is out of date — most commonly after a version bump in `package.json`. If `package.json` has changed since the last build, rebuild and re-link before running `npm run test:cli`:
```bash
npm run build:server
npm link
```

---

## Quick Start

```bash
# Run all UI tests (Playwright)
npx playwright test --reporter=list

# Run all CLI tests (BATS)
npm run test:cli

# Cleanup (MUST run after all test suites finish)
bash scripts/qa/cleanup.sh
npm unlink -g crloop
```

**Expected baselines:**
- Playwright: all passed, 0 failed
- BATS: all passed, 0 failed

---

## Individual Spec Suites

### UI — Playwright

| Spec file | Command | Scenarios |
|---|---|---|
| `e2e/single-repo.spec.ts` | `npx playwright test e2e/single-repo.spec.ts` | ui-1–ui-22 |
| `e2e/multi-repo.spec.ts` | `npx playwright test e2e/multi-repo.spec.ts` | ui-23–ui-39 |
| `e2e/zero-repo.spec.ts` | `npx playwright test e2e/zero-repo.spec.ts` | ui-40 |
| `e2e/ui-prefs.spec.ts` | `npx playwright test e2e/ui-prefs.spec.ts` | ui-41 |
| `e2e/file-tree.spec.ts` | `npx playwright test e2e/file-tree.spec.ts` | ui-42, ui-43 |
| `e2e/crloop-view.spec.ts` | `npx playwright test e2e/crloop-view.spec.ts` | ui-44 |

To re-run a single failing test by name:
```bash
npx playwright test -g "ui-41. File tree colors"
```

To view the HTML report after a run:
```bash
npx playwright show-report
```

Server lifecycle (setup/teardown, worktree creation, multi/zero mode switching) is handled automatically by `e2e/global-setup.ts` and `e2e/global-teardown.ts`. Do not start or stop the server manually before running `npx playwright test`.

### CLI — BATS

| Test file | Command | Scenarios |
|---|---|---|
| `test/cli.bats` | `npm run test:cli` | cli-1–cli-7 |

To re-run a single failing BATS test by name:
```bash
bats test/cli.bats --filter "cli-4"
```

BATS manages its own server lifecycle via `setup_file` / `teardown_file`. Do not start the server manually before running BATS.

Each section of the CLI verification is a separate `@test` block (e.g. `cli-5, sec 4`, `cli-5, sec 5b`). When a test fails, BATS reports the exact test name and failing line — no secondary script needed.

---

## Traceability Matrix

| Requirement | Description | Scenario | Coverage |
|---|---|---|---|
| FR-01 | Run locally | All | Implicit — all tests execute against localhost |
| FR-02 | Review working dir vs HEAD | ui-1 | `single-repo.spec.ts` — ui-1 |
| FR-03 | Include untracked files | ui-14 | `single-repo.spec.ts` — ui-14 |
| FR-04 | Detect renamed files | ui-15 | `single-repo.spec.ts` — ui-15 |
| FR-05 | Handle binary files | ui-16 | `single-repo.spec.ts` — ui-16 |
| FR-06 | Side-by-side view | ui-3 | `single-repo.spec.ts` — ui-3 |
| FR-07 | Unified view | ui-3 | `single-repo.spec.ts` — ui-3 |
| FR-08 | Context line control | ui-4 | `single-repo.spec.ts` — ui-4 |
| FR-09 | Hide removed lines | ui-5 | `single-repo.spec.ts` — ui-5 |
| FR-10 | Syntax highlighting | ui-17 | `single-repo.spec.ts` — ui-17 |
| FR-11 | Add comment | ui-8 | `single-repo.spec.ts` — ui-8 |
| FR-12 | Edit comment | ui-18 | `single-repo.spec.ts` — ui-18 |
| FR-13 | Delete comment | ui-8 | `single-repo.spec.ts` — ui-8 |
| FR-14 | Outdated comment detection | ui-19 | `single-repo.spec.ts` — ui-19 |
| FR-15 | Store comments locally, scoped to commit | ui-8, ui-19 | `single-repo.spec.ts` — ui-8, ui-19 |
| FR-16 | Carry forward comments on HEAD change | ui-20 | `single-repo.spec.ts` — ui-20 |
| FR-17 | Export with structured fields; skip outdated by default with toggle | ui-9 | `single-repo.spec.ts` — ui-9; `src/client/App.test.tsx` — skip-outdated toggle |
| FR-18 | Plain text for AI | ui-9 | `single-repo.spec.ts` — ui-9 |
| FR-19 | Preview, copy, download | ui-9, ui-10 | `single-repo.spec.ts` — ui-9, ui-10 |
| FR-20 | Hierarchical file tree | ui-2 | `single-repo.spec.ts` — ui-2 |
| FR-21 | Comment count badge per file | ui-21 | `single-repo.spec.ts` — ui-21 |
| FR-22 | Collapse/resize file panel | ui-6 | `single-repo.spec.ts` — ui-6 |
| FR-23 | Manual refresh | ui-11, ui-36 | `single-repo.spec.ts` — ui-11; `multi-repo.spec.ts` — ui-36 |
| FR-24 | Multiple repos per server | ui-23 | `multi-repo.spec.ts` — ui-23 |
| FR-25 | Isolated API per repo | ui-28 | `multi-repo.spec.ts` — ui-28 |
| FR-26 | List all repos | ui-23 | `multi-repo.spec.ts` — ui-23 |
| FR-27 | Register at startup | ui-23 | `multi-repo.spec.ts` — ui-23 |
| FR-28 | Register at runtime | ui-31 | `multi-repo.spec.ts` — ui-31 |
| FR-29 | Unregister at runtime | ui-31 | `multi-repo.spec.ts` — ui-31 |
| FR-30 | URL-safe ID from dir name | ui-31 | `multi-repo.spec.ts` — ui-31 |
| FR-31 | Custom identifier | ui-33 | `multi-repo.spec.ts` — ui-33 |
| FR-32 | Reject duplicate IDs | ui-33 | `multi-repo.spec.ts` — ui-33 |
| FR-33 | Preserve single-repo behavior | ui-1–ui-22 | `single-repo.spec.ts` — all tests |
| FR-34 | Hide repo selector (1 repo) | ui-22 | `single-repo.spec.ts` — ui-22 |
| FR-35 | Show repo selector (2+ repos) | ui-23 | `multi-repo.spec.ts` — ui-23 |
| FR-36 | Empty state (0 repos) | ui-40 | `zero-repo.spec.ts` — ui-40 |
| FR-37 | Persist selected repo | ui-29 | `multi-repo.spec.ts` — ui-29 |
| FR-38 | CLI repo targeting | cli-1 | `test/cli.bats` — cli-1 |
| FR-39 | CLI auto-select sole repo | cli-2 | `test/cli.bats` — cli-2 |
| FR-40 | CLI list/register/unregister | cli-3, cli-5 | `test/cli.bats` — cli-3, cli-5 |
| FR-41 | CLI server URL | cli-4, cli-5 | `test/cli.bats` — cli-4, cli-5 |
| FR-42 | CLI stop-server command | cli-5 | `test/cli.bats` — `cli-5, sec 5b` |
| FR-43 | CLI serve daemon behaviour | cli-5 | `test/cli.bats` — `cli-5, sec 2` |
| FR-44 | UI preferences persistence | ui-41 | `ui-prefs.spec.ts` — ui-41 |
| FR-45 | File-tree status coloring | ui-42 | `file-tree.spec.ts` — ui-42 |
| FR-46 | CLI --json flag | cli-5 | `test/cli.bats` — `cli-5, sec 4` and `sec 5b` |
| FR-47 | CLI --dry-run flag | cli-5 | `test/cli.bats` — `cli-5, sec 3c` |
| FR-48 | CLI schema command | cli-5 | `test/cli.bats` — `cli-5, sec 3b` |
| FR-49 | File-tree viewed/unviewed state | ui-38, ui-43 | `multi-repo.spec.ts` — ui-38; `file-tree.spec.ts` — ui-43 |
| FR-50 | Session state machine | cli-7 | `test/cli.bats` — cli-7; `src/server/sessionStore.test.ts` — valid/invalid transitions |
| FR-51 | Session state persisted to `.local-code-review/session.json` | cli-7 | `src/server/sessionStore.test.ts` — readSession/writeSession |
| FR-52 | CLI `status` command | cli-7 | `test/cli.bats` — cli-7 |
| FR-53 | CLI `finish-self-review` command | cli-7 | `test/cli.bats` — cli-7 |
| FR-54 | CLI `wait` command | — | `src/server/server.test.ts` — session transition endpoint; no blocking integration test (skipped per impl-plan) |
| FR-55 | CLI `comment` command (`--from-file`, `--from-stdin`) | cli-7, cli-8 | `test/cli.bats` — cli-7 (`--dry-run`), cli-8 (`--from-stdin`); `src/server/cli.test.ts` — `--from-stdin` (mutual exclusion, empty stdin, schema, live server); `src/server/server.test.ts` — POST comments |
| FR-56 | CLI `export` command; `--include-outdated` flag | cli-7 | `test/cli.bats` — cli-7; `src/server/server.test.ts` — export endpoint (default skip + includeOutdated param) |
| FR-57 | CLI `url` command | cli-6 | `test/cli.bats` — cli-6; `src/server/cli.test.ts` — url command group |
| FR-58 | CLI `open` command | — | No automated coverage — requires OS browser/desktop interaction |
| FR-59 | `serve` idempotency via HTTP probe | cli-6 | `test/cli.bats` — cli-6; `src/server/cli.test.ts` — serve daemon group |
| FR-60 | URL resolution chain (`--url` → env → default) | cli-6 | `test/cli.bats` — cli-6; `src/server/cli.test.ts` — url command group |
| FR-61 | Repo auto-detection from CWD | — | `src/server/cli.test.ts` — resolveRepoId logic |
| FR-62 | crloop view at `/crloop/<repoId>` | ui-44 | `e2e/crloop-view.spec.ts` — ui-44; `src/client/App.test.tsx` — Finish Review button, conditional transition (comments → `agent-addressing`, no comments → `complete`) |
| FR-63 | Input validation for `--file`, `--side`, `--line`, `--repo` | — | `src/server/cli.test.ts` — input validation group |
| FR-64 | CLI `skill --install` command | — | `src/server/cli.test.ts` — skill command group (created/unchanged/skipped/force/dry-run/json/scope) |
| FR-65 | CLI `finish-addressing` command | cli-7 | `test/cli.bats` — cli-7 (transition + `--dry-run`) |
| FR-66 | CLI `serve --foreground` mode | — | `src/server/cli.test.ts` — serve --foreground group; `src/server/args.test.ts` — foreground flag parsing |
| NFR-01 | Localhost only | All | Implicit — no external network calls |
| NFR-02 | No authentication | All | Implicit — no auth in any scenario |
| NFR-03 | Dark/light themes | ui-7 | `single-repo.spec.ts` — ui-7 |

---

## Post-Run Cleanup

**IMPORTANT: The agent MUST run these cleanup steps after all test suites have finished, regardless of pass/fail outcome.**

Playwright's global teardown handles most cleanup automatically. Run the cleanup script to catch anything left behind, then unlink the globally linked binary:

```bash
bash scripts/qa/cleanup.sh
npm unlink -g crloop
```

After all test suites have finished, unlink the binary:

```bash
ls /tmp/crloop-tmp/ 2>/dev/null && echo "WARNING: tmp dir still exists" || echo "OK: tmp dir clean"
which crloop 2>/dev/null && echo "WARNING: crloop still linked" || echo "OK: crloop unlinked"
```

---

## Notes for the Agent

- **Playwright tests are fully self-contained** — setup scripts, server start/stop, and worktree creation all run inside `e2e/global-setup.ts` and `e2e/global-teardown.ts`. Do not start or stop the server manually before running `npx playwright test`.
- **BATS tests are fully self-contained** — `test/cli.bats` starts and stops the server in `setup_file`/`teardown_file`. Do not start or stop the server manually before running `npm run test:cli`.
- **All temporary directories live inside `/tmp/crloop-tmp/`** — never create test repos or scratch files directly under `/tmp`.
- **Run `scripts/qa/` commands with paths relative to the repository root** — e.g. `bash scripts/qa/stop-server.sh`.
- **ui-15 (renamed file) may be skipped** in `single-repo.spec.ts` — the setup script commits the rename, making it invisible to the diff. This is a known environment limitation, not a bug.
- **If a Playwright test fails**, check `/tmp/crloop-tmp/qa-server.log` for server-side errors. The HTML report (`npx playwright show-report`) includes screenshots and traces for each failure.
- **If a BATS test fails**, the test name includes the section (e.g. `cli-5, sec 4: add-repo auto-derived id`). BATS also prints the failing line and its context. Record the test name and line in the results file.

---

## Results Template

Create `docs/qa-results.md` and fill it in as you work:

```markdown
# QA Test Results

- **Date:** YYYY-MM-DD
- **Commit:** <short hash — run `git rev-parse --short HEAD`>

## Playwright Automated Tests (UI)

Run output:
\`\`\`
npx playwright test --reporter=list
<paste full output here>
\`\`\`

Summary: X passed, Y failed, Z skipped

### Failures (if any)

| Scenario | Test name | Error summary |
|---|---|---|
| … | … | … |

## BATS Automated Tests (CLI)

Run output:
\`\`\`
npm run test:cli
<paste full output here>
\`\`\`

Summary: X passed, Y failed

### Failures (if any)

| Scenario | Test name | Error summary |
|---|---|---|
| … | … | … |
```
