# Local Git Review Tool

Local Git Review Tool is a single-user web application for reviewing the current state of a Git working directory on your machine.

It reads local changes relative to `HEAD`, renders them in unified and side-by-side diff views, lets you attach comments to changed lines, and exports all comments as deterministic Markdown that can be read by a human or passed to an AI agent.

## What It Does

- Reviews tracked working-tree changes relative to `HEAD`
- Includes both staged and unstaged tracked changes
- Detects untracked files and shows untracked text files as fully added files
- Renders diffs in unified and side-by-side modes from the same underlying diff model
- Allows comments only on changed lines
- Lets you edit and delete existing comments
- Stores comments in a repository-local metadata directory
- Marks comments as outdated when the underlying diff changes
- Exports review comments as Markdown

## Current Scope

This is an MVP focused on local review.

- Single user only
- Local repositories only
- No Git write operations
- No PR hosting integrations
- No multi-user collaboration
- No comments on unchanged context lines
- No automatic refresh when the repository changes on disk

## Requirements

Before running the app, make sure you have:

- `git` installed and available in `PATH`
- Node.js installed
- `npm` installed
- A valid Git repository with a readable `HEAD`

Notes:

- The app expects to review a real repository state relative to `HEAD`. A repo without an initial commit will fail validation.
- The repository to review is selected at startup with `--repo <path>`.

## Installation

Clone the repository and install dependencies:

```bash
git clone <your-copy-of-this-repo>
cd code-review
npm install
```

## Project Structure

```text
src/
  client/   React UI
  server/   Express server, Git integration, parsing, storage, export
  shared/   Shared TypeScript types for server and client
```

## Running In Development

Start the app in development mode and point it at the repository you want to review:

```bash
npm run dev -- --repo /absolute/path/to/repository
```

What this does:

- Starts the backend API server on `http://localhost:3000`
- Starts the Vite frontend dev server on `http://localhost:5173`
- Proxies `/api/*` calls from Vite to the backend

Open this URL in your browser:

```text
http://localhost:5173
```

Optional:

- You can also override the backend port by passing `--port <number>`

Example:

```bash
npm run dev -- --repo ~/work/my-project --port 3100
```

If you change the backend port in dev mode, update the Vite proxy configuration in [vite.config.ts](./vite.config.ts) or keep using port `3000`.

## Running A Production Build

Build the frontend and backend:

```bash
npm run build
```

Start the production server:

```bash
npm start -- --repo /absolute/path/to/repository
```

By default, the production server runs on:

```text
http://localhost:3000
```

You can override the port:

```bash
npm start -- --repo /absolute/path/to/repository --port 3100
```

In production mode, the backend serves the built frontend assets directly.

## Running Tests

Run the automated test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## How To Use The App

### 1. Start The App

Launch the app with `--repo` pointing to the repository you want to inspect.

### 2. Open The UI

In development, open the Vite URL.

In production, open the backend server URL.

### 3. Review Files

The left sidebar lists changed files. Select a file to load its diff.

For each file, the UI shows:

- File path
- Change type
- Comment counts
- Binary status when applicable

### 4. Switch Diff Modes

Use the view toggle in the header to switch between:

- `Unified`
- `Side by side`

This changes only the presentation. Comment anchors remain tied to the same underlying diff positions.

### 5. Add Comments

Comments can be added only on changed lines:

- Added lines can be commented on the `new` side
- Removed lines can be commented on the `old` side

To add a comment:

1. Click `Comment` next to a changed line
2. Enter your text in the comment panel
3. Click `Save comment`

### 6. Refresh Repository State

The app does not auto-refresh when files change on disk.

Use the `Refresh` button to reload:

- Repository summary
- Change list
- Selected diff
- Comment classification

### 7. Edit Or Delete Comments

Existing comments can be managed from the comment panel:

1. Click `Edit` on a comment card to update its text
2. Click `Save` to persist the change or `Cancel` to discard it
3. Click `Delete` to remove the comment entirely

