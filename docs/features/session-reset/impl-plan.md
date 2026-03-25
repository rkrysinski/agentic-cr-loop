# Implementation Plan: Session Reset

Design reference: conversation (no design file — derived from debugging a stuck `complete` session and corrupted `session.json` from `kill -9`)

## Context

| File | Current role |
|------|-------------|
| `src/server/sessionStore.ts` | Session state machine: `readSession`, `writeSession`, `transitionSession` with `VALID_TRANSITIONS` map. `readSession` catches `ENOENT` but not `SyntaxError`. |
| `src/server/sessionStore.test.ts` | Unit tests for read/write/transition; no corrupted-file or reset tests. |
| `src/server/reviewService.ts` | Per-repo orchestration; exposes `getSession()` and `transitionSession()` via `syncReviewSession()`. No `resetSession` method. |
| `src/server/server.ts` | Express routes including `GET /:repoId/session` and `POST /:repoId/session/transition`. No reset endpoint. |
| `src/server/cli.ts` | CLI entry point; dispatches `finish-self-review`, `finish-addressing`, `status`, `wait`. No `reset` command. |
| `src/server/cli.test.ts` | Command list at line 42 and 202 does not include `"reset"`. |
| `docs/api.md` | Documents session GET and transition POST. No reset endpoint. |
| `docs/usage.md` | Documents `crloop status`, `finish-self-review`, `finish-addressing`, `wait`. No `crloop reset`. |
| `docs/requirements.md` | FR-50 through FR-54 cover session state machine and CLI. No FR for reset or corruption recovery. |
| `.claude/skills/crloop/SKILL.md` | Agent skill file. Step 1 (Setup) does `serve` + `add-repo` but no `reset`. The "Handling edge cases" section has no guidance for stuck/corrupted sessions. CLI reference at bottom has no `reset` entry. |
| `docs/features/agentic-cr-skill-cli/design-skill-cli.md` | Design doc for the agentic CLI. Session state machine section (line 420–454) shows `complete` as terminal with no reset path. Workflow sequence diagram (line 461–522) has no reset step. Implementation Status table (line 33–49) does not list `reset`. |

## Tasks

### `src/server/sessionStore.ts`

- [x] In `readSession`, catch `SyntaxError` from `JSON.parse` and return `defaultSession()` instead of re-throwing — handles corrupted JSON from `kill -9`
- [x] Add and export `resetSession(repoPath: string): Promise<void>` — deletes `session.json` via `fs.rm` with `{ force: true }` (no-op if missing)

### `src/server/reviewService.ts`

- [x] Import `resetSession` from `sessionStore.js` (add to existing import at line 11)
- [x] Add `async resetSession(): Promise<void>` method — calls `syncReviewSession()` then `resetSession(this.repoPath)`

### `src/server/server.ts`

- [x] Add `repoRouter.post("/session/reset", ...)` endpoint after the existing `/session/transition` route (after line 281) — calls `svc.resetSession()`, then returns the new default session via `svc.getSession()`

### `src/server/cli.ts`

- [x] Add `async function cmdReset(args: string[]): Promise<void>` — resolves base URL and repo ID, calls `POST /api/repos/:repoId/session/reset`, prints "Session reset." on success
- [x] Add `"reset"` entry to the schema object (near line 826) with `--repo`, `--url`, `--dry-run` options
- [x] Add `crloop reset` usage line to `printHelp()` under "Review workflow" section (near line 909)
- [x] Add `} else if (command === "reset") {` dispatch block in `main()` (near line 1056)

### `.claude/skills/crloop/SKILL.md`

- [x] In Step 1 (Setup, line 32–44), add `npx crloop reset` as the first command after `add-repo` — ensures a clean `agent-review` session regardless of prior state. Add a comment explaining this is safe to run every time.
- [x] In "Handling edge cases" section (line 120–127), add a case: "If `crloop status` shows `complete` or a transition fails with 'Invalid transition':" → run `npx crloop reset` to start a fresh session.
- [x] In "Full CLI reference" section (line 132–147), add `npx crloop reset` entry with description.

### `docs/features/agentic-cr-skill-cli/design-skill-cli.md`

- [x] In "Implementation Status" table (line 33–49), add a row for `reset` command with status ✅ (or 🔲 until implemented)
- [x] In "Session State Machine" section (line 420–454), add a note that `reset` is not a state transition but an out-of-band operation that deletes the session file, returning to the default `agent-review` state
- [x] In "Workflow Sequence" diagram (line 461–522), add `crloop reset` as the first agent action after `add-repo` in the setup phase

## Test coverage

- [x] `src/server/sessionStore.test.ts` — `readSession` returns default `agent-review` state when session file contains truncated/invalid JSON
- [x] `src/server/sessionStore.test.ts` — `resetSession` deletes session file; subsequent `readSession` returns default state
- [x] `src/server/sessionStore.test.ts` — `resetSession` is a no-op when session file does not exist (no throw)
- [x] `src/server/server.test.ts` — `POST /api/repos/:repoId/session/reset` returns 200 with `status: "agent-review"`, `iteration: 1`
- [x] `src/server/cli.test.ts` — add `"reset"` to the command list arrays at lines 42 and 202

## Docs and traceability

- [x] **MUST** `docs/api.md` — add `POST /api/repos/:repoId/session/reset` to the endpoint registry table and add request/response documentation section
- [x] **MUST** `docs/usage.md` — add `crloop reset` to the "Session management" section and the CLI usage examples
- [x] **MUST** `.claude/skills/crloop/SKILL.md` — add `reset` to Setup, edge cases, and CLI reference (see tasks above)
- [x] **MUST** `docs/features/agentic-cr-skill-cli/design-skill-cli.md` — add `reset` to status table, state machine section, and workflow diagram (see tasks above)
- [x] **SHOULD** `CHANGELOG.md` — add entry: new `crloop reset` command; `readSession` now recovers from corrupted JSON
- [x] **SHOULD** `docs/requirements.md` — add FR for session reset (`crloop reset` command) and FR for corrupted session recovery
- [ ] **CONSIDER** `scripts/qa/` — add a QA scenario for `crloop reset` (reset from `complete` state, reset with missing session file)

## Post-implementation checklist

**Implementation summary:** Added `crloop reset` CLI command with `POST /session/reset` endpoint, and made `readSession` recover from corrupted JSON files.

**Tasks completed:** 19
**Tasks skipped:** 0
**Tests:** passed (195/195)

### SHOULD — Important but does not block shipping

- [x] `CHANGELOG.md` — new `crloop reset` command and corrupted JSON recovery have no changelog entry
- [x] `docs/requirements.md` — no FR covers session reset or corrupted session recovery (add FR-67, FR-68)

### CONSIDER — Low-priority or optional

- [x] `scripts/qa/` — no QA scenario covers `crloop reset` (reset from `complete` state, reset with missing session file)
- [ ] `package.json` — consider minor version bump for new CLI command

**Artifacts not found:** `CHANGES.md`

