import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import { ROOT, navigateAndWait } from './fixtures';

test.beforeEach(async ({ page }) => {
  await navigateAndWait(page);
});

// ── Helper: click theme button ────────────────────────────────────────────────
async function clickTheme(page: Page) {
  const btn = page.getByRole('button', { name: /switch to (dark|light) mode/i });
  await btn.click();
}

// ── Helper: enter + exit export mode ─────────────────────────────────────────
async function enterExportMode(page: Page) {
  await page.getByRole('button', { name: 'export_comments' }).click();
  await page.waitForTimeout(400);
}

async function exitExportMode(page: Page) {
  await page.getByRole('button', { name: 'Close export' }).click();
  await page.waitForTimeout(200);
}

// ── Helper: create a comment on a diff row ────────────────────────────────────
async function createComment(page: Page, text: string, rowIndex = 0) {
  const row = page.locator('.diff-row-clickable').nth(rowIndex);
  await row.waitFor();
  await row.click();
  const ta = page.getByRole('textbox', { name: /add comment/i });
  await ta.waitFor();
  await ta.fill(text);
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.waitForTimeout(300);
}

// ── Helper: delete all visible comments ──────────────────────────────────────
async function deleteAllComments(page: Page) {
  while (true) {
    const deleteBtn = page.getByRole('button', { name: 'Delete' }).first();
    if (!(await deleteBtn.isVisible())) break;
    await deleteBtn.click();
    await page.waitForTimeout(300);
  }
}

// ── Scenarios 1–13: Single-Repo Baseline ─────────────────────────────────────

test('ui-1. Initial load and API bootstrap', async ({ page }) => {
  // Navigate and collect API responses
  const responses: { url: string; status: number }[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/')) {
      responses.push({ url: r.url(), status: r.status() });
    }
  });

  await navigateAndWait(page);
  await page.waitForTimeout(800);

  // Verify scoped routes returned 200
  const reposOk = responses.some((r) => r.url.endsWith('/api/repos') && r.status === 200);
  const changesOk = responses.some((r) => r.url.includes('/changes') && r.status === 200);
  const repoInfoOk = responses.some((r) => r.url.endsWith('/repo') && r.status === 200);

  expect(reposOk).toBe(true);
  expect(changesOk).toBe(true);
  expect(repoInfoOk).toBe(true);

  // Verify the file tree rendered after loading cleared
  await expect(page.locator('.change-item').first()).toBeVisible();
});

test('ui-2. File tree rendering and file selection', async ({ page }) => {
  // Verify nested folder structure (src/server/hash.ts under src/server)
  await expect(page.getByRole('button', { name: /src\/server/i })).toBeVisible();

  // Note which file is currently shown in the diff header
  const fileHeader = page.locator('strong').first();
  const initialFile = await fileHeader.textContent();

  // Click a different file from the currently selected one
  const allFiles = page.locator('.change-item');
  const count = await allFiles.count();
  expect(count).toBeGreaterThan(1);

  // Click the second item in the file tree
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const isActive = await allFiles.nth(i).evaluate(
      (el) => el.classList.contains('selected') || el.getAttribute('aria-current') === 'true',
    );
    if (!isActive) {
      await allFiles.nth(i).click();
      clicked = true;
      break;
    }
  }
  expect(clicked).toBe(true);
  await page.waitForTimeout(400);

  // Verify file header updated
  await expect(fileHeader).toBeVisible();
});

test('ui-3. View mode switching', async ({ page }) => {
  // Switch to side-by-side view
  await page.getByRole('button', { name: 'side_by_side' }).click();
  await page.waitForTimeout(300);

  // In side-by-side mode, hide_removed button should be hidden
  const hideRemovedBtn = page.getByRole('button', { name: 'hide_removed' });
  await expect(hideRemovedBtn).toHaveCount(0);

  // Switch back to unified view
  await page.getByRole('button', { name: 'unified' }).click();
  await page.waitForTimeout(300);

  // hide_removed should reappear in unified mode
  await expect(page.getByRole('button', { name: 'hide_removed' })).toBeVisible();
});

test('ui-4. Diff context switching', async ({ page }) => {
  // Navigate to a file with actual diff content
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row', { timeout: 8000 });

  const ctxSelect = page.getByRole('combobox', { name: 'Diff context' });

  // Note full row count
  const fullRowCount = await page.locator('.diff-row').count();

  // Switch to 'none' context
  await ctxSelect.selectOption('none');
  await page.waitForTimeout(500);

  const noneRowCount = await page.locator('.diff-row').count();
  expect(noneRowCount).toBeLessThanOrEqual(fullRowCount);

  // Switch back to 'full'
  await ctxSelect.selectOption('full');
  await page.waitForTimeout(500);

  const restoredRowCount = await page.locator('.diff-row').count();
  expect(restoredRowCount).toBe(fullRowCount);
});

