# QA Agent Instructions — Playwright MCP Test Run

You are a QA agent. Your job is to execute all scenarios in this file against the live dev app using the **Playwright MCP** tools, then record results in a dedicated results file.

Work through every scenario in order. Do not skip any.

### Recording Results

Create a results file at `docs/qa-results.md` with the following structure:

```markdown
# QA Test Results

- **Date:** YYYY-MM-DD
- **Commit:** <short hash from `git rev-parse --short HEAD`>

## Observed App Context

- Page title: _(record)_
- Repository shown by the UI: _(record)_
- Base ref shown by the UI: _(record)_
- Initial loaded file selection: _(record)_
- Initial sidebar changed-file count: _(record)_
- Existing inline comment count: _(record)_

## Results

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Initial load and API bootstrap | Passed / Failed | _(optional details)_ |
| … | … | … | … |
```

Update each row immediately after finishing that scenario. On failure, include a brief reason in the Notes column.

---

## Traceability Matrix

Every requirement from `docs/requirements.md` must map to at least one scenario. Requirements not coverable by Playwright (CLI, NFR) are marked accordingly.

| Requirement | Description | Scenario(s) | Notes |
|---|---|---|---|
| FR-01 | Run locally | All | Implicit — all tests execute against localhost |
| FR-02 | Review working dir vs HEAD | 1 | API bootstrap loads changes from HEAD |
| FR-03 | Include untracked files | 14 | Verifies untracked file appears as fully added |
| FR-04 | Detect renamed files | 15 | Verifies old and new paths displayed |
| FR-05 | Handle binary files | 16 | Verifies binary listed, no line-level comment affordance |
| FR-06 | Side-by-side view | 3 | View mode switching |
| FR-07 | Unified view | 3 | View mode switching |
| FR-08 | Context line control | 4 | Diff context switching |
| FR-09 | Hide removed lines | 5 | Hide removed code toggle |
| FR-10 | Syntax highlighting | 17 | Verifies highlight tokens/classes present |
| FR-11 | Add comment | 8 | Comment creation |
| FR-12 | Edit comment | 18 | Comment editing |
| FR-13 | Delete comment | 8 | Comment creation and cleanup |
| FR-14 | Outdated comment detection | 19 | Content change marks comment outdated |
| FR-15 | Store comments locally, scoped to commit | 8, 19 | Indirect — comments persist and are commit-scoped |
| FR-16 | Carry forward comments on HEAD change | 20 | New commit triggers comment migration |
| FR-17 | Export with structured fields | 9 | Export mode rendering |
| FR-18 | Plain text for AI | 9 | Export mode rendering |
| FR-19 | Preview, copy, download | 9, 10 | Download not filesystem-verifiable |
| FR-20 | Hierarchical file tree | 2 | File tree rendering |
| FR-21 | Comment count badge per file | 21 | Badge assertion in single-repo mode |
| FR-22 | Collapse/resize file panel | 6 | Sidebar collapse, expand, resize |
| FR-23 | Manual refresh | 11, 36 | Refresh in single and multi-repo |
| FR-24 | Multiple repos per server | 23 | Initial load with three repos |
| FR-25 | Isolated API per repo | 28 | API routing scoped to active repo |
| FR-26 | List all repos | 23 | GET /api/repos returns all entries |
| FR-27 | Register at startup | 23 | Server started with three repos |
| FR-28 | Register at runtime | 31 | Add-repo modal — successful registration |
| FR-29 | Unregister at runtime | 31 | Cleanup step uses DELETE |
| FR-30 | URL-safe ID from dir name | 31 | Derived ID verified |
| FR-31 | Custom identifier | 33 | Duplicate ID uses custom ID field |
| FR-32 | Reject duplicate IDs | 33 | Add-repo modal — 409 error |
| FR-33 | Preserve single-repo behavior | 1–22 | All single-repo scenarios |
| FR-34 | Hide repo selector (1 repo) | 22 | Asserts selector absent |
| FR-35 | Show repo selector (2+ repos) | 23 | Selector strip rendered |
| FR-36 | Empty state (0 repos) | 39 | Zero-repo empty state |
| FR-37 | Persist selected repo | 29 | localStorage persistence |
| FR-38 | CLI repo targeting | 40 | CLI — not Playwright (shell) |
| FR-39 | CLI auto-select sole repo | 41 | CLI — not Playwright (shell) |
| FR-40 | CLI list/register/unregister | 42, 44 | CLI — not Playwright (shell); 44 is automated |
| FR-41 | CLI server URL | 43, 44 | CLI — not Playwright (shell); 44 covers connection-failure path |
| FR-42 | CLI stop-server command | 44 | CLI — not Playwright (shell); Section 5b of verify-cli.sh |
| FR-44 | UI preferences persistence | 45 | Reload assertions for theme, viewMode, sidebar, diffContext |
| NFR-01 | Localhost only | All | Implicit — no external network calls |
| NFR-02 | No authentication | All | Implicit — no auth in any scenario |
| NFR-03 | Dark/light themes | 7 | Theme switching |

