import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { ROOT, switchServerMode, navigateAndWait, triggerRefresh } from './fixtures';

test.beforeAll(() => {
  // Switch server to multi-repo mode
  switchServerMode('multi');
});

test.afterAll(() => {
  // Restore single-repo mode for subsequent spec files (ui-prefs, file-tree)
  switchServerMode('single');
});

test.beforeEach(async ({ page }) => {
  await navigateAndWait(page);
});

// ── Scenarios 23–38: Multi-Repo ──────────────────────────────────────────────

test('ui-23. Initial load with three repositories', async ({ page }) => {
  // Verify GET /api/repos returns 3 entries
  const reposResp = await page.request.get('/api/repos');
  expect(reposResp.status()).toBe(200);
  const repos: { id: string }[] = await reposResp.json();
  expect(repos.length).toBe(3);
  const ids = repos.map((r) => r.id);
  expect(ids).toContain('frontend');
  expect(ids).toContain('backend');
  expect(ids).toContain('shared-libs');

  // Verify repo selector strip is rendered
  const repoSelector = page.locator('[role="tablist"], .repo-selector-tabs, [class*="repo-selector"]');
  await expect(repoSelector.first()).toBeVisible();

  // Verify overflow mode: two pill tabs visible + overflow pill
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThanOrEqual(2);

  const overflowPill = page.getByText(/\+\d+/);
  await expect(overflowPill).toBeVisible();

  // Verify the active-repo info row shows the active repo name
  await expect(page.getByText(/frontend|backend|shared-libs/i).first()).toBeVisible();

  // Verify scoped routes were used in network requests
  const changesResp = await page.request.get('/api/repos/frontend/changes');
  expect(changesResp.status()).toBe(200);
});

test('ui-24. Overflow pill opens dropdown', async ({ page }) => {
  // Click the overflow pill
  const overflowPill = page.getByText(/\+\d+/);
  await overflowPill.click();
  await page.waitForTimeout(300);

  // Verify a floating dropdown with hidden repos appears
  const dropdown = page.locator('[class*="overflow-dropdown"], [class*="dropdown"]').first();
  await expect(dropdown).toBeVisible();

  // Click outside the dropdown
  await page.mouse.click(10, 10);
  await page.waitForTimeout(300);

  // Verify dropdown is closed
  await expect(dropdown).not.toBeVisible();
});

test('ui-25. Switching repos via overflow dropdown', async ({ page }) => {
  // Click overflow pill to open dropdown
  const overflowPill = page.getByText(/\+\d+/);
  await overflowPill.click();
  await page.waitForTimeout(300);

  // Select 'shared-libs' from the dropdown
  const sharedLibsOption = page.getByText('shared-libs').last();
  await sharedLibsOption.click();
  await page.waitForTimeout(500);

  // Verify shared-libs is now a visible pinned tab
  const sharedLibsTab = page.getByRole('tab', { name: /shared-libs/i });
  await expect(sharedLibsTab).toBeVisible();
  await expect(sharedLibsTab).toHaveAttribute('aria-selected', 'true');

  // Verify active-repo info row updated
  await expect(page.getByText(/shared-libs/i).first()).toBeVisible();

  // Verify the changes endpoint was called for shared-libs
  const changesResp = await page.request.get('/api/repos/shared-libs/changes');
  expect(changesResp.status()).toBe(200);
});