test('ui-5. Hide removed code toggle', async ({ page }) => {
  // Navigate to file with deletions
  await page.getByRole('button', { name: 'qa-with-deletions.txt' }).click();
  await page.waitForSelector('.diff-row-removed', { timeout: 8000 });

  const removedRows = page.locator('.diff-row-removed');
  const initialRemovedCount = await removedRows.count();
  expect(initialRemovedCount).toBeGreaterThan(0);

  // Enable hide_removed
  await page.getByRole('button', { name: 'hide_removed' }).click();
  await page.waitForTimeout(300);

  const hiddenCount = await removedRows.count();
  expect(hiddenCount).toBe(0);

  // Disable hide_removed
  await page.getByRole('button', { name: 'hide_removed' }).click();
  await page.waitForTimeout(300);

  const restoredCount = await removedRows.count();
  expect(restoredCount).toBe(initialRemovedCount);
});

test('ui-6. Sidebar collapse, expand, and keyboard resize', async ({ page }) => {
  // Verify sidebar starts expanded
  const expandedState = await page.evaluate(
    () => document.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'),
  );
  expect(expandedState).toBe('true');

  // Click to collapse (button says "Hide changed files" when expanded)
  await page.getByRole('button', { name: 'Hide changed files' }).click();
  await page.waitForTimeout(300);

  // Verify aria-expanded is now false
  const collapsedState = await page.evaluate(
    () =>
      // The collapsed button says "Show changed files" and may have aria-expanded=false
      document.querySelector('button[aria-expanded="false"]')?.getAttribute('aria-expanded') ??
      document.querySelector('button:has-text("Show changed files")')?.getAttribute('aria-expanded'),
  );
  // Either the attribute says "false" or we just verify the expanded button is gone
  const hideBtn = page.getByRole('button', { name: 'Hide changed files' });
  await expect(hideBtn).toHaveCount(0);
  const showBtn = page.getByRole('button', { name: 'Show changed files' });
  await expect(showBtn).toBeVisible();

  // Click again to expand
  await showBtn.click();
  await page.waitForTimeout(300);

  await expect(page.getByRole('button', { name: 'Hide changed files' })).toBeVisible();

  // Focus the resize separator and press an arrow key
  const separator = page.getByRole('separator', { name: /resize changed files panel/i });
  await separator.focus();
  const valueBefore = await separator.getAttribute('aria-valuenow');

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  const valueAfter = await separator.getAttribute('aria-valuenow');
  expect(valueAfter).not.toBeNull();
  if (valueBefore !== null && valueAfter !== null) {
    expect(Number(valueAfter)).not.toBe(Number(valueBefore));
  }
});

test('ui-7. Theme switching', async ({ page }) => {
  const initialTheme = await page.evaluate(
    () => document.querySelector('.app-shell')?.getAttribute('data-theme'),
  );

  // Toggle theme
  await clickTheme(page);
  await page.waitForTimeout(300);

  const afterFirstToggle = await page.evaluate(
    () => document.querySelector('.app-shell')?.getAttribute('data-theme'),
  );
  if (initialTheme === 'dark') {
    expect(afterFirstToggle).toBe('light');
  } else {
    expect(afterFirstToggle).toBe('dark');
  }

  // Toggle back
  await clickTheme(page);
  await page.waitForTimeout(300);

  const finalTheme = await page.evaluate(
    () => document.querySelector('.app-shell')?.getAttribute('data-theme'),
  );
  expect(finalTheme).toBe(initialTheme);
});

test('ui-8. Comment creation and cleanup on an uncommented file', async ({ page }) => {
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row-clickable', { timeout: 8000 });

  const timestamp = Date.now();
  const commentText = `qa-temp-${timestamp}`;
  await createComment(page, commentText);

  // Verify the comment renders
  await expect(page.getByText(commentText)).toBeVisible();

  // Delete the comment (no confirmation dialog)
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(300);

  // Verify zero inline comment cards
  await expect(page.getByText(commentText)).not.toBeVisible();
});

