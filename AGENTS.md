# crloop — Agent Usage Guide

`crloop` is a local code-review loop server. An agent controls it via the CLI or directly via its HTTP API.

## Startup invariant

**Always start the server before any other command.**

```sh
crloop serve --repo /path/to/repo --port 3000
```

The server runs as a background daemon. Subsequent commands talk to it over HTTP.

## Machine-readable output

Every command except `serve` accepts `--json` to emit JSON instead of human text. Always use `--json` when parsing output programmatically.

```sh
crloop repos --json
# → [{"id":"my-repo","path":"/path/to/repo"}]

crloop add-repo /path/to/repo --json
# → {"id":"my-repo","path":"/path/to/repo"}

crloop remove-repo my-repo --json
# → {"id":"my-repo"}

crloop stop-server --json
# → {"stopped":true}
```

## Schema introspection

Get the full parameter schema for any command at runtime — no documentation needed:

```sh
crloop schema             # all commands
crloop schema add-repo    # single command
```

## Dry-run before mutations

Use `--dry-run` on any command that changes state. Combine with `--json` for structured output:

```sh
crloop add-repo /path/to/repo --dry-run --json
# → {"dryRun":true,"id":"repo","path":"/path/to/repo"}

crloop remove-repo my-repo --dry-run --json
# → {"dryRun":true,"id":"my-repo"}
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (details on stderr) |

Errors always go to **stderr**. Successful output always goes to **stdout**.

## HTTP API

The CLI is a thin wrapper over an HTTP API. Agents may call the API directly for richer data.

| Endpoint | Method | Description |
|---|---|---|
| `/api/repos` | GET | List registered repos |
| `/api/repos` | POST | Register a repo `{"path":"...","id":"..."}` |
| `/api/repos/:id` | DELETE | Remove a repo |
| `/api/repos/:id/repo` | GET | Repo info (baseRef, changeCount) |
| `/api/repos/:id/changes` | GET | List file changes |
| `/api/repos/:id/changes/:changeId` | GET | Single file diff |
| `/api/repos/:id/comments` | GET | All review comments |
| `/api/repos/:id/comments` | POST | Add a comment |
| `/api/repos/:id/comments/:commentId` | PATCH | Edit a comment |
| `/api/repos/:id/comments/:commentId` | DELETE | Delete a comment |
| `/api/server/stop` | POST | Gracefully stop the server |

All responses are JSON. Errors return `{"error":"..."}`.

## Repo ID derivation

If `--id` is omitted, the ID is derived from the directory basename:
- Lowercased
- Non-alphanumeric characters → `-`
- Consecutive hyphens collapsed
- Leading/trailing hyphens stripped
- Fallback: `"repo"`

Examples: `my_frontend` → `my-frontend`, `Backend.API` → `backend-api`

## Common workflows

### Review a PR branch

```sh
crloop serve --repo /path/to/repo
crloop repos --json                              # verify repo is registered
curl http://localhost:3000/api/repos/my-repo/changes   # list changed files
curl "http://localhost:3000/api/repos/my-repo/changes/src%2Ffoo.ts"  # get diff
curl -X POST http://localhost:3000/api/repos/my-repo/comments \
  -H 'Content-Type: application/json' \
  -d '{"changeId":"src/foo.ts","line":42,"body":"Consider using X here."}'
```

### Add a repo at runtime

```sh
crloop add-repo /new/repo --dry-run --json   # preview
crloop add-repo /new/repo --json             # apply
```
