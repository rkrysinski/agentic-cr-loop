# Changelog

## [Unreleased]

### Changed — Replace lock file with HTTP probing

- **Breaking:** `crloop serve` no longer writes `~/.crloop/server.json`. Server liveness is detected by probing the HTTP endpoint instead. The `serve` command is now idempotent even when the lock file was previously missing (e.g. after a crash).
- **Breaking:** `crloop url --json` output no longer includes a `pid` field (was `{url, port, pid}`, now `{url, port}`).
- `crloop stop-server` no longer removes a lock file on shutdown.
- `crloop serve --foreground` no longer writes or cleans up a lock file.
- `crloop url` now probes the server to verify liveness instead of reading a lock file.

## [0.2.3] — 2026-03-25

### Added — Session reset

- `crloop reset` — resets the review session to the default `agent-review` state (iteration 1) by deleting `session.json`; safe to call at any time, including when no session file exists; supports `--dry-run`
- `POST /api/repos/:repoId/session/reset` — API endpoint backing `crloop reset`; always returns 200 with the default session state

### Fixed — Corrupted session recovery

- `readSession` now recovers from truncated or invalid `session.json` (e.g. from `kill -9`) by returning the default `agent-review` state instead of crashing with a `SyntaxError`

## [0.2.2] — 2026-03-25

### Added — Foreground / debug mode

- `crloop serve --foreground` — runs the server in the current process instead of spawning a background daemon; logs every HTTP request to stdout (`METHOD /url STATUS DURATIONms`). Intended for diagnosing issues on client machines.

## [0.2.1] — 2026-03-23

### Added — Skill install command and finish-addressing

- `crloop skill --install` — copies the `skill/crloop/` directory (SKILL.md and references/) from the installed package to `~/.claude/skills/crloop/` (global) or `.claude/skills/crloop/` (project, via `--scope project`); idempotent (skips write when content is unchanged); protects user edits (warns and skips when file differs, unless `--force` is passed); supports `--dry-run` and `--json`
- `crloop skill --print` — prints the skill content to stdout without any filesystem writes
- `crloop finish-addressing` — transitions session from `agent-addressing` back to `agent-review`, enabling the next self-review iteration after the agent has addressed human feedback; supports `--dry-run`

## [0.2.0] — 2026-03-22

### Added — Agentic Review Loop

Complete agent-human review loop supporting AI agents that self-review, post comments, hand off to a human, wait for feedback, and loop back.

**Session state machine** (`agent-review → human-review → agent-addressing | complete`, `agent-addressing → agent-review` with iteration tracking):
- Persisted to `.local-code-review/session.json` inside the reviewed repository
- API endpoints: `GET /api/repos/:repoId/session`, `POST /api/repos/:repoId/session/transition`

**New CLI commands** (all new commands support `--repo` for multi-repo targeting and `--url`/env URL resolution):
- `crloop url` — prints the running server's base URL by probing the server
- `crloop open` — opens the crloop review view in the default browser
- `crloop comment` — adds a comment to a changed line; supports `--from-file` for bulk import and `--dry-run`
- `crloop export` — prints comments as plain text to stdout (skips outdated by default); supports `--file` filter and `--include-outdated`
- `crloop status` — shows session state, iteration number, and comment counts
- `crloop finish-self-review` — transitions session from `agent-review` to `human-review`; supports `--dry-run`
- `crloop wait` — blocks and polls until session transitions to `agent-addressing` (exit 0) or `complete` (exit 2)

**Server idempotency:**
- `crloop serve` probes the target port before spawning — if a server is already responding, it exits 0 with `Server already running` instead of spawning a second daemon
- URL resolution chain: `--url` → `CODE_REVIEW_URL` env var → `http://localhost:3000`

**crloop View UI** (`/crloop/<repoId>`):
- Same diff/comment functionality as the standard UI
- No repository selector (repo fixed by URL)
- "Finish Review" button that transitions the session to `agent-addressing`, unblocking `crloop wait`