Both current and outdated comments can be edited or deleted.

### 8. Export Comments

Click `Export Markdown` to fetch a deterministic Markdown document containing all stored comments for the selected review repository.

The export includes:

- Repository path
- Base ref
- File sections in stable order
- Comment anchor information
- Hunk header
- Comment body
- Current vs outdated status

## Comment Storage

Comments are stored inside the reviewed repository under:

```text
<repo-root>/.local-code-review/<head-short-id>.json
```

The file name is the current `HEAD` commit's short id, using a 12-character abbreviation such as `b58557fe1d0.json`.

This means:

- Comments persist across app restarts
- Review metadata travels with the repository checkout
- The app ignores `.local-code-review/` when listing reviewable changes

## Comment File Schema

Each review file is a plain JSON object keyed by repository-relative file path.

Example:

```json
{
  "src/client/App.tsx": [
    {
      "side": "new",
      "line": 42,
      "body": "Consider splitting this component.",
      "diffFingerprint": "abc123..."
    }
  ]
}
```

Schema:

- Top-level object:
  repository-relative file path -> array of comments for that file
- Comment object:
  - `side`: `"old"` or `"new"`
  - `line`: positive integer line number on that side
  - `body`: comment text
  - `diffFingerprint`: fingerprint of the diff version the comment was created against

Field semantics:

- `side`: `old` or `new`
- `line`: the line number on that side
- `body`: the comment text
- `diffFingerprint`: used to decide whether the comment is still `current` or has become `outdated`

Notes:

- File paths are relative to the Git repository root.
- Comment arrays preserve review order within a file.
- The on-disk file does not store runtime-only fields such as `commentId`.
- A coding agent can create a valid file by following this structure directly; no extra metadata is required.

## How Comment Validity Works

Each comment stores the diff fingerprint for the file version it was created against.

When the file diff changes:

- Matching comments stay `current`
- Non-matching comments become `outdated`

The app does not attempt to automatically move comments to new lines.

## How Changes Are Detected

The backend uses the installed Git CLI as the source of truth.

Tracked changes:

- Read with `git diff HEAD --find-renames --patch --binary --no-color`

Untracked files:

- Found with `git status --porcelain=v1 -z --untracked-files=all`

Behavior:

- Untracked text files are shown as added files
- Binary files are listed but are not line-commentable

## API Overview

The frontend talks to a local JSON API.

Main endpoints:

- `GET /api/repo`
- `GET /api/changes`
- `GET /api/changes/:changeId`
- `GET /api/comments?changeId=...`
- `POST /api/comments`
- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`
- `GET /api/export/comments.md`

The shared request and response types live in [src/shared/api.ts](./src/shared/api.ts).

## Limitations And Known Behavior

- The repository path must be supplied on startup
- The app reviews one repository per running process
- The repo must already have a readable `HEAD`
- Only changed lines are commentable
- Binary files cannot be commented on line-by-line
- Refresh is manual
- The UI is local-only and unauthenticated

## Troubleshooting

### Error: `Missing required --repo <path> argument`

Start the app with a repository path:

```bash
npm run dev -- --repo /path/to/repo
```

### Error: invalid Git repository or unreadable `HEAD`

Check that:

- The target path is a Git repository
- `git rev-parse --show-toplevel` works inside it
- The repository has at least one commit

### No files appear in the change list

The app only shows working-directory changes relative to `HEAD`.

Check whether the target repo actually has:

- Modified tracked files
- Deleted tracked files
- Renamed tracked files
- Untracked files

### Comments do not appear inline anymore

If the diff changed after the comment was created, the comment will move to the `Outdated` section instead of being silently re-anchored.

## Implementation References

Useful entrypoints:

- [package.json](./package.json)
- [src/server/index.ts](./src/server/index.ts)
- [src/server/server.ts](./src/server/server.ts)
- [src/server/reviewService.ts](./src/server/reviewService.ts)
- [src/client/App.tsx](./src/client/App.tsx)
