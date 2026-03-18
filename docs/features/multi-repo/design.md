# Design: Multi-Repo Support

## Overview

Replace the current single-repo server model (`--repo` path at startup → one `ReviewService`) with support
for multiple repositories in a single running server instance.

This design is a prerequisite for the CLI/skill feature (`crloop`). Every CLI command embeds
the API routing model; changing it after the CLI is built means breaking changes. The routing model is locked
in here.

No new runtime dependencies. Comment storage (`.local-code-review/` inside each repo) is unchanged.

## Decisions

### Decision 1: API Routing — path prefix per repo

**Decision:**
All resource routes move under `/api/repos/:repoId/`. A `GET /api/repos` discovery endpoint lists all
registered repos. There are no flat-route aliases.

**Rationale:**
Path prefix is the industry-standard REST pattern for scoped resources. The `repoId` is visible in every
URL, making logs, curl one-liners, and agent tool calls self-describing. It composes naturally with the
future session endpoints (`/api/repos/:repoId/session`). Flat-route aliases were evaluated and rejected:
they create a maintenance surface (two code paths for the same logic) without providing stable backward
compatibility — the frontend and CLI must discover `repoId` regardless, since they need to populate a
selector or `--repo` flag. A clean cut to prefixed routes is simpler.

**Query param** (`?repo=repoId`) was evaluated as a close alternative. It avoids URL restructuring but
requires `?repo=` on every POST/PATCH/DELETE request. For PATCH/DELETE on commentIds, the param is required
for correctness (commentIds are only unique within a repo), making it an implicit hard requirement that is
easy to miss and impossible to enforce from the URL structure. Path prefix is more explicit.

**Multi-port** (one server process per repo) was evaluated as the zero-implementation-change option. Its
fundamental problem is that `repoId = port number`: ports are not stable across restarts, are not human
readable in URL logs, and require external alias management that drifts from the actual running state.
Multi-port is recommended as a valid personal workflow but not as the server design.

### Decision 2: Server Startup — optional `--repo` flags at startup; runtime registration via API

**Decision:**
The server can start with zero, one, or many repos. Repos passed via `--repo` at startup are registered
immediately (same behaviour as before for the single-repo case). Repos can also be added to a running
server at any time via `POST /api/repos` without a restart. A `DELETE /api/repos/:repoId` endpoint
removes a repo from the registry.

```
# Start with no repos pre-loaded — register later via API or crloop add-repo
crloop serve --port 3000

# Start with one repo (existing behaviour — no change to UX)
crloop serve --repo /path/to/repo --port 3000

# Start with two repos, auto-named from basename
crloop serve \
  --repo /path/to/frontend \
  --repo /path/to/backend \
  --port 3000

# Start with two repos with explicit names (required when basenames collide)
crloop serve \
  --repo fe:/path/to/frontend \
  --repo be:/path/to/backend \
  --port 3000

# Add a repo to the already-running server
crloop add-repo /path/to/another-repo [--id myrepo] [--url http://localhost:3000]
```

Startup sequence:
1. Parse all `--repo` arguments into `(id, path)` pairs (zero is valid).
2. Derive `repoId` from each path (see Decision 3).
3. Detect duplicate `repoId` values — fail fast with a clear error message.
4. Register each repo (validate + instantiate `ReviewService`) — fail fast if any path is invalid.
5. Bind port and register routes.

Runtime registration sequence (triggered by `POST /api/repos`):
1. Receive `{ path: string; id?: string }`.
2. Derive `repoId` from `id` if provided, otherwise from basename.
3. Reject with `409 Conflict` if `repoId` is already registered.
4. Validate path and instantiate `ReviewService` — reject with `400` on failure.
5. Add to registry; the repo is immediately available at `/api/repos/:repoId/`.

### Decision 3: Repo Identity — basename with sanitization and explicit override

**Decision:**
`repoId` is derived from the directory basename of the repo path: lowercased, with non-alphanumeric
characters replaced by `-`. The user can override with the `name:/path` syntax at startup.

Derivation algorithm:
```
/path/to/my_frontend   →  "my-frontend"
/work/Backend.API      →  "backend-api"
/repos/code-review     →  "code-review"
```

If two `--repo` paths produce the same derived `repoId`, the server refuses to start:
```
Error: duplicate repoId "api-service" from paths:
  /work/project-a/api-service
  /work/project-b/api-service
Use the name:path syntax to disambiguate:
  --repo project-a:/work/project-a/api-service
  --repo project-b:/work/project-b/api-service
```