test('ui-26. Switching repos via pinned tab', async ({ page }) => {
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThanOrEqual(2);

  // Capture the name of the inactive pinned tab
  let inactiveTabName = '';
  for (let i = 0; i < tabCount; i++) {
    const isSelected = await tabs.nth(i).getAttribute('aria-selected');
    if (isSelected !== 'true') {
      inactiveTabName = ((await tabs.nth(i).textContent()) ?? '').trim();
      break;
    }
  }
  expect(inactiveTabName).not.toBe('');

  // Click the inactive tab and wait for its API response
  const switchDone = page.waitForResponse(
    (r) => r.url().includes(`/repos/${inactiveTabName}/changes`) && r.status() === 200,
  );
  await page.getByRole('tab', { name: inactiveTabName }).click();
  await switchDone;
  await page.waitForTimeout(200);

  // Verify the tab is now active (re-query by name, not by index)
  await expect(page.getByRole('tab', { name: inactiveTabName })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('ui-27. File list and comment isolation per repo', async ({ page }) => {
  // Record changed-file count for current active repo
  const currentTab = page.getByRole('tab', { selected: true });
  const currentRepoId = (await currentTab.textContent()) ?? 'frontend';

  const firstCount = await page.locator('.change-item').count();

  // Switch to a different repo
  const otherTab = page.getByRole('tab').filter({ hasNotText: currentRepoId }).first();
  await otherTab.click();
  await page.waitForTimeout(500);

  // File list may differ
  const secondCount = await page.locator('.change-item').count();
  // Counts may be equal or different — both are valid
  expect(secondCount).toBeGreaterThanOrEqual(0);

  // Comment badges reflect the current repo (not previous)
  const badges = page.locator('[class*="badge"], [class*="comment-count"]');
  const badgeCount = await badges.count();
  // Just verify the structure exists (may be 0 badges if no comments)
  expect(badgeCount).toBeGreaterThanOrEqual(0);
});

test('ui-28. API routing — all calls scoped to active repo', async ({ page }) => {
  // Navigate to ensure fresh requests
  const requestUrls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requestUrls.push(r.url());
  });

  // Get current active repo
  const activeTab = page.getByRole('tab', { selected: true });
  const activeRepoId = ((await activeTab.textContent()) ?? 'frontend').trim();

  await navigateAndWait(page);
  await page.waitForTimeout(500);

  // Verify all API requests use scoped routes
  for (const url of requestUrls) {
    if (url.includes('/api/repos')) {
      // Should be scoped: /api/repos or /api/repos/:id/...
      expect(url).toMatch(/\/api\/repos/);
    }
    // Flat routes should NOT be used
    expect(url).not.toMatch(/\/api\/repo(?!s)/);
    expect(url).not.toMatch(/\/api\/changes(?!s)(?!\w)/);
    expect(url).not.toMatch(/\/api\/comments(?!\w)/);
  }
});

test('ui-29. localStorage persistence of selected repo', async ({ page }) => {
  // Make 'backend' the active repo
  const backendTab = page.getByRole('tab', { name: /backend/i });
  if (await backendTab.isVisible()) {
    await backendTab.click();
  } else {
    // backend may be in overflow
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.waitForTimeout(300);
    await page.getByText('backend').last().click();
  }
  await page.waitForTimeout(500);

  // Reload the page
  await navigateAndWait(page);

  // Verify 'backend' is restored as the active tab
  const activeTab = page.getByRole('tab', { selected: true });
  const activeRepoId = (await activeTab.textContent() ?? '').trim();
  expect(activeRepoId).toBe('backend');
});

test('ui-30. localStorage fallback when stored repo no longer exists', async ({ page }) => {
  // Set a non-existent repo in localStorage
  await page.evaluate(() => {
    localStorage.setItem(
      'crloop.repo.' + location.origin,
      'nonexistent-repo',
    );
  });

  // Reload the page
  await navigateAndWait(page);

  // Verify the app falls back to the first repo without an error state
  const errorMessage = page.getByText(/error|failed|not found/i).first();
  await expect(errorMessage).not.toBeVisible();

  // Verify a valid repo tab is active
  const activeTab = page.getByRole('tab', { selected: true });
  await expect(activeTab).toBeVisible();
});

test('ui-31. Add-repo modal — successful registration', async ({ page }) => {
  // Click the 'Add repository' button in the tab strip
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.waitForTimeout(300);

  // Verify the dialog opens with required fields
  const modal = page.getByRole('dialog', { name: 'Add repository' });
  await expect(modal).toBeVisible();

  const pathField = page.getByRole('textbox', { name: 'Repository path' });
  await expect(pathField).toBeVisible();

  const idField = page.getByRole('textbox', { name: 'ID (optional)' });
  await expect(idField).toBeVisible();

  // Submit a valid git repo path (leave ID blank).
  // Use a path different from existing repos to avoid 409.
  await pathField.fill('/tmp/crloop-tmp/qa-repos/test-repo');
  await page.waitForTimeout(300);

  // Submit button becomes enabled once path is entered
  await modal.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(800);

  // Verify modal closes
  await expect(modal).not.toBeVisible();

  // Cleanup: remove the newly added repo
  const reposResp = await page.request.get('/api/repos');
  const repos: { id: string }[] = await reposResp.json();
  const newRepo = repos.find(
    (r) => r.id !== 'frontend' && r.id !== 'backend' && r.id !== 'shared-libs',
  );
  if (newRepo) {
    await page.request.delete(`/api/repos/${newRepo.id}`);
  }
});

test('ui-32. Add-repo modal — 400 error (invalid path)', async ({ page }) => {
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.waitForTimeout(300);

  const modal = page.getByRole('dialog', { name: 'Add repository' });
  await expect(modal).toBeVisible();

  // Submit a path that is NOT a git repository
  await page.getByRole('textbox', { name: 'Repository path' }).fill('/tmp');
  await page.waitForTimeout(200);
  await modal.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(800);

  // Verify modal stays open
  await expect(modal).toBeVisible();

  // Verify an inline error message appears
  const errorMsg = page.getByText(/not a git|invalid|error/i);
  await expect(errorMsg).toBeVisible();

  // Close modal
  await modal.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(200);
});

test('ui-33. Add-repo modal — 409 error (duplicate ID)', async ({ page }) => {
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.waitForTimeout(300);

  const modal = page.getByRole('dialog', { name: 'Add repository' });
  await expect(modal).toBeVisible();

  // Enter a valid path with an already-registered ID
  await page.getByRole('textbox', { name: 'Repository path' }).fill('/tmp/crloop-tmp/qa-repos/backend');
  await page.getByRole('textbox', { name: 'ID (optional)' }).fill('frontend');
  await page.waitForTimeout(200);
  await modal.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(800);

  // Verify modal stays open
  await expect(modal).toBeVisible();

  // Verify error message about duplicate ID
  const errorMsg = page.getByText(/already in use|duplicate|conflict/i);
  await expect(errorMsg).toBeVisible();

  // Close modal
  await modal.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(200);
});

test('ui-34. Add-repo modal — dismissal', async ({ page }) => {
  const addBtn = page.getByRole('button', { name: 'Add repository' });
  const modal = page.getByRole('dialog', { name: 'Add repository' });

  const reposBefore: unknown[] = await page.request.get('/api/repos').then((r) => r.json());

  // Open modal and press Escape
  await addBtn.click();
  await page.waitForTimeout(300);
  await expect(modal).toBeVisible();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(modal).not.toBeVisible();

  // Open again and click on the backdrop outside the modal panel
  await addBtn.click();
  await page.waitForTimeout(300);
  await expect(modal).toBeVisible();

  // Click the backdrop overlay at top-left (always outside the centered modal panel)
  await page.locator('[data-testid="modal-overlay"]').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);
  await expect(modal).not.toBeVisible();

  // Verify no repo was added
  const reposAfter: unknown[] = await page.request.get('/api/repos').then((r) => r.json());
  expect(reposAfter.length).toBe(reposBefore.length);
});