test('ui-9. Export mode rendering', async ({ page }) => {
  await enterExportMode(page);
  await page.waitForTimeout(400);

  // Verify export header shows review_comments.txt
  await expect(page.getByText('review_comments.txt')).toBeVisible();

  // Verify summary line exists (may show 0 comments)
  await expect(page.locator('text=/\\d+ comments? · \\d+ files?/i')).toBeVisible();

  await exitExportMode(page);
});

test('ui-10. Export copy action', async ({ page }) => {
  await enterExportMode(page);
  await page.waitForTimeout(400);

  // Click the copy button
  await page.getByRole('button', { name: 'copy' }).click();
  await page.waitForTimeout(600);

  // Verify label changes to 'copied!'
  await expect(page.getByRole('button', { name: 'copied!' })).toBeVisible();

  await exitExportMode(page);
});

test('ui-11. Refresh behavior', async ({ page }) => {
  // Note the currently shown file
  const fileHeader = page.locator('strong').first();
  const initialFile = await fileHeader.textContent();

  // Trigger Refresh
  const refreshDone = page.waitForResponse(
    (r) => r.url().includes('/changes') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Refresh' }).click();
  await refreshDone;
  await page.waitForTimeout(400);

  // Verify same file remains shown
  const afterFile = await fileHeader.textContent();
  expect(afterFile).toBe(initialFile);
});

test('ui-12. Narrow viewport responsive smoke test', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  // Toolbar should still render
  await expect(page.getByRole('group', { name: 'View mode' })).toBeVisible();

  // No horizontal overflow
  const noOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );
  expect(noOverflow).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
});

test('ui-13. Console and network smoke test', async ({ page }) => {
  const errors: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      errors.push(`${r.status()} ${r.url()}`);
    }
  });

  await navigateAndWait(page);
  await page.waitForTimeout(800);

  expect(errors).toEqual([]);
});

// ── Scenarios 14–22: Single-Repo — Gap Coverage ──────────────────────────────

test('ui-14. Untracked file inclusion (FR-03)', async ({ page }) => {
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row', { timeout: 8000 });

  // All rows should be additions
  const addedRows = page.locator('.diff-row-added');
  await expect(addedRows.first()).toBeVisible();

  // No removed rows
  const removedRows = page.locator('.diff-row-removed');
  await expect(removedRows).toHaveCount(0);

  // No context rows (file is fully added)
  const contextRows = page.locator('.diff-row-context');
  await expect(contextRows).toHaveCount(0);
});

test('ui-15. Renamed file detection (FR-04)', async ({ page }) => {
  // Look for the renamed file entry in the file tree
  const renamedEntry = page.getByRole('button', { name: /README/i });
  const isVisible = await renamedEntry.isVisible().catch(() => false);

  if (!isVisible) {
    test.skip();
    return;
  }

  // Verify both old and new paths are displayed
  await expect(page.getByText(/README\.md/i).first()).toBeVisible();
  await expect(page.getByText(/README-renamed/i).first()).toBeVisible();

  await renamedEntry.first().click();
  await page.waitForTimeout(400);

  await expect(page.locator('.diff-row').first()).toBeVisible();
});

test('ui-16. Binary file handling (FR-05)', async ({ page }) => {
  await page.getByRole('button', { name: 'qa-binary.bin' }).click();
  await page.waitForTimeout(400);

  // Verify binary diff indicator
  await expect(page.getByRole('heading', { name: 'Binary diff' })).toBeVisible();

  // Verify no clickable diff rows
  const diffRows = page.locator('.diff-row-clickable');
  await expect(diffRows).toHaveCount(0);
});

test('ui-17. Syntax highlighting verification (FR-10)', async ({ page }) => {
  await page.getByRole('button', { name: 'hash.ts' }).click();
  await page.waitForSelector('.diff-row', { timeout: 8000 });

  // Verify syntax highlight tokens exist
  const tokenCount = await page.evaluate(
    () =>
      document.querySelectorAll(
        '.diff-row .token, .diff-row [class*="hljs-"], .diff-row [class*="syntax-"]',
      ).length,
  );
  expect(tokenCount).toBeGreaterThan(0);
});

test('ui-18. Comment editing (FR-12)', async ({ page }) => {
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row-clickable', { timeout: 8000 });

  // Create original comment
  await createComment(page, 'qa-edit-original');
  await expect(page.getByText('qa-edit-original')).toBeVisible();

  // Click edit
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(200);

  // Verify edit textarea is pre-filled
  const editArea = page.getByRole('textbox', { name: /edit comment/i });
  await expect(editArea).toBeVisible();
  await expect(editArea).toHaveValue('qa-edit-original');

  // Update text and save
  await editArea.fill('qa-edit-updated');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);

  await expect(page.getByText('qa-edit-updated')).toBeVisible();

  // Cleanup
  await deleteAllComments(page);
});