---

## Tools Available

Use the Playwright MCP tools for all browser interactions:

| Tool | When to use |
|---|---|
| `browser_navigate` | Open a URL |
| `browser_snapshot` | Inspect the current DOM/accessibility tree |
| `browser_take_screenshot` | Visual check of rendered UI |
| `browser_click` | Click a button, link, or element |
| `browser_type` | Type text into an input |
| `browser_fill_form` | Fill multiple form fields at once |
| `browser_press_key` | Send keyboard events (e.g. Escape, Tab, Arrow keys) |
| `browser_evaluate` | Run JavaScript in the page context |
| `browser_network_requests` | Inspect outbound HTTP requests and their status codes |
| `browser_console_messages` | Read browser console output |
| `browser_wait_for` | Wait for an element or condition before asserting |
| `browser_resize` | Change the viewport dimensions |
| `browser_select_option` | Select a `<select>` option |

Use `browser_evaluate` freely to read DOM attributes, `localStorage`, scroll dimensions, or any state that is not visible in the accessibility snapshot.

---

## Environment Setup

### Step 1 — Prepare the test repo (single-repo, Scenarios 1–22)

```bash
bash scripts/qa/setup-single-repo.sh
```

Creates `/tmp/qa-repos/test-repo` as a worktree and seeds all files needed by Scenarios 14–17. Safe to re-run — skips steps already done.

### Step 2 — Start the server (single-repo, Scenarios 1–22)

```bash
bash scripts/qa/start-server.sh single
bash scripts/qa/wait-for-server.sh
```

- Frontend: `http://localhost:5173/`
- API: `http://localhost:3000/`

### Step 3 — Create git worktrees for multi-repo scenarios (23–38)

```bash
bash scripts/qa/stop-server.sh
bash scripts/qa/setup-multi-repo.sh
```

Creates `frontend`, `backend`, and `shared-libs` worktrees under `/tmp/qa-repos/`. Safe to re-run — skips worktrees that already exist.

### Step 4 — Restart the server with all three repos

```bash
bash scripts/qa/start-server.sh multi
bash scripts/qa/wait-for-server.sh
```

The server registers repos as `frontend`, `backend`, and `shared-libs`. Before running Scenario 23, navigate to `http://localhost:5173/` and confirm the selector strip is in overflow mode: two pill tabs visible plus a `+1 ▾` overflow pill.

### Step 5 — Zero-repo server (Scenario 39)

```bash
bash scripts/qa/stop-server.sh
bash scripts/qa/start-server.sh zero
bash scripts/qa/wait-for-server.sh
```

### Step 6 — Cleanup after all scenarios are complete

```bash
bash scripts/qa/cleanup.sh
```

Stops the server, removes all worktrees and QA branches, deletes `/tmp/qa-repos`, and removes log files.

---

## Scenarios 1–13: Single-Repo Baseline

### 1. Initial load and API bootstrap

- Navigate to `http://localhost:5173/`.
- Use `browser_network_requests` to verify the initial API calls to `/api/repo`, `/api/changes`, `/api/changes/:changeId`, and `/api/comments` all returned `200`.
- Use `browser_snapshot` or `browser_wait_for` to confirm the first diff rendered after the loading state cleared.

### 2. File tree rendering and file selection