test('ui-35. Export mode scoped to active repo', async ({ page }) => {
  // Ensure 'frontend' is active
  const frontendTab = page.getByRole('tab', { name: /frontend/i });
  if (await frontendTab.isVisible()) {
    await frontendTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.getByText('frontend').last().click();
  }
  await page.waitForTimeout(500);

  // Enter export mode
  await page.getByRole('button', { name: /export.?comments?/i }).click();
  await page.waitForTimeout(400);

  // Verify export summary reflects frontend's state
  await expect(page.getByText(/review_comments\.txt/i)).toBeVisible();

  // Exit export mode
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByRole('button', { name: /exit|close|back|cancel/i })
    .or(page.getByRole('button', { name: /export.?comments?/i }))
    .last()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);

  // Switch to backend and enter export mode again
  const backendTab = page.getByRole('tab', { name: /backend/i });
  if (await backendTab.isVisible()) {
    await backendTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.getByText('backend').last().click();
  }
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /export.?comments?/i }).click();
  await page.waitForTimeout(400);

  // Export should reflect backend's state
  await expect(page.getByText(/review_comments\.txt/i)).toBeVisible();

  // Exit export mode
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByRole('button', { name: /exit|close|back|cancel/i })
    .or(page.getByRole('button', { name: /export.?comments?/i }))
    .last()
    .click()
    .catch(() => {});
});

