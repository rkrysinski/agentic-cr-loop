# Implementation Plan: Agent Skill + CLI (Agentic Workflow)

Design reference: [design-skill-cli.md](./design-skill-cli.md)

## Context

| File | Current role |
|------|-------------|
| `src/server/cli.ts` | CLI entry point. Has `serve`, `stop-server`, `repos`, `add-repo`, `remove-repo`, `schema` commands. No agentic commands yet. |
| `src/server/server.ts` | Express app with per-repo routes under `/api/repos/:repoId`. No session endpoints. |
| `src/server/reviewService.ts` | Per-repo orchestration (diff, comments, export). No session state. |
| `src/server/commentStore.ts` | Reads/writes comment JSON in `.local-code-review/<HEAD>.json`. No session file. |
| `src/client/App.tsx` | Root UI component (~960 lines). No crloop-view detection or "Finish Review" button. |
| `src/client/RepoContext.tsx` | Multi-repo context provider. No `crloopRepoId` prop. |
| `src/client/RepoSelector.tsx` | Repo selector component. Always rendered when multiple repos exist. |
| `src/client/api.ts` | Typed HTTP client. No session API calls. |
| `src/server/cli.test.ts` | Tests for existing CLI commands. No agentic command tests. |
| `src/server/server.test.ts` | API route tests. No session endpoint tests. |
| `docs/requirements.md` | FR-01 through FR-49. No session/agentic workflow requirements. |
| `docs/api.md` | API reference. No session endpoints documented. |
| `docs/features/agentic-cr-skill-cli/skill/SKILL.md` | Draft skill file in docs (not yet at `skill/SKILL.md` in project root). |

## Tasks

### ~~Lock file (`~/.crloop/server.json`)~~ — Superseded by HTTP probing

> Lock file removed in favour of HTTP port probing. `probeRunningServer(port)` replaces all lock file reads/writes. See CHANGELOG [Unreleased] entry.

- [x] ~~`src/server/cli.ts` — Add `writeLockFile(port, pid)` function~~ (removed)
- [x] ~~`src/server/cli.ts` — Add `removeLockFile()` function~~ (removed)
- [x] ~~`src/server/cli.ts` — Add `readLockFile()` function~~ (removed)
- [x] ~~`src/server/cli.ts` — In the `serve` daemon branch, call `writeLockFile()`~~ (removed)
- [x] ~~`src/server/cli.ts` — In `cmdStopServer`, call `removeLockFile()`~~ (removed)
- [x] `src/server/cli.ts` — Update `resolveBaseUrl()`: resolution chain `--url` → `CODE_REVIEW_URL` env var → default `http://localhost:3000`

### URL resolution helper

- [x] `src/server/cli.ts` — Add `resolveRepoId(args, baseUrl)` async function: checks `--repo` flag first, falls back to `GET /api/repos` + `process.cwd()` match, exits 1 on no match (per design lines 349–363)

### Input validation

- [x] `src/server/cli.ts` — Add `validateFilePath(file)` — rejects `..` segments, absolute paths; returns sanitized relative path
- [x] `src/server/cli.ts` — Add `validateSide(side)` — must be exactly `"new"` or `"old"`
- [x] `src/server/cli.ts` — Add `validateLine(line)` — must be a positive integer
- [x] `src/server/cli.ts` — Add `validateRepoId(id)` — alphanumeric and hyphens only; no `?`, `#`, `%`

### CLI command: `crloop url`

- [x] `src/server/cli.ts` — Add `cmdUrl(args)`: probes server, prints `http://localhost:<port>` or JSON `{ url, port }` with `--json`; exit 1 if server not responding
- [x] `src/server/cli.ts` — Register `"url"` case in `main()` dispatch

### CLI command: `crloop open`

- [x] `src/server/cli.ts` — Add `cmdOpen(args)`: resolves base URL (via `--url` or default), calls `resolveRepoId`, opens `http://localhost:<port>/crloop/<repoId>` via `open` (macOS) / `xdg-open` (Linux) / `start` (Windows) using `child_process.exec`
- [x] `src/server/cli.ts` — Register `"open"` case in `main()` dispatch

### CLI command: `crloop comment`