- Verify the changed-file tree renders nested folders and file entries.
- Click a second file in the sidebar (different from the initially selected one).
- Verify the file header in the diff panel updated to the newly selected file.

### 3. View mode switching

- Switch from unified view to side-by-side view using the toolbar control.
- Verify side-by-side rows are rendered as paired rows.
- Verify the `hide_removed` toggle is hidden in side-by-side mode.
- Switch back to unified view and verify `hide_removed` reappears.

### 4. Diff context switching

- Switch the diff context from `full` to `none`.
- Verify the rendered diff row count decreases significantly.
- Verify any existing inline comments still render in the reduced-context view.
- Switch back to `full` and verify the full row count is restored.

### 5. Hide removed code toggle

- In unified mode, enable the `hide_removed` toggle.
- Verify removed-code rows disappear from the diff.
- Disable the toggle and verify removed rows return.

### 6. Sidebar collapse, expand, and keyboard resize

- Click the sidebar toggle to collapse the changed-files panel.
- Verify the `aria-expanded` attribute changes to `false`.
- Click again to expand and verify it changes back to `true`.
- Focus the resize separator and press an arrow key.
- Use `browser_evaluate` to read `aria-valuenow` and confirm it changed.

### 7. Theme switching

- Toggle from dark theme to light theme using the toolbar control.
- Use `browser_evaluate` to verify `document.querySelector('.app-shell').dataset.theme === 'light'`.
- Toggle back to dark and verify `dataset.theme === 'dark'`.

### 8. Comment creation and cleanup on an uncommented file

- Select a file in the sidebar that has no existing inline comments.
- Click the first clickable diff row to open the comment input.
- Type a unique temporary comment string (e.g. `qa-temp-<timestamp>`).
- Submit the comment and verify it renders as an inline comment card.
- Delete the comment using its delete control.
- Verify the file now shows zero inline comment cards.

### 9. Export mode rendering

- Enter export mode from the toolbar.
- Verify the export header displays `review_comments.txt`.
- Verify the export summary shows the correct total comment count and file count.
- Verify the export body lists each commented file and its comment text.

### 10. Export copy action

- In export mode, click the `copy` button.
- Verify the button label changes to `copied!`.

### 11. Refresh behavior

- Note the currently selected file name.
- Trigger the `Refresh` action from the toolbar.
- Verify the same file remains selected after the reload completes.

### 12. Narrow viewport responsive smoke test

- Use `browser_resize` to set the viewport to `390x844`.
- Verify the main toolbar and file header still render without being clipped.
- Use `browser_evaluate` to verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (no horizontal overflow).
- Restore the viewport to its original size.

### 13. Console and network smoke test

- Use `browser_console_messages` to inspect console output after completing Scenarios 1–12.
- Use `browser_network_requests` to confirm no `4xx` or `5xx` responses occurred during the tested flows.

---

## Scenarios 14–22: Single-Repo — Gap Coverage

These scenarios require the seed files created in Setup Step 1.

### 14. Untracked file inclusion (FR-03)

- In the file tree, locate `qa-untracked.txt`.
- Verify it appears in the changed-file list.
- Click the file to view its diff.
- Verify every line is shown as an addition (all lines green / prefixed with `+`).
- Use `browser_evaluate` or `browser_snapshot` to confirm there is no "old side" content (the file is treated as fully added).

### 15. Renamed file detection (FR-04)

- In the file tree, locate the renamed file entry (e.g. `README.md → README-renamed.md`).
- Verify both the old path and the new path are displayed in the file header or tree entry.
- Click the file to view its diff.
- Verify the diff renders correctly (content should be largely unchanged, shown as a rename rather than a delete + add).

### 16. Binary file handling (FR-05)

- In the file tree, locate `qa-binary.bin`.
- Click the file to view its diff.
- Verify the diff panel shows a "binary file" indicator rather than line-level content.
- Verify there is no clickable row or comment affordance on the binary file — the user should not be able to add a line-level comment.

### 17. Syntax highlighting verification (FR-10)

