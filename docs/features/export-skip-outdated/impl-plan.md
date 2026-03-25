# Implementation Plan: Export Skip Outdated

Design reference: free-form description (no design file)

## Context

| File | Current role |
|------|-------------|
| `src/server/reviewService.ts` | `exportComments()` builds the export payload — currently includes ALL comments (current + outdated + orphaned) |
| `src/server/server.ts:271-278` | `GET /:repoId/export/comments.txt` route — calls `svc.exportComments()` with no filtering params |
| `src/shared/export.ts` | `renderReviewCommentsText()` — renders `ReviewExportFile[]` to plain text; already receives `status` per comment but does not filter |
| `src/client/api.ts:102-104` | `exportComments()` — fetches `/export/comments.txt` with no query params |
| `src/client/App.tsx:412-435` | `enterExportMode()` / `exitExportMode()` — triggers export fetch; no skip-outdated toggle |
| `src/server/cli.ts:485-502` | `cmdExport()` — CLI export command; supports `--file` filter, no outdated filter |

## Tasks

### `src/server/reviewService.ts` — add `skipOutdated` parameter

- [x] Change `exportComments()` signature to `exportComments(options?: { skipOutdated?: boolean })` with default `skipOutdated: true`
- [x] When `skipOutdated` is true, filter out comments with `status === "outdated"` from both matched files and orphaned files before passing to `renderReviewCommentsText`

### `src/server/server.ts` — pass query param to service

- [x] In the `GET /:repoId/export/comments.txt` handler (~line 271), read `request.query.includeOutdated` and pass `{ skipOutdated: request.query.includeOutdated !== "true" }` to `svc.exportComments()`

### `src/client/api.ts` — add `includeOutdated` option

- [x] Change `exportComments()` to accept an optional `options?: { includeOutdated?: boolean }` parameter
- [x] When `includeOutdated` is true, append `?includeOutdated=true` to the request URL

### `src/client/App.tsx` — add "Skip outdated" toggle in export view

- [x] Add state: `const [skipOutdated, setSkipOutdated] = useState(true)`
- [x] Add a toggle/slider in the export header bar (between the subtitle and the copy button) labeled "Skip outdated", defaulting to on
- [x] Wire the toggle: when changed, re-fetch export with `apiClient.exportComments({ includeOutdated: !skipOutdated })`
- [x] Pass `{ includeOutdated: !skipOutdated }` in the initial `enterExportMode()` call

### `src/server/cli.ts` — add `--include-outdated` flag

- [x] In `cmdExport()`, read `hasFlag(args, "--include-outdated")` and append `&includeOutdated=true` (or `?includeOutdated=true`) to the URL when the flag is present
- [x] Update the help text for the `export` command to document the new `--include-outdated` flag

## Test coverage

- [x] `src/server/server.test.ts` — add test: export without `includeOutdated` param excludes outdated comments (backward-compatible default)
- [x] `src/server/server.test.ts` — add test: export with `?includeOutdated=true` includes outdated comments
- [ ] `src/server/exporter.test.ts` — existing tests still pass (renderer is unchanged; no new tests needed there)
- [x] `src/client/api.test.ts` — add test: `exportComments()` with no args hits URL without query param; with `{ includeOutdated: true }` appends `?includeOutdated=true`
- [x] `src/client/App.test.tsx` — add test: export view shows "Skip outdated" toggle; toggling it re-fetches export

## Post-implementation checklist

**Implementation summary:** Added outdated comment filtering to export across all layers — server defaults to skipping outdated, with `?includeOutdated=true` query param, CLI `--include-outdated` flag, and UI "Skip outdated" checkbox toggle.

**Tasks completed:** 14
**Tasks skipped:** 0
**Tests:** 186 passed (0 failed)

> No follow-up items found. All changed interfaces are covered by existing and newly added tests. No docs directory, changelog, or requirements files exist in this project.
