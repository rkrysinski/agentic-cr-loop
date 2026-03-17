# Architecture / Implementation Specification

## Scope Alignment

The application is a single-user local review tool for changes in a Git working directory. It reads local repository changes, renders them in unified and side-by-side diff formats, allows comments to be attached to changed lines, and exports all review comments as deterministic text that can be read by a human or passed to an AI agent.

[Initial requirements](./requirements.md)

## Assumptions

- The application is used by one reviewer on a local machine.
- Git is installed locally and the target directory is a valid Git repository with a readable `HEAD`.
- The reviewed change set is the current working directory state relative to `HEAD`, including staged and unstaged tracked changes.
- Untracked text files are treated as added files in the review view.
- Binary files may appear in the change list, but only text files support line-level comments.
- The tool does not edit repository contents, stage files, or create commits.

## Decisions

### Decision 1: Local-first web application

Decision:
Implement the app as a local HTTP backend with a browser-based frontend served from the same process in production.

Rationale:
This keeps the deployment model simple, satisfies the local-run requirement, and avoids the packaging overhead of a desktop shell while still allowing a rich diff UI.

### Decision 2: Git CLI is the source of truth for repository state

Decision:
Use the installed `git` executable for change discovery and patch generation instead of reimplementing diff behavior in application code.

Rationale:
This keeps behavior aligned with standard Git semantics, reduces implementation complexity, and avoids divergence between the tool and the repository's actual state.

### Decision 3: One canonical diff model backs both view modes

Decision:
Parse Git patch output into a normalized in-memory diff model, then render unified and side-by-side views from that shared structure.

Rationale:
A single source of truth prevents view-specific behavior drift and ensures that comment anchors remain consistent regardless of how the diff is displayed.

### Decision 4: Review state is stored in a repository-local metadata directory

Decision:
Persist comments and review session metadata in a repository-local `.local-code-review` directory at the Git top-level, with one JSON file per `HEAD` short id.

Rationale:
The storage location is predictable, easy to inspect, and easy for external tools or coding agents to write directly.

### Decision 5: Comments are anchored to changed diff lines

Decision:
Allow comments only on changed lines and store each comment with the minimal anchor: side (`old` or `new`), that side's line number, body, and diff fingerprint.

Rationale:
This keeps the file schema small while still preserving enough information to classify comments as current or outdated and render them in both diff modes.

### Decision 6: Text export is deterministic Markdown

Decision:
Generate a plain Markdown export for the full set of comments using fixed headings and field labels.

Rationale:
Markdown remains plain text, is easy for humans to scan, and is reliably parseable by downstream AI workflows without requiring HTML or binary export formats.

## Alternatives Considered

### Native desktop wrapper

Alternative:
Use Electron or Tauri for a desktop-packaged UI.

Why not chosen:
It adds packaging and platform concerns that are unnecessary for the initial local-only scope.

### Embedded Git library

Alternative:
Use a Git library instead of shelling out to `git`.

Why not chosen:
It increases implementation surface area and risks behavior mismatches for rename detection, patch formatting, and working-tree interpretation.

### Database-backed review storage

Alternative:
Store review state in SQLite.

Why not chosen:
The initial scope is single-user and local; file-based session storage is easier to reason about and maintain.

## System Structure

### Runtime Stack

- Backend: Node.js LTS with TypeScript.
- Frontend: React with TypeScript.
- Transport: Local HTTP JSON API on `localhost`.
- Build: Single backend process serves API routes and static frontend assets in production.

### Backend Components

#### Repository Adapter

Responsibilities:
- Validate repository root.
- Read repository metadata.
- Enumerate changed files.
- Request patch data from Git.

Implementation notes:
- Use `git diff HEAD --find-renames --patch` for tracked changes.
- Use `git status --porcelain` to discover untracked files.
- For untracked text files, generate an all-added synthetic diff from file contents.
- Treat binary diffs as non-commentable entries with summary metadata only.

#### Diff Parser

Responsibilities:
- Parse unified patch text into structured file, hunk, and line objects.
- Preserve old and new line numbers for each rendered row.
- Mark whether a row is commentable.

Implementation notes:
- Added lines are commentable on the `new` side.
- Removed lines are commentable on the `old` side.
- Context lines are not commentable in the initial scope.
- Side-by-side rendering is produced by pairing parsed old/new rows from the same hunk.

#### Comment Store

Responsibilities:
- Persist review session data inside the repository under `.local-code-review/`.
- Return comments by file and line anchor.
- Detect anchors that no longer match the current diff.

