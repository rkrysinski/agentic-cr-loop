# Design: Agent Skill + CLI

## Overview

This design adds two things to enable the agent-human review loop:

1. A **CLI command layer** (`agentic-code-review <command>`) that wraps the existing HTTP API for terminal use.
2. An **Agent Skill** (`SKILL.md`) that teaches AI agents the CLI vocabulary and review loop workflow.

No new dependencies. No new transport layer. The CLI commands call the running HTTP server. The skill is a markdown file.

Requires Node.js 18+ and `git` on PATH.

## CLI Commands

The CLI is available as `agentic-code-review <command>` after global install, or `npx agentic-code-review <command>` without installing. See [distribution.md](./distribution.md) for install modes.

All commands except `serve` assume a review tool server is already running. Commands discover the server URL from `--url` (default `http://localhost:3000`) or a `CODE_REVIEW_URL` environment variable.

### `agentic-code-review serve`

Existing behavior, unchanged. Starts the server.

```
agentic-code-review serve --repo /path/to/repo [--port 3000]
```

### `agentic-code-review changes`

List changed files with comment counts.

```
agentic-code-review changes [--url URL] [--json]
```

Default output (human-readable):
```
M  src/server/server.ts        (2 comments)
A  src/server/sessionStore.ts  (0 comments)
D  src/old/legacy.ts           (1 comment, 1 outdated)
```

With `--json`: raw JSON array from `GET /api/changes`.

### `agentic-code-review diff <file-path>`

Show the diff for a changed file.

```
agentic-code-review diff src/server/server.ts [--context 0|3|20|100|full] [--url URL] [--json]
```

Default output: unified diff text reconstructed from the API response hunks.
With `--json`: raw JSON from `GET /api/changes/:changeId`.

The command resolves `<file-path>` to a `changeId` by matching against the changes list. Accepts either the file path or the changeId directly.

### `agentic-code-review comment`

Add a comment to a changed line.

```
agentic-code-review comment \
  --file src/server/server.ts \
  --side new \
  --line 42 \
  --body "Extract this into a helper function"
  [--url URL]
```

Calls `POST /api/comments`. Prints the created comment ID on success.

### `agentic-code-review comment --from-file <path>`

Bulk-import comments from a JSON file.

```
agentic-code-review comment --from-file comments.json [--url URL]
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

The command resolves each `file` to a `changeId`, then calls `POST /api/comments` for each entry. Reports success/failure per comment.

### `agentic-code-review comments <file-path>`

List comments for a file.

```
agentic-code-review comments src/server/server.ts [--url URL] [--json]
```

Default output:
```
[current] new:42  Extract this into a helper function
[current] new:55  Add error handling here
[outdated] new:10  This looks wrong
```

With `--json`: raw JSON from `GET /api/comments?changeId=...`.

### `agentic-code-review export`

Export all comments as markdown.

```
agentic-code-review export [--url URL]
```

Prints the markdown export to stdout. Same output as `GET /api/export/comments.md`.

### `agentic-code-review status`

Show review session status.

```
agentic-code-review status [--url URL] [--json]
```

Default output:
```
Status:     human-review
Iteration:  2
Comments:   5 current, 1 outdated
Head:       b58557fe1d0
```

With `--json`: raw JSON from `GET /api/session`.

### `agentic-code-review finish-self-review`

Agent signals it has finished self-review and hands off to the human.

```
agentic-code-review finish-self-review [--url URL]
```

Calls `POST /api/session/transition` with `{ "status": "human-review" }`. Prints confirmation.

### `agentic-code-review wait`

Block until the human finishes review.

```
agentic-code-review wait [--url URL] [--poll-interval 3]
```

Polls `GET /api/session` every N seconds. Exits when status changes to `agent-addressing` or `complete`. Prints the final status and export path. Exit code 0 if `agent-addressing` (feedback to process), exit code 2 if `complete` (no comments, done).

This is the only command that blocks. It replaces the need for the agent to implement its own polling loop.

## Implementation

### Entry Point: `src/server/cli.ts`

New file. Parses `process.argv` to dispatch to the correct command handler. Each command is a function that:
1. Reads `--url` or `CODE_REVIEW_URL`
2. Makes HTTP request(s) to the running server
3. Formats and prints output
4. Sets exit code

The file must start with `#!/usr/bin/env node` for npm bin linking.

