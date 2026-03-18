# Implementation Plan: Multi-Repo Support

Design reference: [`design.md`](./design.md)

## Context for a fresh start

The codebase is a single-user local code review tool. Key files touched by this feature:

| File | Current role |
|------|-------------|
| `src/server/args.ts` | Parses `--repo <path>` + `--port` CLI args into `ServerOptions` |
| `src/server/server.ts` | `startServer({ repoPath, port })` — creates one `ReviewService`, registers flat routes |
| `src/server/runServer.ts` | Entry point: calls `parseServerOptions` then `startServer`, binds port |
| `src/server/reviewService.ts` | `ReviewService` — git operations, comment CRUD; **not changed** |
| `src/server/server.test.ts` | Integration tests against flat routes (`/api/changes`, etc.) |
| `src/shared/api.ts` | Shared TypeScript types for API request/response shapes |
| `src/client/api.ts` | Flat fetch functions (`getRepo()`, `getChanges()`, etc.) |
| `src/client/App.tsx` | Monolithic React app; imports directly from `api.ts` |

Phases must be done in order — each phase's output is an input to the next.

---

## Phases

### Phase 1 — Shared types
**Files:** `src/shared/api.ts`

- [x] Add `RepoEntry` type: `{ id: string; path: string }`
- [x] Add `RepoInfoResponse` type: `{ id: string; path: string; baseRef: string; changeCount: number }`
- [x] Rename existing `RepoResponse.repoPath` → `path`; drop `viewModeDefault` (unused by frontend state); keep `baseRef`
  - Note: `App.tsx` reads `repo.repoPath` — update that reference in Phase 10

---

### Phase 2 — Server: argument parsing
**Files:** `src/server/args.ts`

Current behaviour: exactly one `--repo <path>` required; produces `{ repoPath, port }`.

- [x] Change `ServerOptions` type to `{ repos: Array<{ id: string; path: string }>; port: number }`
- [x] Accept zero-or-more `--repo` args (remove the "missing --repo" hard error)
- [x] Parse `name:/path` syntax: if the value contains `:`, split on first `:` → `(name, path)`
- [x] For bare paths (no `:`), derive `id` from `path.basename` lowercased with non-`[a-z0-9]` → `-`
  - Examples: `/work/my_frontend` → `my-frontend`, `/repos/Backend.API` → `backend-api`
- [x] Detect duplicate `id` values across the collected repos; throw with a descriptive error listing both paths and the `name:/path` fix syntax
- [x] Resolve each path with `path.resolve()` (same as before)

---

### Phase 3 — Server: core rewrite
**Files:** `src/server/server.ts`

This is the largest change. The existing single-service, flat-route implementation is replaced entirely.

- [x] Change `startServer` signature:
  ```ts
  // Before
  startServer({ repoPath: string; port: number }, options?)
  // After
  startServer({ repos: Array<{ id: string; path: string }>; port: number }, options?)
  ```
- [x] Build `Map<string, ReviewService>` at startup: iterate `repos`, call `new ReviewService(path)` + `await validateRepository()` for each; fail fast on any error
- [x] Add `lookupRepo` helper:
  ```ts
  function lookupRepo(services: Map<string, ReviewService>, repoId: string, res: Response): ReviewService | null
  // returns the service or sends 404 and returns null
  ```
- [x] Create an Express `Router` with `mergeParams: true`; mount at `/api/repos/:repoId`
- [x] Migrate all route handlers onto the router (same logic, new relative paths):
  - `GET /repo` — merge `id` into `getRepoInfo()` response; also fetch `getChangeSummaries().length` for `changeCount`
  - `GET /changes`
  - `GET /changes/:changeId`
  - `GET /comments`
  - `POST /comments`
  - `PATCH /comments/:commentId`
  - `DELETE /comments/:commentId`
  - `GET /export/comments.md`
- [x] Remove all old flat route handlers (`/api/repo`, `/api/changes`, etc.)
- [x] Add `GET /api/repos` flat endpoint — returns `[...services.entries()].map(([id, svc]) => ({ id, path: svc.repoPath }))`
- [x] Add `POST /api/repos` flat endpoint:
  - Accept `{ path: string; id?: string }`
  - Derive `id` from basename if not provided (same algorithm as Phase 2)
  - Return `409` if `id` already in map
  - Validate and instantiate `ReviewService`; return `400` on failure
  - Insert into map; return `201 { id, path }`
- [x] Add `DELETE /api/repos/:repoId` flat endpoint — remove from map; return `204`; return `404` if not found

---

### Phase 4 — Server: entry point wiring
**Files:** `src/server/runServer.ts`

