# API Reference

The frontend communicates with a local JSON API served by the Express backend. All endpoints return JSON; errors return `{ "error": "message" }`.

Shared request/response types: [`src/shared/api.ts`](../src/shared/api.ts)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repo` | Repository info (path, base ref, change count) |
| `GET` | `/api/changes` | List of changed files with comment counts |
| `GET` | `/api/changes/:changeId` | Full diff for a file (`?context=0\|3\|20\|100\|full`) |
| `GET` | `/api/comments?changeId=` | Current and outdated comments for a file |
| `POST` | `/api/comments` | Create a comment |
| `PATCH` | `/api/comments/:commentId` | Update a comment body |
| `DELETE` | `/api/comments/:commentId` | Delete a comment (204) |
| `GET` | `/api/export/comments.md` | Export all comments as Markdown |

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
      "side": "new",
      "line": 42,
      "body": "Consider splitting this component.",
      "diffFingerprint": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    }
  ]
}
```

Fields:
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