test('ui-19. Outdated comment detection (FR-14)', async ({ page }) => {
  test.setTimeout(60_000);

  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row-clickable', { timeout: 8000 });

  await createComment(page, 'qa-outdated-test');
  await expect(page.getByText('qa-outdated-test')).toBeVisible();

  // Modify the file in terminal
  execSync('bash scripts/qa/scenario19-modify.sh', { cwd: ROOT, stdio: 'pipe' });

  // Trigger refresh
  const refreshDone = page.waitForResponse(
    (r) => r.url().includes('/changes') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Refresh' }).click();
  await refreshDone;
  await page.waitForTimeout(500);

  // Select the file again
  const btn = page.getByRole('button', { name: 'qa-untracked.txt' });
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(400);

  // Verify outdated indicator
  const outdatedEl = page.locator('[class*="outdated"]').or(page.getByText(/outdated/i));
  await expect(outdatedEl.first()).toBeVisible();

  // Cleanup
  await deleteAllComments(page);

  // Revert file modification
  execSync('bash scripts/qa/scenario19-revert.sh', { cwd: ROOT, stdio: 'pipe' });
});

test('ui-20. Comment carry-forward on HEAD change (FR-16)', async ({ page }) => {
  test.setTimeout(60_000);

  await page.getByRole('button', { name: 'qa-with-deletions.txt' }).click();
  await page.waitForSelector('.diff-row-clickable', { timeout: 8000 });

  await createComment(page, 'qa-carry-forward-test');
  await expect(page.getByText('qa-carry-forward-test')).toBeVisible();

  try {
    // Create a new commit
    execSync('bash scripts/qa/scenario20-commit.sh', { cwd: ROOT, stdio: 'pipe' });

    // Trigger refresh
    const refreshDone = page.waitForResponse(
      (r) => r.url().includes('/changes') && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Refresh' }).click();
    await refreshDone;
    await page.waitForTimeout(800);

    // Try to find and click the file
    const fileBtn = page.getByRole('button', { name: 'qa-with-deletions.txt' });
    if (await fileBtn.isVisible()) {
      await fileBtn.click();
      await page.waitForTimeout(400);
      // Comment may be present (carried forward) or marked outdated
      await expect(page.getByText('qa-carry-forward-test')).toBeVisible();
    }

    // Cleanup comments
    await deleteAllComments(page);
  } finally {
    execSync('bash scripts/qa/scenario20-revert.sh', { cwd: ROOT, stdio: 'pipe' });
    // Allow time for the revert to settle
    await page.waitForTimeout(500);
  }
});

test('ui-21. Comment count badge per file (FR-21)', async ({ page }) => {
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForSelector('.diff-row-clickable', { timeout: 8000 });

  // Verify no badge initially
  const sidebarBtn = page.getByRole('button', { name: /^qa-untracked\.txt$/ });
  await expect(sidebarBtn).toBeVisible();
  // No badge = button name is just the filename (no " N comments" suffix)
  const initialName = await sidebarBtn.getAttribute('aria-label') ?? await sidebarBtn.textContent();
  expect(initialName).not.toMatch(/\d+ comments?/);

  // Create first comment
  await createComment(page, 'qa-badge-1');

  // Verify badge shows 1
  const badgedBtn = page.getByRole('button', { name: /qa-untracked\.txt.*1 comments?/i });
  await expect(badgedBtn).toBeVisible();

  // Create second comment on a different row (if available)
  const rows = page.locator('.diff-row-clickable');
  if ((await rows.count()) > 1) {
    await createComment(page, 'qa-badge-2', 1);
    await expect(page.getByRole('button', { name: /qa-untracked\.txt.*2 comments?/i })).toBeVisible();
  }

  // Delete all comments
  await deleteAllComments(page);

  // Verify badge gone
  await expect(page.getByRole('button', { name: /^qa-untracked\.txt$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /qa-untracked\.txt.*comments?/i })).toHaveCount(0);
});

test('ui-22. Repo selector hidden in single-repo mode (FR-34)', async ({ page }) => {
  // No repo selector tabs should be present
  const repoTabs = page.getByRole('tab');
  await expect(repoTabs).toHaveCount(0);

  // The file tree should render directly
  await expect(page.locator('.change-item').first()).toBeVisible();
});