- Select a file with a known extension (e.g. a `.ts` or `.js` file) from the file tree.
- Use `browser_evaluate` to query for syntax-highlighting token elements within the diff rows (e.g. `document.querySelectorAll('.diff-row .token, .diff-row [class*="hljs-"], .diff-row [class*="syntax-"]')`).
- Verify at least one token element with a highlighting class exists (confirming that syntax highlighting is applied, not plain text).

### 18. Comment editing (FR-12)

- Select a file with no existing inline comments.
- Create a temporary comment with a unique string (e.g. `qa-edit-original`).
- Verify the comment renders as an inline comment card.
- Click the edit control on the comment card.
- Verify the comment text becomes editable (an input or textarea appears pre-filled with the original text).
- Change the text to `qa-edit-updated` and submit the edit.
- Verify the inline comment card now displays `qa-edit-updated`.
- Delete the comment to clean up.

### 19. Outdated comment detection (FR-14)

> **Prerequisite:** This scenario requires the ability to modify the working tree while the app is running.

- Select `qa-untracked.txt` and create a comment on a diff row. Note the line content.
- In a terminal, run `bash scripts/qa/scenario19-modify.sh` to overwrite the file content.
- Trigger the `Refresh` action from the toolbar.
- Verify the comment is now marked as outdated (e.g. a visual indicator, badge, or label such as "outdated").
- Delete the comment to clean up.
- In a terminal, run `bash scripts/qa/scenario19-revert.sh` to restore the original file content.

### 20. Comment carry-forward on HEAD change (FR-16)

> **Prerequisite:** This scenario requires creating a new commit while the app is running.

- Select a file and create a comment on a specific diff row. Note the comment text and file.
- In a terminal, run `bash scripts/qa/scenario20-commit.sh` to stage and commit all working-dir changes.
- Trigger the `Refresh` action from the toolbar.
- Verify the comment is still present on the file (carried forward from the prior commit to the new HEAD).
- Verify the comment may be marked as outdated if the underlying content changed with the commit.
- Delete the comment, then in a terminal run `bash scripts/qa/scenario20-revert.sh` to undo the commit and re-stage the rename.

### 21. Comment count badge per file (FR-21)

- Select a file that has no existing inline comments.
- Verify the file's entry in the sidebar does **not** show a comment count badge.
- Create a temporary comment on the file.
- Verify a comment count badge (e.g. `1`) now appears on the file's sidebar entry.
- Create a second comment on a different line.
- Verify the badge updates to `2`.
- Delete both comments.
- Verify the badge disappears.

### 22. Repo selector hidden in single-repo mode (FR-34)

- Use `browser_snapshot` or `browser_evaluate` to inspect the sidebar header area.
- Verify that no repository selector strip, tab bar, or repo-switching UI is rendered.
- Verify the app shows the diff and file tree directly without requiring repo selection.

---

## Scenarios 23–38: Multi-Repo

> **Prerequisite:** Complete Setup Steps 3–4 above. The server must be running with `frontend`, `backend`, and `shared-libs` registered. The UI selector must be in overflow mode (two pinned tabs + `+1 ▾`).
>
> All API calls under these scenarios use the `/api/repos/:repoId/` prefix. Flat routes (`/api/repo`, `/api/changes`, etc.) do not exist in multi-repo mode.

### 23. Initial load with three repositories

- Navigate to `http://localhost:5173/`.
- Use `browser_network_requests` to verify `GET /api/repos` returned an array with 3 entries (`frontend`, `backend`, `shared-libs`).
- Use `browser_snapshot` to verify the repo selector strip is rendered in the sidebar header.
- Verify exactly two pill tabs are visible plus an overflow pill labelled `+1 ▾`.
- Use `browser_evaluate` or `browser_snapshot` to verify the active-repo info row shows the active repo name and branch.
- Verify the initial API calls used scoped routes: `GET /api/repos/frontend/repo`, `GET /api/repos/frontend/changes`, `GET /api/repos/frontend/comments`.

### 24. Overflow pill opens dropdown

- Click the `+1 ▾` overflow pill.
- Verify a floating dropdown appears listing the hidden repo (`shared-libs`).
- Click outside the dropdown boundary.
- Verify the dropdown closes and the active repo is unchanged.