**Stability:** the derived `repoId` is stable as long as the directory name does not change.
Renaming the directory requires restarting the server with a new `--repo` argument — this is expected
and acceptable for a local dev tool. A path hash would be stable but unreadable in URLs and logs.

**URL safety:** the lowercasing + `-` substitution guarantees the result matches `[a-z0-9-]+`, requiring
no percent-encoding in URL path segments.

### Decision 4: ReviewService lifecycle — created and validated at registration time; held for server lifetime

**Decision:**
A `ReviewService` is created and validated (`validateRepository()`) at the moment a repo is registered —
either during startup (from `--repo` flags) or at runtime (from `POST /api/repos`). Once registered,
the instance is held in a `Map<string, ReviewService>` for the lifetime of the server. `DELETE /api/repos/:repoId`
removes the instance from the map; it is not destroyed, but no new requests can reach it.

**Rationale:**
Validation happens immediately at registration time regardless of whether registration is at startup or
runtime. This preserves the fail-fast property: a bad path or non-git directory produces a clear error at
the `add-repo` call, not on a later API request. `ReviewService` holds no long-lived I/O handles, so
holding N instances is memory-proportional to N repos with no other overhead. Node.js's single-threaded
event loop means the `Map` mutation in `POST /api/repos` is safe without locks — the async `await` on
`validateRepository()` runs to completion before the entry is inserted.

Route handlers look up the service from the map using `:repoId` from the URL:
```ts
const svc = services.get(req.params.repoId);
if (!svc) return res.status(404).json({ error: "Unknown repoId" });
```

### Decision 5: Frontend — hidden selector for single-repo, visible for multi-repo

**Decision:**
The frontend fetches `GET /api/repos` at mount. If the response contains one repo, no selector is shown
and the UI behaves identically to today. If it contains more than one, a compact repo selector appears
at the top of the sidebar.

Selected `repoId` is stored in React state (not the URL). Switching repos resets the file list and
clears any open diff panel. The current selection is persisted in `localStorage` keyed by server origin
so a page reload restores it.

All API calls are made through a thin `apiClient(repoId)` factory that scopes URLs to
`/api/repos/:repoId/`. Components do not construct URLs directly. Switching repos means passing a new
`repoId` to the factory, not changing call sites.

The single-repo case adds exactly one network round-trip at mount (`GET /api/repos`) before the UI can
render. All existing component behaviour is preserved.

### Decision 6: CLI addressing — `--repo` flag with implicit single-repo fallback

**Decision:**
CLI data commands (`changes`, `diff`, `comment`, `export`, `status`, `wait`, etc.) gain a `--repo <repoId>`
flag. Resolution order:

1. `--repo <repoId>` flag (explicit)
2. `CODE_REVIEW_REPO` environment variable
3. Implicit: if `GET /api/repos` returns exactly one entry, use it automatically
4. Error — distinct message per case:

| Situation | Error message |
|-----------|---------------|
| `--repo xyz` given but not in registry | `Error: repo "xyz" not found. Registered: frontend, backend.` |
| `CODE_REVIEW_REPO=xyz` set but not found | `Error: CODE_REVIEW_REPO "xyz" not found. Registered: frontend, backend.` |
| 0 repos registered (no flag/env) | `Error: no repos registered. Run: crloop add-repo <path>` |
| 2+ repos registered (no flag/env) | `Error: multiple repos registered, --repo required. Registered: frontend, backend.` |

```
# Single-repo server — all existing invocations unchanged
crloop diff src/foo.ts
crloop export

# Multi-repo server — explicit flag
crloop diff src/foo.ts --repo backend
crloop export --repo frontend

# Multi-repo server — env var
CODE_REVIEW_REPO=backend crloop diff src/foo.ts

# List registered repos
crloop repos
```

The implicit single-repo fallback (rule 3) means zero changes to any existing single-repo CLI workflow.
The `--repo` flag is additive; no existing command shape changes.

---

## API Route Changes

All existing routes move under `/api/repos/:repoId/`. The flat routes are removed (not aliased).
One new discovery endpoint is added.

