# Requirements Specification

Version 2.0

## Purpose

A local code review tool for reviewing changes in Git working directories. The system produces review feedback consumable by both human reviewers and AI agents.

## Core Review

- **FR-01**: The system MUST be possible to run locally.
- **FR-02**: The system MUST review changes between the current working directory state (staged, unstaged, and untracked files) and the most recent commit (HEAD).
- **FR-03**: The system MUST include untracked text files in the reviewable change set, treating them as fully added files.
- **FR-04**: The system MUST detect renamed files and present them with their old and new paths.
- **FR-05**: The system MUST handle binary files by listing them in the change set but not allowing line-level comments on them.

## Diff Display

- **FR-06**: The system MUST allow reviewed changes to be viewed in a side-by-side format.
- **FR-07**: The system MUST allow reviewed changes to be viewed in a unified format.
- **FR-08**: The system MUST allow the reviewer to control how many context lines are shown around changes (none, 3, 20, 100, or full file).
- **FR-09**: The system MUST allow the reviewer to hide removed lines in the unified view.
- **FR-10**: The system MUST apply syntax highlighting to diff content based on file extension.

## Comment Management

- **FR-11**: The system MUST allow a reviewer to add a comment on a changed line.
- **FR-12**: The system MUST allow a reviewer to edit an existing comment.
- **FR-13**: The system MUST allow a reviewer to delete an existing comment.
- **FR-14**: The system MUST detect when the content surrounding a commented line no longer matches the current diff and mark that comment as outdated.
- **FR-15**: The system MUST store review comments locally within the reviewed repository, scoped to the commit they were created against.
- **FR-16**: The system MUST carry forward comments from a prior commit to the current commit when the repository HEAD changes.

## Comment Export

- **FR-17**: The system MUST allow the reviewer to export all review comments as structured text that includes, for each comment: file path, line number, diff side, comment body, and outdated status.
- **FR-18**: The exported text MUST be plain text parseable by an AI agent without additional context.
- **FR-19**: The system SHOULD provide a way to preview, copy to clipboard, and download the exported comments.

## File Navigation

- **FR-20**: The system MUST display changed files in a hierarchical file tree with collapsible folders.
- **FR-21**: The system MUST show a comment count badge on each file that has comments.
- **FR-22**: The system SHOULD allow the reviewer to collapse and resize the file list panel.
- **FR-23**: The system MUST provide a manual refresh control to reload the change list and comment counts from the repository.
- **FR-45**: The system SHOULD visually distinguish added, deleted, and renamed files from modified files in the file tree using color coding consistent with the diff view palette, in both dark and light themes.

## Multi-Repository

- **FR-24**: The system MUST support multiple repositories in a single running server instance.
- **FR-25**: The system MUST isolate all API resources per repository so that requests unambiguously target a single repo.
- **FR-26**: The system MUST provide a way to list all registered repositories.
- **FR-27**: The system MUST allow repositories to be registered at startup (zero, one, or many).
- **FR-28**: The system MUST allow repositories to be registered at runtime without a server restart.
- **FR-29**: The system MUST allow repositories to be unregistered at runtime without deleting stored comments.
- **FR-30**: The system MUST assign each repository a stable, URL-safe identifier derived from its directory name when no explicit name is provided.
- **FR-31**: The system MUST allow the user to provide a custom identifier when registering a repository.
- **FR-32**: The system MUST reject duplicate repository identifiers at startup with a descriptive error.
- **FR-33**: The system MUST preserve all existing single-repo behavior when exactly one repository is registered.

## Frontend — Repository Selection

- **FR-34**: The frontend MUST hide the repository selector when only one repository is registered.
- **FR-35**: The frontend MUST show a repository selector when two or more repositories are registered.
- **FR-36**: The frontend MUST show an empty state with instructions when zero repositories are registered.
- **FR-37**: The frontend MUST persist the selected repository across page reloads.

## Frontend — UI Preferences