**Input validation** — all agent-supplied CLI inputs (`--file`, `--side`, `--line`, `--repo`) are validated before any HTTP calls; exits with code 1 on failure.

**SKILL.md** — skill file at `skill/crloop/SKILL.md` (with `references/` companion directory) teaching AI agents the CLI vocabulary and review loop workflow, included in the npm tarball.

## [0.1.2] — 2026-03-22

### Fixed

- Preserve viewed-file state correctly when switching between repositories
- Remove duplicate diff gutter border on the second line-number column

## [0.1.1] — 2026-03-21

### Added — File-Tree Viewed/Unviewed State (FR-49)

- Unviewed files shown in **bold**, viewed files in normal weight in the file tree
- Viewed set persisted in localStorage keyed to the active repository
- Viewed set invalidated when the repository HEAD changes
- `headShortId` added to `GET /api/repos/:repoId/repo` response to support client-side cache-key invalidation

### Changed

- QA suite migrated from manual MCP to automated Playwright + BATS

## [0.1.0] — 2026-03-21

### Added — Core Review Tool

Initial public release covering the full local code-review workflow.

**Diff display** (FR-06–FR-10):
- Side-by-side and unified diff views
- Configurable context lines: none, 3, 20, 100, or full file
- Toggle to hide removed lines in unified view
- Syntax highlighting based on file extension
- Binary files listed in the change set without line-level commenting

**Change detection** (FR-02–FR-05):
- Reviews staged, unstaged, and untracked files against HEAD
- Untracked text files treated as fully added
- Renamed files shown with old and new paths

**Comment management** (FR-11–FR-16):
- Add, edit, and delete line-level comments
- Comments stored in `.local-code-review/<HEAD-short-id>.json` inside the reviewed repository
- Outdated detection: comments anchored to SHA-256 hash of surrounding diff context; marked outdated when diff changes
- Comments carried forward from prior commit when HEAD advances

**Comment export** (FR-17–FR-19):
- Export comments as structured plain text (file path, line number, diff side, body, outdated status); outdated comments excluded by default with option to include them
- Preview, copy to clipboard, and download from the UI; "Skip outdated" toggle in export view

**File navigation** (FR-20–FR-23, FR-45):
- Hierarchical file tree with collapsible folders
- Comment count badge per file
- Collapsible and resizable file list panel
- Manual refresh control
- File tree entries color-coded by change type: teal (added/untracked), red (deleted), amber (renamed)

**Multi-repository support** (FR-24–FR-33):
- Multiple repositories in a single server instance with isolated API resources per repo
- Register repos at startup or at runtime; unregister without deleting comments
- URL-safe identifier derived from directory name; custom identifiers supported
- Duplicate identifier rejected at startup with a descriptive error

**Frontend — repository selection** (FR-34–FR-37):
- Repository selector hidden when exactly one repo is registered
- Repository selector shown for two or more repos
- Empty state with instructions shown when zero repos are registered
- Selected repository persisted across page reloads

**Frontend — UI preferences** (FR-44):
- Theme (dark/light), diff view mode, context line count, hide-removed-lines, sidebar collapsed state, and sidebar width persisted in localStorage across page reloads and browser restarts

**CLI** (FR-38–FR-43, FR-46–FR-48):
- `crloop serve` — starts the server as a background daemon and returns the terminal immediately; writes lock file `~/.crloop/server.json`
- `crloop stop-server` — gracefully stops the running server and removes the lock file
- `crloop add-repo` / `crloop remove-repo` / `crloop list-repos` — runtime repository management
- `--repo` flag for targeting a specific repo; auto-selects sole repo when only one is registered
- `--url` flag and `CODE_REVIEW_URL` env var for server targeting
- `--json` flag on all read/write commands for machine-readable output
- `--dry-run` flag on `add-repo` and `remove-repo` for previewing mutations without side effects
- `schema` command printing a JSON description of all commands and their arguments