### New route table

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repos` | List all registered repos |
| `POST` | `/api/repos` | Register a new repo at runtime |
| `DELETE` | `/api/repos/:repoId` | Unregister a repo (204; does not delete stored comments) |
| `GET` | `/api/repos/:repoId/repo` | Repository info (path, base ref, change count) |
| `GET` | `/api/repos/:repoId/changes` | List of changed files with comment counts |
| `GET` | `/api/repos/:repoId/changes/:changeId` | Full diff for a file (`?context=0\|3\|20\|100\|full`) |
| `GET` | `/api/repos/:repoId/comments?changeId=` | Current and outdated comments for a file |
| `POST` | `/api/repos/:repoId/comments` | Create a comment |
| `PATCH` | `/api/repos/:repoId/comments/:commentId` | Update a comment body |
| `DELETE` | `/api/repos/:repoId/comments/:commentId` | Delete a comment (204) |
| `GET` | `/api/repos/:repoId/export/comments.md` | Export all comments as Markdown |
| `GET` | `/api/repos/:repoId/session` | Session status *(future: session coordination feature)* |
| `POST` | `/api/repos/:repoId/session/transition` | Transition session state *(future)* |

### `GET /api/repos` response shape

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
`id` is optional. If omitted, derived from basename (see Decision 3).

Success (`201 Created`):
```json
{ "id": "new-service", "path": "/home/user/projects/new-service" }
```

Error responses:
- `400` — path is not a valid git repository
- `409` — a repo with this `repoId` is already registered

### `GET /api/repos/:repoId/repo` response shape

```json
{
  "id":          "frontend",
  "path":        "/home/user/projects/frontend",
  "baseRef":     "main",
  "changeCount": 12
}
```

`id` is new relative to the old flat `/api/repo` endpoint (included so the frontend can confirm which repo it is talking to). `path`, `baseRef`, and `changeCount` are carried over unchanged.

### `DELETE /api/repos/:repoId`

Returns `204 No Content`. The repo's `.local-code-review/` directory and all stored comments are
**not deleted** — they remain on disk inside the repo. Only the server's in-memory registry entry is
removed. Re-registering the same path restores access to all previously stored comments.

### Removed routes

All flat routes (`/api/repo`, `/api/changes`, `/api/comments`, etc.) are removed. There are no redirects
or aliases. The frontend and CLI both call `GET /api/repos` at startup to discover available repos;
rebuilding call sites to include `repoId` is straightforward and leaves no ambiguous compatibility surface.

---

## Server Startup Changes

### `startServer` signature

```ts
// Before
startServer({ repoPath: string; port: number })

// After
startServer({ repos: Array<{ id: string; path: string }>; port: number })
```

A one-element array for the single-repo case preserves all existing behaviour.

### Internal routing structure

Routes are registered on an Express `Router` mounted at `/api/repos/:repoId`. The router parameter
provides `repoId` to all handlers. A `lookupRepo` helper at the top of each handler resolves
`repoId → ReviewService` and returns 404 if not found.

```ts
const router = express.Router({ mergeParams: true });

router.get("/repo", async (req, res, next) => {
  try {
    const svc = lookupRepo(services, req.params.repoId, res);
    if (!svc) return;
    res.json(await svc.getRepoInfo());
  } catch (err) { next(err); }
});

app.use("/api/repos/:repoId", router);
app.get("/api/repos", (_req, res) => {
  res.json([...services.entries()].map(([id, svc]) => ({ id, path: svc.repoPath })));
});
```

### CLI `serve` command changes

The argument parser is extended to:
- Accept zero or more `--repo` arguments (currently requires exactly one).
- Parse the optional `name:/path` syntax.
- Derive `repoId` from basename when no name is given.
- Detect duplicate `repoId` values and exit with a descriptive error.
- Pass `{ id, path }[]` (possibly empty) to `startServer`.

Single `--repo` invocations produce a one-element array — no user-visible behaviour change.

### New `crloop add-repo` command

Registers a repo with the running server without a restart.

```
crloop add-repo <path> [--id <repoId>] [--url URL]
```

Calls `POST /api/repos` with `{ path, id? }`. On success, prints the assigned `repoId`. On failure,
prints the server error and exits non-zero.

```
$ crloop add-repo /home/user/projects/new-service
Registered: new-service → /home/user/projects/new-service