Implementation notes:
- Store one session file per `HEAD` short id.
- Use a plain JSON object keyed by repository-relative file path.
- Each stored comment records a stable `id` plus `side`, `line`, `body`, and `diffFingerprint`.
- Preserve stored comment ids across edits and deletions so API references stay stable.
- If the current file diff fingerprint no longer matches the stored fingerprint, mark the comment as outdated instead of silently moving it.

#### Exporter

Responsibilities:
- Produce a deterministic text document containing every review comment.
- Preserve enough context for both human and AI consumption.

Implementation notes:
- Export is generated on demand rather than treated as the primary storage format.
- Default export format is Markdown text with repository path, base reference, file path, anchor, and comment body.

#### API Layer

Responsibilities:
- Expose repository state, per-file diffs, comment creation, comment listing, and comment export.

Initial endpoints:
- `GET /api/repo`
- `GET /api/changes`
- `GET /api/changes/:changeId`
- `GET /api/comments?changeId=...`
- `POST /api/comments`
- `GET /api/export/comments.md`

### Frontend Components

#### Repository Summary

Responsibilities:
- Show the selected repository path and the current review base (`HEAD`).
- Display the number of changed files and the current view mode.

#### Change List

Responsibilities:
- List changed files with change type.
- Allow selecting a file for detailed review.

Implementation notes:
- Load the file list first.
- Fetch detailed diff content when a file is selected.

#### Diff Viewer

Responsibilities:
- Render the selected file in unified or side-by-side mode.
- Keep line anchors identical across both modes.
- Expose comment affordances on changed lines only.

Implementation notes:
- View mode is purely presentational; switching modes does not alter the underlying comment anchor.
- Inline comment markers are shown beside lines with existing comments.

#### Comment Panel

Responsibilities:
- Create a new comment for a selected changed line.
- Display existing comments for the selected file.
- Surface outdated comments separately when the current diff no longer matches the stored anchor.

## Data Model

```ts
type ChangeType = "added" | "modified" | "deleted" | "renamed" | "untracked"

type DiffLine = {
  kind: "context" | "added" | "removed"
  oldLineNumber: number | null
  newLineNumber: number | null
  text: string
  commentableSide: "old" | "new" | null
}

type DiffHunk = {
  header: string
  lines: DiffLine[]
}

type FileChange = {
  changeId: string
  changeType: ChangeType
  oldPath: string | null
  newPath: string | null
  isBinary: boolean
  diffFingerprint: string
  hunks: DiffHunk[]
}

type ReviewComment = {
  commentId: string
  path: string
  side: "old" | "new"
  lineNumber: number
  body: string
  diffFingerprint: string
}
```

## Primary Flows

### Load Review

1. User opens a local repository in the app.
2. Backend validates the repository and computes the current change list.
3. Frontend shows changed files and default view mode.

### Review a File

1. User selects a changed file.
2. Backend returns the normalized diff for that file plus its comments.
3. Frontend renders either unified or side-by-side output from the same diff model.

### Add a Comment

1. User selects a changed line.
2. Frontend posts the line anchor and comment body to the backend.
3. Backend persists the comment in the local session store and returns the saved record.

### Export Comments

1. User requests export.
2. Backend renders all comments into Markdown text in a fixed order.
3. Frontend presents the text for copy/download and can also pass it directly to an AI workflow.

## Export Format

The initial export format is Markdown text with deterministic ordering:

1. Repository metadata.
2. One section per changed file in path order.
3. One subsection per comment in line-order within the file.

Each comment block contains:
- File path.
- Anchor side and line number.
- Hunk header.
- Comment body.

This keeps the export readable and machine-friendly without introducing a second canonical review format.

## Project Layout

```text
/src/server
/src/client
/src/shared
```

Implementation guidance:
- `/src/server` contains Git access, diff parsing, session storage, export generation, and HTTP routes.
- `/src/client` contains the review UI, view-mode switching, and comment entry components.
- `/src/shared` contains shared types for diffs, comments, and API payloads.

## Constraints and Non-Goals

- No multi-user collaboration.
- No remote repository hosting integration.
- No pull-request synchronization.
- No repository mutation features such as staging, editing, or committing.
- No comments on unchanged context lines in the initial version.

These limits preserve the simple local-review scope described in the requirements.

## Version Changes

- 1.0: Defined a local-first single-user web application architecture using Git CLI diff generation, a shared normalized diff model for unified and side-by-side rendering, repository-local comment storage under `.local-code-review`, and deterministic Markdown export. This keeps setup simple and improves maintainability by separating repository access, diff parsing, comment persistence, and presentation.