- [x] Update `startServer` call to pass `parsedOptions.repos` (array) instead of `parsedOptions.repoPath`
- [x] Remove any reference to `repoPath` from this file

---

### Phase 5 — Server: tests
**Files:** `src/server/server.test.ts`

- [x] Update `startServer` call: `{ repos: [{ id: 'test', path: repoPath }], port: 3000 }`
- [x] Update all route paths in existing tests:
  - `/api/changes` → `/api/repos/test/changes`
  - `/api/changes/:changeId` → `/api/repos/test/changes/:changeId`
  - `/api/comments` → `/api/repos/test/comments`
  - `/api/repo` → `/api/repos/test/repo`
  - `/api/export/comments.md` → `/api/repos/test/export/comments.md`
- [x] Add test: `GET /api/repos` returns array with `{ id: 'test', path: repoPath }`
- [x] Add test: unknown `repoId` in any route returns `404`
- [x] Add test: `POST /api/repos` with a valid second repo path → `201`, repo then appears in `GET /api/repos`
- [x] Add test: `POST /api/repos` with already-registered id → `409`
- [x] Add test: `POST /api/repos` with a non-git path → `400`
- [x] Add test: `DELETE /api/repos/test` → `204`; subsequent request to `/api/repos/test/changes` → `404`
- [x] Add test: `DELETE /api/repos/nonexistent` → `404`

---

### Phase 6 — CLI management commands
**Files:** new `src/cli/` directory

These are thin HTTP wrappers. The full `crloop` CLI binary is a separate future feature; these commands are the runtime repo management subset needed now. Implement as a simple command dispatcher in `src/server/index.ts` or as standalone scripts — TBD based on project structure at implementation time.

Each command reads `--url` (default `http://localhost:3000`) for the server base URL.

- [x] `crloop repos [--url URL]`
  - `GET /api/repos`; print tab-aligned `id   path` rows; print `(no repos registered)` on empty; exit non-zero on connection failure
- [x] `crloop add-repo <path> [--id <repoId>] [--url URL]`
  - `POST /api/repos { path, id? }`; print `Registered: <id> → <path>` on 201; print server error and exit non-zero on 400/409
- [x] `crloop remove-repo <repoId> [--url URL]`
  - `DELETE /api/repos/:repoId`; print `Removed: <repoId>` on 204; print error and exit non-zero on 404

---

### Phase 7 — Frontend: API client
**Files:** `src/client/api.ts`

Replace the flat exported functions with a factory. The existing flat functions are called directly by `App.tsx`; they are all replaced in Phase 10.

- [x] Add top-level `getRepos(): Promise<RepoEntry[]>` → `GET /api/repos`
- [x] Add top-level `registerRepo(path: string, id?: string): Promise<RepoEntry>` → `POST /api/repos`
- [x] Add top-level `unregisterRepo(repoId: string): Promise<void>` → `DELETE /api/repos/:repoId`
- [x] Create `createApiClient(repoId: string)` factory that returns an object with scoped versions of all resource functions:
  - `getRepo()` → `GET /api/repos/:repoId/repo`
  - `getChanges()` → `GET /api/repos/:repoId/changes`
  - `getChange(changeId, context)` → `GET /api/repos/:repoId/changes/:changeId`
  - `getComments(changeId)` → `GET /api/repos/:repoId/comments?changeId=`
  - `createComment(input)` → `POST /api/repos/:repoId/comments`
  - `updateComment(commentId, input)` → `PATCH /api/repos/:repoId/comments/:commentId`
  - `deleteComment(commentId)` → `DELETE /api/repos/:repoId/comments/:commentId`
  - `exportMarkdown()` → `GET /api/repos/:repoId/export/comments.md`
- [x] Export `ApiClient` type (the return type of `createApiClient`)
- [x] Remove old flat resource functions (they are dead after Phase 10)

---

### Phase 8 — Frontend: repo context and hook
**Files:** new `src/client/RepoContext.tsx`

- [x] Define context shape:
  ```ts
  type RepoContextValue = {
    repos: RepoEntry[];
    activeRepoId: string | null;
    setActiveRepoId: (id: string) => void;
    apiClient: ApiClient | null;  // null when no repo active
    refreshRepos: () => Promise<void>;
  }
  ```
- [x] `RepoProvider` component:
  - Fetches `GET /api/repos` at mount via `getRepos()`
  - Restores `activeRepoId` from `localStorage` keyed by `'crloop.repo.' + location.origin`; falls back to `repos[0].id`
  - Updates `localStorage` on `setActiveRepoId`
  - Re-derives `apiClient` from `createApiClient(activeRepoId)` whenever `activeRepoId` changes
  - Exposes `refreshRepos` to trigger a re-fetch (called by `RepoSelector` after register/unregister)