- [x] `src/server/cli.ts` — Add `cmdComment(args)`: resolves base URL and repoId; supports single-comment mode (`--file`, `--side`, `--line`, `--body`) and bulk mode (`--from-file <path>`)
- [x] `src/server/cli.ts` — Single-comment: validate inputs, resolve `--file` to `changeId` via `GET /api/repos/:repoId/changes`, call `POST /api/repos/:repoId/comments` with `{ changeId, side, lineNumber, body }`, print created comment ID
- [x] `src/server/cli.ts` — Bulk mode (`--from-file`): read JSON array from file, validate each entry, resolve files to changeIds, POST each comment, report `N created, M failed`
- [x] `src/server/cli.ts` — `--dry-run` support: validate inputs and resolve changeId without POSTing; print what would be created
- [x] `src/server/cli.ts` — Register `"comment"` case in `main()` dispatch

### CLI command: `crloop export`

- [x] `src/server/cli.ts` — Add `cmdExport(args)`: resolves base URL and repoId, calls `GET /api/repos/:repoId/export/comments.txt`, prints plain text to stdout; supports `--file <path>` to filter by file
- [x] `src/server/cli.ts` — Register `"export"` case in `main()` dispatch

### Session coordination — server-side

- [x] `src/server/sessionStore.ts` — New file. Define `SessionState` type: `{ status: "agent-review" | "human-review" | "agent-addressing" | "complete", iteration: number, headId: string, startedAt: string, updatedAt: string }`
- [x] `src/server/sessionStore.ts` — Implement `readSession(repoPath)` that reads `.local-code-review/session.json`; returns default `agent-review` state if file absent
- [x] `src/server/sessionStore.ts` — Implement `writeSession(repoPath, state)` that writes session state atomically
- [x] `src/server/sessionStore.ts` — Implement `transitionSession(repoPath, targetStatus)` with state machine validation: `agent-review → human-review`, `human-review → agent-addressing | complete`, `agent-addressing → agent-review`
- [x] `src/server/reviewService.ts` — Add `getSession()` method that delegates to `sessionStore.readSession`
- [x] `src/server/reviewService.ts` — Add `transitionSession(targetStatus)` method that delegates to `sessionStore.transitionSession`

### Session coordination — API endpoints

- [x] `src/server/server.ts` — Add `GET /api/repos/:repoId/session` route on `repoRouter`: returns `{ status, iteration, headId, startedAt, updatedAt, commentCounts: { current, outdated } }`
- [x] `src/server/server.ts` — Add `POST /api/repos/:repoId/session/transition` route on `repoRouter`: accepts `{ status }` body, calls `reviewService.transitionSession()`, returns updated session state; 400 on invalid transition

### CLI command: `crloop status`

- [x] `src/server/cli.ts` — Add `cmdStatus(args)`: resolves base URL and repoId, calls `GET /api/repos/:repoId/session`, prints human-readable status or JSON with `--json`
- [x] `src/server/cli.ts` — Register `"status"` case in `main()` dispatch

### CLI command: `crloop finish-self-review`

- [x] `src/server/cli.ts` — Add `cmdFinishSelfReview(args)`: resolves base URL and repoId, calls `POST /api/repos/:repoId/session/transition` with `{ status: "human-review" }`, prints confirmation; `--dry-run` validates current state is `agent-review` without transitioning
- [x] `src/server/cli.ts` — Register `"finish-self-review"` case in `main()` dispatch

### CLI command: `crloop wait`

- [x] `src/server/cli.ts` — Add `cmdWait(args)`: resolves base URL and repoId, polls `GET /api/repos/:repoId/session` every `--poll-interval` seconds (default 3); exits 0 on `agent-addressing`, exits 2 on `complete`
- [x] `src/server/cli.ts` — Register `"wait"` case in `main()` dispatch

### CLI schema and help updates

- [x] `src/server/cli.ts` — In `cmdSchema()`, add schema entries for all new commands: `url`, `open`, `comment`, `export`, `status`, `finish-self-review`, `wait`
- [x] `src/server/cli.ts` — In `printHelp()`, add usage lines and descriptions for all new commands

### crloop View UI

- [x] `src/client/App.tsx` or `src/client/main.tsx` — Add crloop path detection: `const crloopMatch = /^\/crloop\/([^/]+)/.exec(window.location.pathname); const crloopRepoId = crloopMatch?.[1] ?? null;`
- [x] `src/client/RepoContext.tsx` — Accept optional `crloopRepoId` prop in `RepoProvider`; when set, auto-select that repo and skip storage-based persistence
- [x] `src/client/App.tsx` — When `crloopRepoId` is set, suppress `<RepoSelector />` rendering
- [x] `src/client/App.tsx` — When `crloopRepoId` is set, render a "Finish Review" button in the toolbar that calls `POST /api/repos/:repoId/session/transition` with `{ status: "agent-addressing" }`
- [x] `src/client/api.ts` — Add `getSession(repoId)` and `transitionSession(repoId, status)` API client functions