$ crloop add-repo /home/user/work/api --id my-api
Registered: my-api → /home/user/work/api
```

### New `crloop remove-repo` command

Unregisters a repo from the running server (does not delete stored comments).

```
crloop remove-repo <repoId> [--url URL]
```

Calls `DELETE /api/repos/:repoId`. Prints confirmation on success.

### New `crloop repos` command

Lists all repos currently registered with the running server.

```
crloop repos [--url URL]
```

Calls `GET /api/repos`. Output (tab-aligned columns):

```
frontend   /home/user/projects/frontend
backend    /home/user/projects/backend
```

Empty registry:

```
(no repos registered)
```

Exit 0 on success, non-zero on connection failure.

---

## Frontend Changes

Design reference: `docs/features/new-look-and-feel/new-look-and-feel.pen` — Screen 4 (Dark · Multi-Repo
Selector) and the "Repo Selector · Component States" detail panel.

### Selector states

The repo selector has three distinct visual states depending on the number of registered repos.

#### State 1 — single repo (selector hidden)

No tab strip is rendered. The sidebar header shows only the existing repo/branch row
(`📁 my-project / 🌿 dev`). Behaviour is identical to the current single-repo UI. This state is entered
whenever `GET /api/repos` returns exactly one entry.

#### State 2 — two repos (tab strip)

A horizontal tab strip appears in the sidebar header between the logo row and the active-repo info row.
Each registered repo is a pill-shaped tab:

- **Active tab**: `#2D2D2D` background, white bold text (`JetBrains Mono 11px 600`), `cornerRadius: 16`,
  `padding: [5, 12]`.
- **Inactive tab**: no background, muted text (`#555555`), same size/radius.
- **`+` button**: at the far right of the strip (pushed there by a `fill_container` spacer), `#222222`
  background, `cornerRadius: 8`, `padding: [4, 7]`. Calls `POST /api/repos` to register a new repo.

Below the tab strip, the active-repo info row remains: `📁 frontend / 🌿 dev`. Switching tabs updates
this row and reloads the file list.

#### State 3 — three or more repos (overflow tab strip)

The two most recently active repos are pinned as visible pill tabs. All remaining repos collapse into an
overflow indicator at the right of the strip:

- **Overflow pill**: `#1E1E1E` background, muted text `+N` followed by a `chevron-down` icon,
  `cornerRadius: 16`, `padding: [5, 10]`.
- Clicking the overflow pill opens a floating dropdown listing the hidden repos by `repoId`.
- Selecting a repo from the dropdown makes it the active tab and pins it into the visible two, pushing
  the least-recently-used visible tab into the overflow list.
- The `+` add-repo button remains at the far right, outside the overflow pill.

The overflow threshold is **2 pinned tabs**. This is fixed — it is not configurable — because the
sidebar is 220px wide with 48px horizontal padding, leaving 172px for the tab strip. Two tabs plus the
overflow pill and add button fit comfortably; a third pinned tab does not.

### Layout within the sidebar header

```
┌─ Sidebar Header (vertical, gap: 10, padding: [24, 24, 14, 24]) ──────────┐
│  [git-pull-request icon]  code_review                                     │  ← logo row (unchanged)
│  ────────────────────────────────────────────── (1px divider, #252525)   │
│  [frontend]  backend  ·········  +2▾  [+]                                │  ← tab strip (State 2/3)
│  [folder icon] frontend /  [branch icon] dev                              │  ← active repo info row
│  // changed_files                              +14  -5                    │  ← stats row (unchanged)
└───────────────────────────────────────────────────────────────────────────┘
```

The divider and tab strip rows are inserted between the existing logo row and the active-repo info row.
In State 1 (single repo) both are hidden; the active-repo info row displays as before.

### Add-repo modal (`+` button)

Clicking `+` (in State 2 or State 3) opens a compact modal:

- **Repository path** — required text field, placeholder `/path/to/repo`
- **ID (optional)** — optional text field, placeholder derived from basename
- **Add** button — calls `POST /api/repos { path, id? }`; closes modal on 201; triggers a `GET /api/repos` re-fetch
- **Inline error** below the path field on failure: `400 → "Not a git repository"`, `409 → "ID already in use"`
- Dismissed by `Esc` or clicking outside the modal

No OS directory picker — browser-side directory chooser APIs are inconsistent and the tool is path-driven by convention.

### Zero-repo state

When `GET /api/repos` returns `[]` — whether on initial load or after all repos are removed — the UI enters a single zero-repo state:

- Tab strip: hidden
- Sidebar body (replacing the file list):
  ```
  No repositories loaded.

  crloop add-repo <path>

  or click  [+]  to add one.
  ```
  The `[+]` in the placeholder opens the add-repo modal above.
- Diff panel: hidden

This state is entered via the same `GET /api/repos` re-fetch path used after `POST`/`DELETE` operations — no separate initial-load handling is needed.

### Overflow dropdown

The dropdown is a floating panel anchored below the overflow pill, rendered outside the sidebar's layout
flow (positioned absolutely or via a portal). It lists each hidden repo as a row:

```
┌──────────────────────┐
│  api-service         │  ← dimmed (#777777), hover: #2D2D2D bg
│  shared-libs         │
└──────────────────────┘
```

Clicking a row: selects that repo, closes the dropdown, swaps it into the visible tab strip.

### Behaviour on repo list change

When `POST /api/repos` or `DELETE /api/repos/:repoId` succeeds, the frontend re-fetches `GET /api/repos`
and re-evaluates which state to enter. If the active repo is removed, the first remaining repo is
auto-selected. If all repos are removed, the UI shows an empty state prompting `crloop add-repo`.

### Persistence

The last selected `repoId` for a given server origin is stored in `localStorage`. On page reload it is
pre-selected before the file list loads, falling back to the first entry from `GET /api/repos` if the
stored value no longer exists.

### API client layer

All components obtain a `repoId`-scoped API client from React context. No component constructs a URL
directly. The context is populated from `GET /api/repos` at mount.

---

## CLI Forward Compatibility Contract

The CLI is built against this multi-repo API. The following rules must hold across all future API changes:

1. `GET /api/repos` always returns an array with at least `id` and `path` fields per entry. New fields
   may be added; existing fields may not be removed.

2. All resource routes live under `/api/repos/:repoId/`. No resource is ever moved to a flat route.

3. `repoId` values in URL path segments always match `[a-z0-9-]+`. No encoding is required for CLI
   `--repo` flag values that follow this pattern.

4. The CLI implements the implicit single-repo fallback by calling `GET /api/repos` and using the sole
   entry when exactly one is returned. The server's contract is that `GET /api/repos` is always the
   authoritative registry — the CLI relies on this, not on any server-side routing shortcut.

5. The `CODE_REVIEW_REPO` environment variable is the authoritative way for agent scripts to set a
   default repo without repeating `--repo` on every command.

6. `POST /api/repos` and `DELETE /api/repos/:repoId` are the stable runtime registration API. The CLI
   `add-repo` and `remove-repo` commands are thin wrappers over these endpoints; agents and scripts may
   call them directly via HTTP.

These rules ensure that any CLI command written today against a single-repo server works against a
multi-repo server with only the addition of `--repo <id>` (or `CODE_REVIEW_REPO`).

---

## What Does Not Change

| Component | Status |
|---|---|
| Comment storage format (`<repo>/.local-code-review/<head>.json`) | Unchanged |
| Comment schema (id, side, line, body, diffFingerprint) | Unchanged |
| `ReviewService` internals (git commands, diff parsing, comment CRUD) | Unchanged |
| `.local-code-review/` exclusion from reviewable change list | Unchanged |
| Git integration (diff generation, untracked file detection, rename detection) | Unchanged |
| Diff context query param (`?context=0\|3\|20\|100\|full`) | Unchanged |
| Export format (deterministic Markdown) | Unchanged |
| Single-user, local-only scope | Unchanged |
| No new runtime dependencies | Unchanged |

---

## Alternatives Not Chosen

### Multi-port (separate server per repo)
Valid personal workflow. Not chosen as the server design because `repoId = port number` is unstable across
restarts, requires external alias management, and provides no path to cross-repo operations. Users who
prefer running separate server processes per repo can do so; the CLI's `--url` flag addresses any server
instance regardless.

### Query param (`?repo=repoId`)
Evaluated and rejected. Preserves flat routes, but requires `?repo=` on POST/PATCH/DELETE mutations —
where it is a correctness requirement (commentId namespace isolation), not just routing metadata — yet
cannot be enforced from the URL structure. Path prefix makes the scoping explicit and visible.


---

## Implementation Order

1. `server.ts` — change `startServer` signature, add `Map<repoId, ReviewService>`, mount prefixed router, add `GET /api/repos`, `POST /api/repos`, `DELETE /api/repos/:repoId`
2. `cli/serve` entrypoint — extend argument parsing for zero-or-more `--repo` flags and `name:path` syntax
3. CLI `add-repo` and `remove-repo` commands — thin wrappers over `POST`/`DELETE /api/repos`
4. Frontend API client — introduce `apiClient(repoId)` factory and `useRepos()` hook
5. Frontend `RepoSelector` component — hidden when one repo, visible tab strip/select when multiple
6. CLI data commands — add `--repo` flag and `resolveRepoId()` helper to all commands

Session coordination, CLI skill, and distribution work follow in the order documented in
[`progress.md`](../agentic-cr-skill-cli/progress.md).