- [x] `useRepo()` hook — consumes the context; throws if used outside `RepoProvider`
- [x] Handle the case where `activeRepoId` from localStorage no longer exists in the re-fetched list (fall back to first entry, or null if empty)

---

### Phase 9 — Frontend: `RepoSelector` component
**Files:** new `src/client/RepoSelector.tsx`

Implements the three visual states from the design. Consumes `useRepo()`.

- [x] **State 1 (single repo):** render nothing — selector is hidden
- [x] **State 2 (two repos):** horizontal pill tab strip
  - Active tab: `#2D2D2D` bg, white bold text, `borderRadius: 16px`, `padding: 5px 12px`
  - Inactive tab: no bg, `#555555` text, same size
  - `fill_container` spacer pushing `+` button to the far right
  - `+` button: `#222222` bg, `borderRadius: 8px`; opens add-repo modal on click
  - Clicking a tab calls `setActiveRepoId`
- [x] **State 3 (3+ repos):** overflow mode
  - Pinned tabs: the two most recently active repos (LRU order tracked in local state)
  - Overflow pill: `#1E1E1E` bg, `+N ▾` label, `borderRadius: 16px`; clicking opens dropdown
  - Overflow dropdown: floating panel anchored below the pill; lists hidden repos; selecting a repo calls `setActiveRepoId` and swaps it into the pinned two (push LRU tab to overflow)
  - `+` button remains outside the overflow pill
- [x] **Zero-repo state (`repos.length === 0`):**
  - Render a centered placeholder in the sidebar body area:
    ```
    No repositories loaded.
    crloop add-repo <path>
    or click [+] to add one.
    ```
  - `[+]` opens the add-repo modal
- [x] **Add-repo modal** (used by `+` button in State 2, State 3, and zero-repo state):
  - Text field: "Repository path" (required)
  - Text field: "ID (optional)" (placeholder: derived from basename)
  - Add button: calls `registerRepo(path, id?)` then `refreshRepos()`; closes on 201
  - Inline error below path field on 400 (`Not a git repository`) and 409 (`ID already in use`)
  - Dismissed by `Esc` or click-outside
- [x] After `unregisterRepo` succeeds: call `refreshRepos()`; if removed repo was active, auto-select first remaining repo (or enter zero-repo state)

---

### Phase 10 — Frontend: App wiring
**Files:** `src/client/main.tsx`, `src/client/App.tsx`

- [x] In `main.tsx`: wrap `<App />` with `<RepoProvider>`
- [x] In `App.tsx`:
  - Replace `import { getRepo, getChanges, ... } from './api.js'` with `const { apiClient } = useRepo()`
  - Replace all direct API call sites with `apiClient.getRepo()`, `apiClient.getChanges()`, etc.
  - Guard all API calls: if `apiClient` is null (zero repos), skip and clear state
  - Update `repo.repoPath` → `repo.path` (field renamed in Phase 1)
  - Insert `<RepoSelector />` in the sidebar header between the logo row and the repo-info row
  - On `activeRepoId` change: reset file list, clear selected change, call `refreshAll()`
  - In zero-repo state: `<RepoSelector />` renders the empty state placeholder (Phase 9 handles this); `App` renders nothing in the sidebar body and no diff panel

---

### Phase 11 — Frontend: tests
**Files:** `src/client/App.test.tsx`, new `src/client/RepoSelector.test.tsx`

- [x] In `App.test.tsx`: mock `GET /api/repos` to return `[{ id: 'test', path: '/fake/path' }]`
- [x] Update all mocked API paths from flat routes to `/api/repos/test/...`
- [x] Add test: app renders with zero repos → shows empty state placeholder
- [x] Add `RepoSelector.test.tsx`:
  - State 1 (1 repo): selector not in DOM
  - State 2 (2 repos): both tabs rendered; clicking inactive tab calls `setActiveRepoId`
  - State 3 (3 repos): two pinned tabs + overflow pill visible; clicking overflow opens dropdown
  - Add-repo modal: submitting valid path calls `registerRepo` and `refreshRepos`
  - Add-repo modal: server 400 shows inline error; modal stays open

---

## Inter-phase dependencies

```
Phase 1 (types)
  └── Phase 2 (args)
  └── Phase 3 (server core)  ← depends on Phase 2 types
        └── Phase 4 (runServer)
        └── Phase 5 (tests)
  └── Phase 7 (api client)
        └── Phase 8 (context)
              └── Phase 9 (RepoSelector)
                    └── Phase 10 (App wiring)
                          └── Phase 11 (tests)
Phase 6 (CLI commands) — independent; can be done any time after Phase 3
```
