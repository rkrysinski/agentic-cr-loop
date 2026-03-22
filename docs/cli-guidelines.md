# CLI Guidelines

Design rules for all `crloop` CLI commands. Apply these when adding or changing commands.

---

## Naming

- **Binary**: `crloop` — all commands are `crloop <subcommand>`
- **Subcommand style**: kebab-case (`add-repo`, `stop-server`, `finish-self-review`)
- **Noun-first for resource commands** (`repos`, `add-repo`, `remove-repo`), **verb-first for action commands** (`serve`, `stop-server`, `open`)

---

## Flags

### Universal flags (on every command that talks to the server)

| Flag | Purpose |
|---|---|
| `--url URL` | Override server base URL |
| `--json` | Machine-readable JSON output instead of human text |

These two flags must be present on every command that makes HTTP calls. No exceptions.

### `--json` output

- Use `--json` as a **boolean flag** (not `--output json` or `--format json`) — this is established and consistent across all commands
- JSON output must be valid, parseable JSON written to stdout with no extra text
- Human-readable output goes to stdout; errors go to stderr
- `--json` suppresses update-available notices and other decorative output

### `--repo <repoId>`

Required on all agentic commands (those that operate on a specific repository). When omitted, auto-detect by matching the current working directory against registered repos via `GET /api/repos`. Commands that manage the server globally (`repos`, `stop-server`, `url`, `schema`) do not take `--repo`.

### `--dry-run`

Required on every **mutating** command. Validates inputs and reports what would happen without making any state change or HTTP write call. Must exit 0 on valid input, 1 on invalid. All of: `comment`, `finish-self-review`, `add-repo`, `remove-repo` have `--dry-run`.

Read-only commands (`export`, `status`, `repos`, `url`) do not need `--dry-run`.

---

## URL / Server Discovery

Commands resolve the server URL in this exact order — do not deviate:

1. `--url` flag
2. `CODE_REVIEW_URL` environment variable
3. Lock file `~/.crloop/server.json` (written by `crloop serve`)
4. Default `http://localhost:3000`

The lock file contains `{ "port": 3000, "pid": 12345, "startedAt": "..." }`. Commands that read it should verify the PID is still alive before trusting the port. Fall back to the default silently if the file is absent — only `crloop url` should error on a missing/stale lock file.

---

## Input Validation

Validate all agent-supplied inputs **at the CLI layer**, before any HTTP call. Agents hallucinate predictably; the CLI is the last line of defense.

| Input | Rule |
|---|---|
| `--file` | No `..` segments; must be a relative path |
| `--side` | Exactly `new` or `old` |
| `--line` | Positive integer |
| `--repo` | Alphanumeric and hyphens only; no `?`, `#`, `%` |
| Any ID in a URL segment | No `?`, `#`, `%` (no embedded query params) |

Validation failure: print a clear error to stderr, exit code 1, no HTTP request made.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error (validation failure, server unreachable, unexpected response) |
| `2` | Special success: `crloop wait` exits 2 when review is complete with no comments |

Do not use other exit codes. Never exit 0 on an error condition.

---

## Output Discipline (Context-Window Cost)

crloop commands are called by AI agents that pay per token. Keep output lean:

- Default human output: one line per item where possible
- `--json` output: raw API response or a minimal envelope — no padding
- For commands that can return large payloads (`export`), provide a `--file <path>` filter so the agent can scope output to the file(s) it is currently addressing
- Do not add ANSI colour codes to `--json` output
- Update-available notices are printed only in human mode (never in `--json` mode) and only after the main output

---

## Runtime Schema Introspection

`crloop schema [command]` is implemented and must stay up to date. Whenever a new command is added or an existing command's flags change, update the schema object in `src/server/cli.ts`. Agents use this to discover the CLI surface without reading documentation.

---

## What NOT to add

| Idea | Decision | Reason |
|---|---|---|
| `crloop changes` | **No** | Agent uses `git status` / `git diff` natively — no value in routing diffs through the server |
| `crloop diff` | **No** | Same reason |
| MCP server | **No** (deliberate) | Agent already has Bash; Skill+CLI scored 85 vs MCP's 70. Adds protocol overhead for no gain in a single-user local tool |
| `--output <format>` | **No** | `--json` boolean is established and sufficient; adding a string flag would be inconsistent |
| WebSocket / SSE push | **No** | Polling is sufficient for infrequent state transitions in a single-user local tool |

---

## Runtime

- **Compiled**: `tsc -p tsconfig.server.json` — CLI compiles alongside the server, no separate build step
- **Zero new dependencies**: use only Node.js built-ins (`node:fs`, `node:path`, `node:child_process`, `node:url`) and global `fetch()` (Node 18+)
- **Requires**: Node.js 18+, `git` on PATH

---

## SKILL.md Alignment

Every time a command is added or changed, check `skill/SKILL.md` for consistency:

- Remove references to commands that no longer exist
- Add new commands to the CLI Reference section
- Update the Full Loop Example if the workflow changes
- If a command outputs data the agent reads (like `export`), add an untrusted-input warning