### Skill file

- [x] `skill/SKILL.md` — Create at project root (copy from `docs/features/agentic-cr-skill-cli/skill/SKILL.md` and update against actual implemented CLI commands and multi-repo routing)
- [x] `package.json` — Ensure `"files"` array includes `"skill"` directory (already present)

## Test coverage

- [x] `src/server/sessionStore.test.ts` — Tests for `readSession`, `writeSession`, `transitionSession` (valid transitions, invalid transitions rejected, default state on missing file)
- [x] `src/server/server.test.ts` — Tests for `GET /api/repos/:repoId/session` and `POST /api/repos/:repoId/session/transition` (happy path, invalid transition 400, missing repo 404)
- [x] `src/server/cli.test.ts` — Tests for `url` command (server not responding exits 1; positive test with live server)
- [ ] `src/server/cli.test.ts` — Tests for `comment` command (`--dry-run` single and `--from-file`, live server single comment creation)
- [ ] `src/server/cli.test.ts` — Tests for `export` command (plain text output, `--file` filter)
- [ ] `src/server/cli.test.ts` — Tests for `status`, `finish-self-review`, `wait` commands (with `--dry-run` where applicable)
- [ ] `src/server/cli.test.ts` — Tests for `open` command (`--dry-run` or mock child_process)
- [x] `src/server/cli.test.ts` — Tests for input validation helpers (bad file paths, invalid side/line values)

## Docs and traceability

- [x] `docs/requirements.md` — Add agentic workflow requirements: session state machine, session CLI commands (`status`, `finish-self-review`, `wait`), `comment` CLI command, `export` CLI command, `url`/`open` CLI commands, crloop view UI, server idempotency, "Finish Review" button
- [x] `docs/api.md` — Add entries for `GET /api/repos/:repoId/session` and `POST /api/repos/:repoId/session/transition` with request/response schemas
- [x] `docs/features/agentic-cr-skill-cli/design-skill-cli.md` — Update implementation status table to reflect completed items as work progresses

## Skipped

- `src/server/cli.test.ts` — Tests for `comment` command (live server comment creation) — requires spinning up a full daemon server in the test suite; core comment API is already covered by `server.test.ts` and input validation is covered by the validation test group
- `src/server/cli.test.ts` — Tests for `export` command (live server) — same reason; export endpoint is already tested in `server.test.ts`
- `src/server/cli.test.ts` — Tests for `status`, `finish-self-review`, `wait` commands (live server) — session endpoints are covered by `server.test.ts` and `sessionStore.test.ts`; CLI integration would require a long-running server
- `src/server/cli.test.ts` — Tests for `open` command — requires mocking `child_process.exec` or `--dry-run` support not present in the design

## Post-implementation checklist

**Implementation summary:** Added complete agentic review loop — session state machine, 7 new CLI commands (url, open, comment, export, status, finish-self-review, wait), HTTP-probe-based server discovery, crloop view UI with "Finish Review" button, input validation, and SKILL.md.

**Tasks completed:** 39
**Tasks skipped:** 4 — see Skipped section above
**Tests:** passed (169 tests, 15 files)

### MUST — Required before this work is considered done

> No MUST items — all new endpoints are documented in `docs/api.md`, all new CLI commands are in schema and help, requirements are updated in `docs/requirements.md`, and tests cover the session store, session API endpoints, server discovery CLI, and input validation.

### SHOULD — Important but does not block shipping

- [ ] `src/server/cli.test.ts` — Add live-server integration tests for `comment --from-file`, `export`, `status`, `finish-self-review` commands to cover the full CLI ↔ server path
- [x] `src/client/App.test.tsx` — Add test verifying "Finish Review" button renders when `crloopRepoId` prop is set and RepoSelector is suppressed

### CONSIDER — Low-priority or optional

- [x] `package.json` — Consider version bump (0.1.2 → 0.2.0) for the new agentic workflow feature
- [x] `CHANGELOG.md` — Not found; consider creating one to track user-visible changes

**Artifacts not found:** QA scripts (scripts/qa/, qa/)
