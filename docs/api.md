# API Reference

The frontend communicates with a local JSON API served by the Express backend. All endpoints return JSON; errors return `{ "error": "message" }`.

Shared request/response types: [`src/shared/api.ts`](../src/shared/api.ts)

## Endpoints

### Registry

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repos` | List all registered repos |
| `POST` | `/api/repos` | Register a new repo at runtime |
| `DELETE` | `/api/repos/:repoId` | Unregister a repo (204; stored comments are not deleted) |
| `POST` | `/api/server/stop` | Gracefully shut down the server (204) |

### Per-repo resources

All resource routes are scoped under `/api/repos/:repoId/`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repos/:repoId/repo` | Repository info (id, path, base ref, change count) |
| `GET` | `/api/repos/:repoId/changes` | List of changed files with comment counts |
| `GET` | `/api/repos/:repoId/changes/:changeId` | Full diff for a file (`?context=0\|3\|20\|100\|full`) |
| `GET` | `/api/repos/:repoId/comments?changeId=` | Current and outdated comments for a file |
| `POST` | `/api/repos/:repoId/comments` | Create a comment |
| `PATCH` | `/api/repos/:repoId/comments/:commentId` | Update a comment body |
| `DELETE` | `/api/repos/:repoId/comments/:commentId` | Delete a comment (204) |
| `GET` | `/api/repos/:repoId/export/comments.txt` | Export comments as plain text (skips outdated by default; `?includeOutdated=true` to include all) |
| `GET` | `/api/repos/:repoId/session` | Get review session state with comment counts |
| `POST` | `/api/repos/:repoId/session/transition` | Transition session state |
| `POST` | `/api/repos/:repoId/session/reset` | Reset session to default `agent-review` state |

### `GET /api/repos` response

```json
[
  { "id": "frontend", "path": "/home/user/projects/frontend" },
  { "id": "backend",  "path": "/home/user/projects/backend"  }
]
```

### `POST /api/repos` request / response

Request body:
```json
{ "path": "/home/user/projects/new-service", "id": "new-service" }
```
`id` is optional. If omitted, derived from the directory basename: lowercased, non-alphanumeric characters replaced by `-` (e.g. `/work/my_frontend` → `my-frontend`).

Success (`201 Created`):
```json
{ "id": "new-service", "path": "/home/user/projects/new-service" }
```

Error responses:
- `400` — path is not a valid git repository
- `409` — a repo with this `repoId` is already registered

### `GET /api/repos/:repoId/repo` response

```json
{
  "id":           "frontend",
  "path":         "/home/user/projects/frontend",
  "baseRef":      "main",
  "changeCount":  12,
  "headShortId":  "ba3428599239"
}
```

`id` is new relative to the old flat `/api/repo` endpoint; `path`, `baseRef`, and `changeCount` are unchanged. `headShortId` is the 12-character short SHA of the current HEAD commit; the client uses it as a cache key to invalidate the viewed-file set when HEAD changes.

### `GET /api/repos/:repoId/session` response

```json
{
  "status": "human-review",
  "iteration": 2,
  "headId": "",
  "startedAt": "2026-03-22T10:00:00.000Z",
  "updatedAt": "2026-03-22T10:01:30.000Z",
  "commentCounts": { "current": 5, "outdated": 1 }
}
```

`status` is one of: `agent-review`, `human-review`, `agent-addressing`, `complete`. Returns a default `agent-review` state if no session file exists.

### `POST /api/repos/:repoId/session/transition` request / response

Request body:
```json
{ "status": "human-review" }
```

Success (`200`): returns the updated session state (same shape as the GET response, without `commentCounts`).

Error responses:
- `400` — invalid transition (e.g. `agent-review → complete`) or missing `status` field

Valid transitions:
- `agent-review → human-review`
- `human-review → agent-addressing`
- `human-review → complete`
- `agent-addressing → agent-review` (increments `iteration`)

### `POST /api/repos/:repoId/session/reset` response

No request body required. Deletes the session file and returns the default session state:

```json
{
  "status": "agent-review",
  "iteration": 1,
  "headId": "",
  "startedAt": "2026-03-25T12:00:00.000Z",
  "updatedAt": "2026-03-25T12:00:00.000Z",
  "commentCounts": { "current": 0, "outdated": 0 }
}
```

Always succeeds (`200`). Safe to call even if no session file exists.

## Comment Storage

Comments are stored inside the reviewed repository at:

```
<repo-root>/.local-code-review/<head-short-id>.json
```

The file name is the current `HEAD` short commit id (12 characters), e.g. `b58557fe1d0.json`. Comments persist across restarts and travel with the repository checkout. The `.local-code-review/` directory is excluded from the reviewable change list.

### Schema

Each file is a JSON object keyed by repository-relative file path:

```json
{
  "src/client/App.tsx": [
    {
      "id": "1a2b3c4d5e6f",
      "side": "new",
      "line": 42,
      "body": "Consider splitting this component.",
      "diffFingerprint": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    }
  ]
}
```

Fields:
- `id` — stable comment identifier used by the update/delete API
- `side` — `"old"` (removed/pre-change lines) or `"new"` (added/post-change lines)
- `line` — 1-based line number on that diff side
- `body` — comment text (non-empty)
- `diffFingerprint` — SHA-256 hex digest of the diff version; if it no longer matches the current diff the comment is marked `outdated`

Machine-readable schema: [`docs/review-comments.schema.json`](./review-comments.schema.json)

## How Changes Are Detected

Tracked changes are read with:
```
git diff HEAD --find-renames --patch --binary --no-color
```

Untracked files are found with:
```
git status --porcelain=v1 -z --untracked-files=all
```

Untracked text files appear as fully added. Binary files are listed but cannot receive line comments.