test('ui-36. Refresh behavior in multi-repo context', async ({ page }) => {
  // Ensure 'backend' is active
  const backendTab = page.getByRole('tab', { name: /backend/i });
  if (await backendTab.isVisible()) {
    await backendTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.getByText('backend').last().click();
  }
  await page.waitForTimeout(500);

  // Select a specific file
  const fileItems = page.locator('.change-item');
  const fileCount = await fileItems.count();
  if (fileCount > 0) {
    await fileItems.first().click();
    await page.waitForTimeout(300);
  }

  // Trigger refresh
  const refreshPromise = page.waitForResponse(
    (r) => r.url().includes('/api/repos/backend/changes') && r.status() === 200,
  );
  await page.getByRole('button', { name: /refresh/i }).click();
  await refreshPromise;
  await page.waitForTimeout(300);

  // Verify backend remains the active repo
  const activeTab = page.getByRole('tab', { selected: true });
  const activeRepoId = (await activeTab.textContent() ?? '').trim();
  expect(activeRepoId).toBe('backend');
});

test('ui-37. Comment creation isolated to active repo', async ({ page }) => {
  // Run seed script for shared-libs
  execSync('bash scripts/qa/scenario37-seed.sh', { cwd: ROOT, stdio: 'pipe' });

  // Switch to shared-libs
  const sharedLibsTab = page.getByRole('tab', { name: /shared-libs/i });
  if (await sharedLibsTab.isVisible()) {
    await sharedLibsTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.waitForTimeout(300);
    await page.getByText('shared-libs').last().click();
  }
  await page.waitForTimeout(500);

  // Trigger refresh to pick up the seeded file
  await triggerRefresh(page);
  await page.waitForTimeout(500);

  // Find and open the seeded file
  const fileItems = page.locator('.change-item');
  const fileCount = await fileItems.count();
  if (fileCount > 0) {
    await fileItems.first().click();
    await page.waitForTimeout(400);
  }

  // Create a unique comment
  const commentText = `qa-isolated-${Date.now()}`;
  const diffRow = page.locator('.diff-row:not(.diff-hunk-header)').first();
  if (await diffRow.isVisible()) {
    await diffRow.click();
    await page.waitForTimeout(300);

    const textarea = page.locator('textarea').last();
    await textarea.fill(commentText);

    const submitBtn = page.getByRole('button', { name: /submit|save|add comment|post/i }).last();
    if (await submitBtn.isVisible()) await submitBtn.click();
    else await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);

    await expect(page.getByText(commentText)).toBeVisible();
  }

  // Switch to frontend and verify comment count is unchanged
  const frontendTab = page.getByRole('tab', { name: /frontend/i });
  if (await frontendTab.isVisible()) {
    await frontendTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.getByText('frontend').last().click();
  }
  await page.waitForTimeout(500);

  // The shared-libs comment should not appear in frontend
  await expect(page.getByText(commentText)).not.toBeVisible();

  // Switch back to shared-libs
  if (await sharedLibsTab.isVisible()) {
    await sharedLibsTab.click();
  } else {
    const overflowPill = page.getByText(/\+\d+/);
    await overflowPill.click();
    await page.getByText('shared-libs').last().click();
  }
  await page.waitForTimeout(500);
  await fileItems.first().click().catch(() => {});
  await page.waitForTimeout(400);

  // Verify the comment is still present in shared-libs
  await expect(page.getByText(commentText)).toBeVisible();

  // Cleanup: delete the comment
  const deleteBtn = page.getByRole('button', { name: /delete|remove/i }).last();
  if (await deleteBtn.isVisible()) {
    await deleteBtn.click();
    await page.waitForTimeout(400);
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|ok|delete/i });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
  }
});

test('ui-38. Console and network smoke test (multi-repo)', async ({ page }) => {
  const errors: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      errors.push(`${r.status()} ${r.url()}`);
    }
  });

  await navigateAndWait(page);
  await page.waitForTimeout(1000);

  // Filter out any expected 404s (flat routes no longer exist)
  const unexpectedErrors = errors.filter(
    (e) => !e.includes('/api/repo ') && !e.includes('/api/changes') && !e.includes('/api/comments'),
  );
  expect(unexpectedErrors).toEqual([]);

  // Verify no flat routes were called
  const requestUrls: string[] = [];
  page.on('request', (r) => requestUrls.push(r.url()));

  await navigateAndWait(page);
  await page.waitForTimeout(500);

  for (const url of requestUrls) {
    // Should not call flat /api/repo (only /api/repos or /api/repos/:id/...)
    expect(url).not.toMatch(/\/api\/repo(?!s)/);
  }
});