- **FR-44**: The frontend MUST persist the reviewer's UI preferences across page reloads and browser restarts, including: display theme (dark/light), diff view mode (unified/side-by-side), diff context line count, hide-removed-lines toggle state, sidebar collapsed state, and sidebar width.
- **FR-49**: The frontend MUST visually distinguish files the reviewer has not yet opened (unviewed) from files they have opened (viewed) in the file tree, using bold font weight for unviewed files and normal weight for viewed files. The viewed set MUST be persisted in localStorage keyed to the active repository and MUST be invalidated when the repository HEAD changes.

## CLI

- **FR-38**: The CLI MUST allow the user to specify which repository to target when multiple repositories are registered.
- **FR-39**: The CLI MUST use the sole registered repository automatically when exactly one is available.
- **FR-40**: The CLI MUST provide commands for listing, registering, and unregistering repositories at runtime.
- **FR-41**: The CLI MUST allow the user to specify the server URL to connect to.
- **FR-42**: The CLI MUST provide a command to gracefully stop the running server.
- **FR-43**: The `serve` command MUST return the terminal to the user immediately after the server is ready, running the server as a background process.
- **FR-46**: The CLI MUST support a `--json` flag on all commands except `serve` and `schema`, causing output to be emitted as JSON to stdout rather than human-readable text.
- **FR-47**: The CLI MUST support a `--dry-run` flag on `add-repo` and `remove-repo`, causing the command to validate its arguments and print a preview of the action without contacting the server or making any changes.
- **FR-48**: The CLI MUST provide a `schema` command that prints a machine-readable JSON description of all commands and their accepted arguments and options.

## Agentic Review Loop

- **FR-50**: The system MUST maintain a per-repo session state machine with the following states and transitions: `agent-review → human-review → agent-addressing | complete`, `agent-addressing → agent-review` (iteration increment).
- **FR-51**: The system MUST persist session state in `.local-code-review/session.json` inside the reviewed repository.
- **FR-52**: The CLI MUST provide a `status` command that prints the current session state, iteration number, and comment counts.
- **FR-53**: The CLI MUST provide a `finish-self-review` command that transitions the session from `agent-review` to `human-review`, with `--dry-run` support.
- **FR-54**: The CLI MUST provide a `wait` command that blocks (polls) until the session transitions to `agent-addressing` (exit 0) or `complete` (exit 2).
- **FR-55**: The CLI MUST provide a `comment` command that adds a comment to a changed line, supporting single-comment mode (`--file`, `--side`, `--line`, `--body`) and bulk mode (`--from-file`), with `--dry-run` support.
- **FR-56**: The CLI MUST provide an `export` command that prints all comments as plain text to stdout, with `--file` filter support.
- **FR-57**: The CLI MUST provide a `url` command that prints the running server's base URL from the lock file without making a network call.
- **FR-58**: The CLI MUST provide an `open` command that opens the crloop review view in the default browser.
- **FR-59**: The `serve` command MUST write a lock file (`~/.crloop/server.json`) containing `{ port, pid, startedAt }` on daemon start, and the `stop-server` command MUST remove it on shutdown.
- **FR-60**: The CLI MUST resolve the server URL via the chain: `--url` flag → `CODE_REVIEW_URL` env var → lock file → default `http://localhost:3000`.
- **FR-61**: The CLI MUST auto-detect the target repository by matching the current working directory against registered repo paths when `--repo` is omitted.
- **FR-62**: The system MUST serve a crloop view at `/crloop/<repoId>` that shows the same diff/comment UI without the repository selector and with a "Finish Review" button that transitions the session to `agent-addressing`.
- **FR-63**: The CLI MUST validate all agent-supplied inputs (`--file`, `--side`, `--line`, `--repo`) before making HTTP calls and exit with code 1 on validation failure.
- **FR-64**: `crloop skill --install` MUST copy `skill/SKILL.md` from the installed package to `~/.claude/skills/crloop/SKILL.md` (global, default) or `.claude/skills/crloop/SKILL.md` (project, via `--scope project`). The command MUST be idempotent (skip write when content is unchanged), protect user edits (warn and skip without `--force` when content differs), support `--dry-run`, `--json`, and `--force` flags, and support `crloop skill --print` to emit skill content to stdout without filesystem writes.
- **FR-65**: The CLI MUST provide a `finish-addressing` command that transitions the session from `agent-addressing` to `agent-review`, with `--dry-run` support.