### 25. Switching repos via overflow dropdown

- Open the overflow dropdown and select `shared-libs`.
- Verify `shared-libs` becomes a visible pinned tab and is marked active.
- Verify the previously inactive pinned tab (`backend`) is pushed into the overflow pill.
- Verify the active-repo info row updates to reflect `shared-libs`.
- Use `browser_network_requests` to verify `GET /api/repos/shared-libs/changes` was called and the file list reloaded.
- Verify the diff panel is cleared (no previously selected file header remains).

### 26. Switching repos via pinned tab

- With two repos visible as pinned tabs, click the inactive one.
- Verify the clicked repo becomes active (tab highlight switches, info row updates).
- Verify the file list reloads via the newly active repo's `/changes` endpoint.
- Verify the diff panel clears.

### 27. File list and comment isolation per repo

- Record the changed-file count shown for the current active repo.
- Switch to a different repo.
- Verify the changed-file count reflects the new repo's diff (may be different or zero).
- Verify comment count badges on files reflect the new repo's stored comments, not the previous repo's.

### 28. API routing — all calls scoped to active repo

- With `frontend` active, use `browser_network_requests` to verify every resource request goes to `/api/repos/frontend/...`.
- Confirm no requests were made to flat routes (`/api/changes`, `/api/repo`, etc.).
- Switch to `backend` and verify all subsequent requests go to `/api/repos/backend/...`.

### 29. localStorage persistence of selected repo

- Make `backend` the active repo.
- Reload the page with `browser_navigate` to the same URL.
- Verify `backend` is restored as the active tab without user interaction.
- Verify the file list loads `backend`'s changes on the restored session.

### 30. localStorage fallback when stored repo no longer exists

- Use `browser_evaluate` to run `localStorage.setItem('crloop.repo.' + location.origin, 'nonexistent-repo')`.
- Reload the page.
- Verify the app falls back to the first repo returned by `GET /api/repos` (e.g. `frontend`) without showing an error state.

### 31. Add-repo modal — successful registration

- Click the `+` button at the far right of the tab strip.
- Verify the add-repo modal opens with a "Repository path" required field and an "ID (optional)" field.
- Submit a valid local git repository path (leave ID blank). Use `/tmp/qa-repos/frontend` or any real git path you have handy.
- Verify the modal closes and `GET /api/repos` is re-fetched.
- Verify the new repo appears in the selector with an ID derived from the path basename.
- Cleanup: use `browser_evaluate` or a direct API call (`DELETE /api/repos/:newId`) to remove the newly added repo and restore the 3-repo baseline.

### 32. Add-repo modal — 400 error (invalid path)

- Open the add-repo modal and submit a path that is not a git repository (e.g. `/tmp`).
- Verify the modal stays open.
- Verify an inline error message (e.g. "Not a git repository") appears below the path field.
- Verify no new repo appears in the selector.

### 33. Add-repo modal — 409 error (duplicate ID)

- Open the add-repo modal, enter a valid git path, and set the ID field to an already-registered value (e.g. `frontend`).
- Verify the modal stays open.
- Verify an inline error message (e.g. "ID already in use") appears below the ID field.

### 34. Add-repo modal — dismissal

- Open the add-repo modal and press `Escape` (use `browser_press_key`).
- Verify the modal closes without any API call being made.
- Open the modal again and click outside the modal boundary.
- Verify the modal closes without any API call.

### 35. Export mode scoped to active repo

- With `frontend` active and its comment inventory loaded, enter export mode.
- Verify the export summary reflects `frontend`'s comment count and listed files.
- Exit export mode, switch to `backend`, and enter export mode again.
- Verify the export summary reflects `backend`'s comment count (different from `frontend`'s).

### 36. Refresh behavior in multi-repo context

- Make `backend` the active repo and select a specific file.
- Trigger the `Refresh` action.
- Verify `backend` remains the active repo after the reload.
- Verify the previously selected file remains selected.
- Use `browser_network_requests` to verify `GET /api/repos/backend/changes` was called (not a flat route).

### 37. Comment creation isolated to active repo

