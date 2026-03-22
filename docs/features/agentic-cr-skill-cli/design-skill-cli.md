# Design: Agent Skill + CLI

## Overview

This design adds two things to enable the agent-human review loop:

1. A **CLI command layer** (`crloop <command>`) that wraps the existing HTTP API for terminal use.
2. An **Agent Skill** (`SKILL.md`) that teaches AI agents the CLI vocabulary and review loop workflow.

No new dependencies. No new transport layer. The CLI commands call the running HTTP server. The skill is a markdown file.

Requires Node.js 18+ and `git` on PATH.

## CLI Commands

The CLI is available as `crloop <command>` after global install, or `npx crloop <command>` without installing. See [distribution.md](./distribution.md) for install modes.

All commands except `serve` assume a review tool server is already running. Commands discover the server URL from `--url` (default `http://localhost:3000`) or a `CODE_REVIEW_URL` environment variable.

### Implementation Status

| Command | Status |
|---|---|
| `serve` | ✅ Implemented |
| `stop-server` | ✅ Implemented |
| `repos` | ✅ Implemented |
| `add-repo` | ✅ Implemented |
| `remove-repo` | ✅ Implemented |
| `schema` | ✅ Implemented |
| `changes` | 🔲 Planned (requires session coordination) |
| `diff` | 🔲 Planned |
| `comment` | 🔲 Planned |
| `comments` | 🔲 Planned |
| `export` | 🔲 Planned |
| `status` | 🔲 Planned |
| `finish-self-review` | 🔲 Planned |
| `wait` | 🔲 Planned |

---

## Implemented Commands

### `crloop serve`

Start the review server. Default command when no subcommand is given. Spawns a detached daemon and exits.

```
crloop serve [--repo <path>] [--repo name:<path>] [--port 3000]
```

Multiple `--repo` flags register multiple repos at startup. Use `name:/path` syntax for an explicit ID:

```
crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend
```

### `crloop stop-server`

Stop the running server.

```
crloop stop-server [--url URL] [--json]
```

Calls `POST /api/server/stop`. Outputs `Server stopped.` or `{"stopped": true}` with `--json`.

### `crloop repos`

List repos registered with the running server.

```
crloop repos [--url URL] [--json]
```

Default output (human-readable):
```
my-api   /path/to/api
frontend /path/to/frontend
```

With `--json`: raw JSON array from `GET /api/repos`.

### `crloop add-repo`

Register a repo with the running server at runtime.

```
crloop add-repo <path> [--id <repoId>] [--url URL] [--json] [--dry-run]
```

Calls `POST /api/repos`. The repo ID is derived from the directory basename (lowercased, non-alphanumeric → `-`) unless overridden with `--id`. Use `--dry-run` to preview the derived ID without registering.

### `crloop remove-repo`

Unregister a repo from the running server.

```
crloop remove-repo <repoId> [--url URL] [--json] [--dry-run]
```

Calls `DELETE /api/repos/:repoId`. Use `--dry-run` to preview without removing.

### `crloop schema`

Print machine-readable JSON schema for all commands or a single command.

```
crloop schema [command]
```

---

## Planned Commands (Agentic Workflow)

These commands require session coordination (`session.json`, state machine) which is not yet implemented. They will be built in the next phase.

All planned commands accept `--repo <repoId>` to target a specific repo when multiple repos are registered.

### `crloop changes`

List changed files with comment counts.

```
crloop changes [--repo <repoId>] [--url URL] [--json]
```

Default output (human-readable):
```
M  src/server/server.ts        (2 comments)
A  src/server/sessionStore.ts  (0 comments)
D  src/old/legacy.ts           (1 comment, 1 outdated)
```

With `--json`: raw JSON array from `GET /api/repos/:repoId/changes`.

### `crloop diff <file-path>`

Show the diff for a changed file.

```
crloop diff src/server/server.ts [--context 0|3|20|100|full] [--repo <repoId>] [--url URL] [--json]
```

Default output: unified diff text reconstructed from the API response hunks.
With `--json`: raw JSON from `GET /api/repos/:repoId/changes/:changeId`.

The command resolves `<file-path>` to a `changeId` by matching against the changes list. Accepts either the file path or the changeId directly.

### `crloop comment`

Add a comment to a changed line.

```
crloop comment \
  --file src/server/server.ts \
  --side new \
  --line 42 \
  --body "Extract this into a helper function"
  [--repo <repoId>] [--url URL]
```

Calls `POST /api/repos/:repoId/comments`. Prints the created comment ID on success.

### `crloop comment --from-file <path>`

Bulk-import comments from a JSON file.

```
crloop comment --from-file comments.json [--repo <repoId>] [--url URL]
```

The JSON file format:
```json
[
  {
    "file": "src/server/server.ts",
    "side": "new",
    "line": 42,
    "body": "Extract this into a helper function"
  },
  {
    "file": "src/server/server.ts",
    "side": "new",
    "line": 55,
    "body": "Add error handling here"
  }
]
```

The command resolves each `file` to a `changeId`, then calls `POST /api/repos/:repoId/comments` for each entry. Reports success/failure per comment.

### `crloop comments <file-path>`

List comments for a file.

```
crloop comments src/server/server.ts [--repo <repoId>] [--url URL] [--json]
```

Default output:
```
[current] new:42  Extract this into a helper function
[current] new:55  Add error handling here
[outdated] new:10  This looks wrong
```

With `--json`: raw JSON from `GET /api/repos/:repoId/comments?changeId=...`.