## Non-Functional

- **NFR-01**: The system MUST operate without requiring network access beyond localhost.
- **NFR-02**: The system is designed for trusted, single-user, local use and does not require authentication.
- **NFR-03**: The system SHOULD support dark and light display themes.

## Version Changes

- 1.0: Initial requirements for local use, Git working directory review, side-by-side and unified views, line-level commenting, and text export for AI-agent processing.
- 1.1: Added comment editing/deletion, outdated-comment detection, configurable diff context, hide-removed-lines, file tree with comment badges, resizable file panel, syntax highlighting, binary file handling, untracked file inclusion, rename detection, and manual refresh.
- 1.2: Added multi-repo support requirements: multiple repos per server, path-prefixed API routing, discovery endpoint, startup and runtime registration, frontend repo selector states, scoped API client, and CLI repo resolution.
- 1.3: Quality overhaul — added requirement IDs (FR/NFR), grouped by category, rewrote implementation-detail requirements as behavior-focused (WHAT not HOW), removed internal architecture rules (scoped API client constraint), eliminated redundancies between Purpose and Requirements sections, filled completeness gaps (export UI, comment storage/migration, base reference, theme, CLI server targeting, security scope), promoted implemented SHOULD items to MUST (file tree, comment badges, syntax highlighting, manual refresh), tightened ambiguous requirements ("suitable for AI agent" → concrete export fields, "diff anchor" → "content surrounding a commented line"), removed unimplemented `CODE_REVIEW_REPO` env var from CLI requirement (deferred to future), merged frontend selector states 2 and 3 into single requirement.
- 1.4: Added FR-42 for graceful server shutdown via CLI (`stop-server` command / `POST /api/server/stop` endpoint).
- 1.5: Added FR-43 for daemon behaviour — `serve` returns the terminal immediately after spawning the background server process.
- 1.6: Added FR-44 for UI preferences persistence — theme, view mode, diff context, hide-removed-lines, sidebar collapsed state, and sidebar width now survive page reloads and browser restarts via localStorage.
- 1.7: Added FR-45 for file-tree status coloring — added/untracked files shown in teal, deleted in red, renamed in amber, consistent with the diff view palette, in both dark and light themes.
- 1.8: Added FR-46, FR-47, FR-48 for AI-agent CLI affordances — `--json` flag for machine-readable output on all read/write commands, `--dry-run` flag for previewing mutations without side effects, and `schema` command for runtime introspection of command parameters.
- 1.9: Added FR-49 for file-tree viewed/unviewed state — unviewed files shown in bold, viewed files in normal weight, viewed set persisted in localStorage per-repo and invalidated on HEAD change. Also added `headShortId` to `GET /api/repos/:repoId/repo` response to support client-side cache-key invalidation.
- 2.0: Added FR-50 through FR-63 for agentic review loop — session state machine, session CLI commands (`status`, `finish-self-review`, `wait`), `comment` and `export` CLI commands, `url`/`open` CLI commands, lock file behaviour, URL resolution chain, repo auto-detection, crloop view UI with "Finish Review" button, input validation.
- 2.1: Added FR-64 for `crloop skill --install` — copies the agent skill from the installed package to the Claude Code skills directory, with `--scope`, `--force`, `--dry-run`, `--json`, and `--print` flags.
- 2.2: Added FR-65 for `crloop finish-addressing` — completes the agent-addressing phase and re-enters agent-review for the next iteration.