### Registration: `package.json`

```json
{
  "name": "agentic-code-review",
  "private": false,
  "bin": {
    "agentic-code-review": "dist/server/server/cli.js"
  },
  "files": [
    "dist/server",
    "dist/client",
    "skill"
  ],
  "prepublishOnly": "npm run build && npm test"
}
```

The `bin` field makes `npx agentic-code-review <command>` and `agentic-code-review <command>` (after global install) work. The `files` field ensures only compiled output and the skill are included in the npm tarball. See [distribution.md](./distribution.md) for the full package.json and publish process.

### Runtime: tsc-compiled Node.js

The CLI is compiled by the existing `tsc -p tsconfig.server.json` alongside the server code. Uses only Node.js built-ins:
- `node:util.parseArgs` for argument parsing
- Global `fetch()` for HTTP calls (Node.js 18+)
- No additional dependencies

### Estimated Size

~300-400 lines. Each command is 20-40 lines (parse args, fetch, format output). The `serve` command delegates to the existing `index.ts` entry point.

### New Server Endpoints Required

The CLI needs two new endpoints that do not exist yet:

- `GET /api/session` — returns session status (status, iteration, head, comment counts). This is part of the combined design's session coordination feature and would be implemented alongside the `session.json` work.
- `POST /api/session/transition` — transition session state. Same.

The remaining CLI commands use only existing endpoints.

## SKILL.md

The skill file is at `skill/SKILL.md` in the project root and is included in the published npm tarball (via the `files` whitelist). Users copy it to their agent's skill directory after install. See [distribution.md](./distribution.md#skill-distribution) for distribution details.

See [skill/SKILL.md](./skill/SKILL.md) for the full content.

## Workflow Sequence

Commands shown without `npx` prefix (assumes global install or dev dependency). Prepend `npx` if running without install.

```
Agent                                    CLI                       Server         Browser
  |                                       |                          |              |
  |-- (writes code) --------------------->                           |              |
  |                                       |                          |              |
  |-- agentic-code-review changes ------->|-- GET /api/changes ----->|              |
  |<-- file list -------------------------|<-- JSON -----------------|              |
  |                                       |                          |              |
  |-- agentic-code-review diff foo.ts --->|-- GET /api/changes/x --->|              |
  |<-- diff content ----------------------|<-- JSON -----------------|              |
  |                                       |                          |              |
  |-- (analyzes diff, writes comments.json)                          |              |
  |                                       |                          |              |
  |-- agentic-code-review comment ------->|-- POST /api/comments --->|              |
  |   --from-file comments.json           |   (per comment)          |              |
  |<-- "5 created, 0 failed" -------------|<-- 201 ------------------|              |
  |                                       |                          |              |
  |-- agentic-code-review --------------->|-- POST /api/session/ --->|              |
  |   finish-self-review                  |   transition             |              |
  |<-- "Handed off to human" -------------|                          |-- banner --> |
  |                                       |                          |              |
  |-- agentic-code-review wait ---------->|-- poll GET /session ---->|              |
  |   (blocks)                            |   every 3s               |              |
  |                                       |                          |   (human     |
  |                                       |                          |    reviews)  |
  |                                       |                          |              |
  |                                       |                          |<- Finish ----|
  |                                       |<-- "addressing" ---------|              |
  |<-- exit 0, prints export path --------|                          |              |
  |                                       |                          |              |
  |-- agentic-code-review export -------->|-- GET /api/export ------>|              |
  |<-- markdown --------------------------|<-- text/markdown --------|              |
  |                                       |                          |              |
  |-- (addresses comments, loops) ------->                           |              |
```