### `crloop export`

Export all comments as plain text.

```
crloop export [--repo <repoId>] [--url URL]
```

Prints the export to stdout. From `GET /api/repos/:repoId/export/comments.txt`.

### `crloop status`

Show review session status.

```
crloop status [--repo <repoId>] [--url URL] [--json]
```

Default output:
```
Status:     human-review
Iteration:  2
Comments:   5 current, 1 outdated
Head:       b58557fe1d0
```

With `--json`: raw JSON from `GET /api/repos/:repoId/session`.

Requires `GET /api/repos/:repoId/session` — not yet implemented (session coordination phase).

### `crloop finish-self-review`

Agent signals it has finished self-review and hands off to the human.

```
crloop finish-self-review [--repo <repoId>] [--url URL]
```

Calls `POST /api/repos/:repoId/session/transition` with `{ "status": "human-review" }`. Prints confirmation.

Requires `POST /api/repos/:repoId/session/transition` — not yet implemented.

### `crloop wait`

Block until the human finishes review.

```
crloop wait [--repo <repoId>] [--url URL] [--poll-interval 3]
```

Polls `GET /api/repos/:repoId/session` every N seconds. Exits when status changes to `agent-addressing` or `complete`. Prints the final status. Exit code 0 if `agent-addressing` (feedback to process), exit code 2 if `complete` (no comments, done).

This is the only command that blocks. It replaces the need for the agent to implement its own polling loop.

Requires session endpoints — not yet implemented.

---

## Implementation

### Entry Point: `src/server/cli.ts`

Existing file. Parses `process.argv` to dispatch to the correct command handler. Each command is a function that:
1. Reads `--url` or `CODE_REVIEW_URL`
2. Makes HTTP request(s) to the running server
3. Formats and prints output
4. Sets exit code

The file starts with `#!/usr/bin/env node` for npm bin linking.

### Registration: `package.json`

```json
{
  "name": "crloop",
  "private": false,
  "bin": {
    "crloop": "dist/server/server/cli.js"
  },
  "files": [
    "dist/server",
    "dist/client",
    "skill"
  ],
  "prepublishOnly": "npm run build && npm test"
}
```

The `bin` field makes `npx crloop <command>` and `crloop <command>` (after global install) work. The `files` field ensures only compiled output and the skill are included in the npm tarball. See [distribution.md](./distribution.md) for the full package.json and publish process.

### Runtime: tsc-compiled Node.js

The CLI is compiled by the existing `tsc -p tsconfig.server.json` alongside the server code. Uses only Node.js built-ins:
- `node:fs`, `node:path`, `node:child_process`, `node:url` for serve/daemonization
- Global `fetch()` for HTTP calls (Node.js 18+)
- No additional dependencies

### New Server Endpoints Required (for agentic commands)

The planned agentic CLI commands need two new per-repo endpoints that do not exist yet:

- `GET /api/repos/:repoId/session` — returns session status (status, iteration, head, comment counts)
- `POST /api/repos/:repoId/session/transition` — transition session state

These will be implemented as part of the session coordination phase. The remaining planned commands use existing per-repo endpoints under `GET/POST /api/repos/:repoId/...`.

## SKILL.md

The skill file is at `skill/SKILL.md` in the project root and is included in the published npm tarball (via the `files` whitelist). Users copy it to their agent's skill directory after install. See [distribution.md](./distribution.md#skill-distribution) for distribution details.

The SKILL.md will be finalized once the agentic CLI commands are implemented.

See [skill/SKILL.md](./skill/SKILL.md) for the current draft content.

## Workflow Sequence (Planned)

Commands shown without `npx` prefix (assumes global install or dev dependency).

```
Agent                                    CLI                       Server         Browser
  |                                       |                          |              |
  |-- (writes code) --------------------->                           |              |
  |                                       |                          |              |
  |-- crloop changes -------------------->|-- GET /repos/:id/changes->|              |
  |<-- file list -------------------------|<-- JSON -----------------|              |
  |                                       |                          |              |
  |-- crloop diff foo.ts ---------------->|-- GET /repos/:id/changes/x->|            |
  |<-- diff content ----------------------|<-- JSON -----------------|              |
  |                                       |                          |              |
  |-- (analyzes diff, writes comments.json)                          |              |
  |                                       |                          |              |
  |-- crloop comment --from-file ---------->|-- POST /repos/:id/comments->|          |
  |   comments.json                       |   (per comment)          |              |
  |<-- "5 created, 0 failed" -------------|<-- 201 ------------------|              |
  |                                       |                          |              |
  |-- crloop finish-self-review ---------->|-- POST /repos/:id/session/->|           |
  |                                       |   transition             |              |
  |<-- "Handed off to human" -------------|                          |-- banner --> |
  |                                       |                          |              |
  |-- crloop wait --------------------->|-- poll GET /repos/:id/session->|           |
  |   (blocks)                            |   every 3s               |              |
  |                                       |                          |   (human     |
  |                                       |                          |    reviews)  |
  |                                       |                          |              |
  |                                       |                          |<- Finish ----|
  |                                       |<-- "addressing" ---------|              |
  |<-- exit 0 ----------------------------|                          |              |
  |                                       |                          |              |
  |-- crloop export --------------------->|-- GET /repos/:id/export/->|             |
  |                                       |   comments.txt           |              |
  |<-- plain text ------------------------|<-- text/plain -----------|              |
  |                                       |                          |              |
  |-- (addresses comments, loops) ------->                           |              |
```
