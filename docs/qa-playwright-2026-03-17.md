# Playwright QA Report

Date: 2026-03-17

URL under test: `http://localhost:5173/`

Runner: Playwright MCP against the live dev app

Observed app context:
- Page title: `code_review`
- Reviewed repository shown by the UI: `jirav.dev`
- Base ref shown by the UI: `HEAD`
- Initial loaded selection: `ARCubesProvider.java`
- Initial sidebar count observed: 21 changed files
- Existing comment inventory observed in the UI: 3 comments across 2 files

## Scenarios Tested

1. Initial load and API bootstrap
   - Verified the app loads successfully at `http://localhost:5173/`.
   - Verified initial API calls to `/api/repo`, `/api/changes`, `/api/changes/:changeId`, and `/api/comments` returned `200`.
   - Verified the first diff rendered after the loading state cleared.
   - Result: Passed.

2. File tree rendering and file selection
   - Verified the changed-file tree renders nested folders and file entries.
   - Switched selection from `ARCubesProvider.java` to `AssetsCoreBalanceForecastCubeProvider.java`.
   - Verified the file header updated to the newly selected file.
   - Result: Passed.

3. View mode switching
   - Switched from unified view to side-by-side view and back.
   - Verified side-by-side rows rendered as paired 6-cell rows.
   - Verified the `hide_removed` control is hidden in side-by-side mode and restored in unified mode.
   - Result: Passed.

4. Diff context switching
   - Switched the diff context from `full` to `none` and back to `full`.
   - On `ARCubesProvider.java`, verified the rendered row count changed from 95 rows to 2 rows and then back to 95 rows.
   - Verified existing inline comments still rendered in the reduced-context view.
   - Result: Passed.

5. Hide removed code toggle
   - In unified mode, toggled `hide_removed` on and off.
   - Verified removed rows were hidden when enabled and restored when disabled.
   - Result: Passed.

6. Sidebar collapse, expand, and keyboard resize
   - Collapsed and re-expanded the changed-files panel using the sidebar toggle.
   - Verified the control label and `aria-expanded` state changed appropriately.
   - Focused the separator and resized the panel with keyboard input.
   - Verified `aria-valuenow` changed from `240` to `272`.
   - Result: Passed.

7. Theme switching
   - Toggled from dark theme to light theme and back.
   - Verified the `.app-shell` `data-theme` attribute changed from `dark` to `light` and back to `dark`.
   - Result: Passed.

8. Comment creation and cleanup on an uncommented file
   - On `AssetsCoreBalanceForecastCubeProvider.java`, created a unique temporary comment on the first clickable diff row.
   - Verified the new inline comment rendered.
   - Deleted the same temporary comment immediately.
   - Verified the file returned to its baseline state with zero inline comment cards.
   - Result: Passed.

9. Export mode rendering
   - Entered export mode from the toolbar.
   - Verified the export header rendered as `review_comments.txt`.
   - Verified the export summary showed `3 comments` across `2 files`.
   - Verified the export body listed both commented files and their comment text.
   - Result: Passed.

10. Export copy action
   - Clicked the `copy` action in export mode.
   - Verified the button text changed to `copied!`.
   - Result: Passed.

11. Refresh behavior
   - Triggered the `Refresh` action while `AssetsCoreBalanceForecastCubeProvider.java` was selected.
   - Verified the same file remained selected after reload.
   - Result: Passed.

12. Narrow viewport responsive smoke test
   - Resized the viewport to `390x844`.
   - Verified the main toolbar and file header still rendered.
   - Verified `document.documentElement.scrollWidth` did not exceed `clientWidth`, indicating no horizontal overflow at that viewport.
   - Result: Passed.

13. Console and network smoke test
   - Re-checked console output after the interaction pass.
   - Verified no API failures were observed during the tested flows.
   - Result: Passed with one issue noted below.

## Issue Found

1. Missing favicon
   - The browser console logs a `404` for `http://localhost:5173/favicon.ico`.
   - Impact: minor, but it produces a persistent console error during dev QA.

## Notes

- Export mode required waiting for the async comment aggregation to finish before asserting the rendered file sections.
- The `.txt` download action was not filesystem-verified by Playwright MCP during this pass; the export UI and copy action were verified instead.