- In a terminal, run `bash scripts/qa/scenario37-seed.sh` to create a changed file in the `shared-libs` worktree.
- Switch to `shared-libs`, trigger `Refresh`, and open the seeded file.
- Create a unique temporary comment on the first clickable diff row.
- Verify the inline comment renders in `shared-libs`.
- Switch to `frontend` and verify its comment count is unchanged (comment did not leak across repos).
- Switch back to `shared-libs` and verify the temporary comment is still present.
- Delete the comment and verify `shared-libs` returns to its baseline comment count.

### 38. Console and network smoke test (multi-repo)

- Use `browser_console_messages` to inspect console output after completing Scenarios 23–37.
- Use `browser_network_requests` to verify no `4xx` or `5xx` errors appeared for any `/api/repos/...` request.
- Verify no requests were made to the removed flat routes (`/api/repo`, `/api/changes`, `/api/comments`).

---

## Scenario 39: Zero-Repo Empty State

> **Prerequisite:** Complete Setup Step 5 above. The server must be running with no `--repo` arguments.

### 39. Empty state with zero repositories (FR-36)

- Navigate to `http://localhost:5173/`.
- Verify the page does **not** show a file tree or diff panel.
- Verify an empty-state message is displayed with instructions on how to register a repository (e.g. text mentioning `--repo` or the add-repo action).
- Verify no `4xx` or `5xx` errors appear in `browser_network_requests` (the app should gracefully handle zero repos).
- Use `browser_snapshot` to confirm no repo selector tabs are rendered.

---

## Scenario 45: UI Preferences Persistence

> **Prerequisite:** Single-repo setup (Scenarios 1–22). The server must be running.

### 45. UI preferences survive page reload (FR-44)

This scenario verifies that all six persisted settings are restored after a hard reload. Run it after completing the single-repo baseline scenarios so that a file is already selected.

**Theme:**
- Toggle from dark to light using the toolbar theme control.
- Use `browser_evaluate` to confirm `document.querySelector('.app-shell').dataset.theme === 'light'`.
- Reload the page with `browser_navigate` to the same URL.
- Use `browser_evaluate` to confirm `document.querySelector('.app-shell').dataset.theme === 'light'` (persisted).
- Toggle back to dark and reload to confirm dark is also persisted.

**View mode:**
- Switch to side-by-side view using the toolbar.
- Reload the page.
- Use `browser_snapshot` to confirm the side-by-side layout is active (e.g. the side-by-side toolbar button appears selected or aria-pressed=true).

**Sidebar collapsed state:**
- Click the sidebar toggle to collapse the file panel.
- Reload the page.
- Use `browser_evaluate` to verify the sidebar remains collapsed (`aria-expanded === 'false'`).
- Expand the sidebar, reload, and verify it stays expanded.

**Sidebar width:**
- Focus the resize separator and press the right arrow key several times to increase the width.
- Use `browser_evaluate` to read `aria-valuenow` and note the new width value.
- Reload the page.
- Use `browser_evaluate` to confirm `aria-valuenow` matches the saved width.

**Diff context:**
- Change the diff context dropdown from `full` to `3 lines`.
- Reload the page.
- Use `browser_snapshot` or `browser_evaluate` to confirm the dropdown still shows `3 lines` after reload.

**Hide removed code:**
- In unified view, enable the hide-removed toggle.
- Reload the page.
- Verify removed-code rows are still hidden after reload (confirm toggle is active).
- Disable the toggle, reload, and verify removed rows return.

---

## Scenarios 40–44: CLI

> **Scope:** These scenarios test the CLI tool and cannot be executed via Playwright MCP. Run them manually in a terminal or via a shell-based test runner.
>
> **Prerequisite:** The server must be running with `frontend`, `backend`, and `shared-libs` registered (same as multi-repo setup).

### 40. CLI repo targeting (FR-38)

- Run a CLI command that targets a specific repo (e.g. `npx code-review --repo backend list-comments`).
- Verify the command operates against the `backend` repo and not any other.
- Repeat with `--repo frontend` and verify the output changes to reflect `frontend`'s state.

### 41. CLI auto-select sole repo (FR-39)

- Stop the server and restart with a single repo: `npm run dev -- --repo /tmp/qa-repos/frontend`.
- Run a CLI command **without** the `--repo` flag.
- Verify the CLI automatically targets the sole registered repo without requiring explicit selection.
- Verify no error or prompt asking the user to specify a repo.

### 42. CLI list, register, and unregister repos (FR-40)

- Run the CLI command to list repos (e.g. `npx code-review repos list`).
- Verify the output lists all registered repos with their IDs and paths.
- Run the CLI command to register a new repo at runtime (e.g. `npx code-review repos add /tmp/qa-repos/frontend`).
- Verify the new repo appears in a subsequent `repos list` output.
- Run the CLI command to unregister the newly added repo (e.g. `npx code-review repos remove <id>`).
- Verify the repo is removed from the list.
- Verify that stored comments for the removed repo are **not** deleted (re-register and verify comments are still present, then remove again to clean up).

### 43. CLI server URL (FR-41)

- Run a CLI command with an explicit server URL (e.g. `npx code-review --server http://localhost:3000 repos list`).
- Verify the command connects to the specified server and returns results.
- Run the same command with an invalid URL (e.g. `--server http://localhost:9999`).
- Verify the CLI outputs a clear connection error, not an unhandled exception.

### 44. CLI command and flag verification (automated)

> **Scope:** Verifies every `crloop` command, flag, and error path. Fully automated — the script manages its own server lifecycle on port 3009 and requires no manual setup.

Run the verification script:

```bash
bash scripts/qa/verify-cli.sh
```

The script covers the following assertions in seven sections:

**Section 1 — `--version` / `--help` flags (no server)**
- `crloop --version` exits 0 and prints the version string matching `package.json`.
- `crloop --help` and `crloop -h` exit 0 and print usage including `serve`, `stop-server`, `repos`, `add-repo`, and `remove-repo`.

**Section 2 — `serve` startup errors**
- `--port abc` and `--port 0` exit 1 with `Invalid --port` message.
- Duplicate `--repo` ids exit 1 with `Duplicate repo id` message.

**Section 3 — unknown command**
- `crloop bogus-command` exits 1 with `Unknown command` message and a `--help` hint.

**Section 4 — live server: `repos`, `add-repo`, `remove-repo`**
- `repos --url` exits 0 and lists the startup repo.
- `add-repo <path>` (auto-derived id) exits 0 and the new repo appears in `repos`.
- `add-repo <path> --id <custom>` exits 0 and the custom id appears in `repos`.
- `remove-repo <id>` exits 0 and the id disappears from `repos`.
- Column alignment in `repos` output is verified.

**Section 5 — error paths against live server**
- `add-repo` with a duplicate id exits 1 with `already in use`.
- `add-repo` with a non-git path exits 1 with `Not a git repository`.
- `add-repo` with missing path argument exits 1 and prints usage.
- `remove-repo` with non-existent id exits 1 with `not found`.

**Section 5b — `stop-server`**
- `stop-server --url` exits 0 and prints `Server stopped.`.
- After the server stops, `repos` exits 1 with `Connection failed`.

**Section 6 — `serve` with `name:path` syntax**
- `--repo fe:<path> --repo be:<path>` starts and registers repos with ids `fe` and `be`.

**Section 7 — connection failure**
- `repos`, `add-repo`, `remove-repo`, and `stop-server` all exit 1 with `Connection failed` when no server is running.

Expected output ends with:

```
=========================================
  CLI verification: 45 passed, 0 failed
=========================================
```

Any failure prints the failing assertion and the captured output.

---

## Post-Run Cleanup

After all scenarios pass:

```bash
bash scripts/qa/cleanup.sh
```

## Notes for the Agent

- For assertions on DOM attributes or `localStorage`, prefer `browser_evaluate` over trying to infer state from snapshots alone.
- The `.txt` download action cannot be filesystem-verified via Playwright MCP; verify the export UI and copy action instead.
- In export mode, wait for async comment aggregation to finish before asserting rendered file sections — use `browser_wait_for` if needed.
- Scenarios 19 and 20 require terminal access alongside the browser session — coordinate file modifications and commits carefully.
- Scenarios 40–43 are CLI-only and should be executed in a separate terminal session, not through Playwright.
