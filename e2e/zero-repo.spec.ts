import { test, expect } from '@playwright/test';
import { switchServerMode, navigateAndWait } from './fixtures';

test.beforeAll(() => {
  switchServerMode('zero');
});

test.afterAll(() => {
  // Restore single-repo mode for any subsequent spec files
  switchServerMode('single');
});

// ── Scenario 40: Zero-Repo Empty State ───────────────────────────────────────

test('ui-40. Empty state with zero repositories (FR-36)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Verify no file tree or diff panel is shown
  const fileTree = page.locator('.change-item');
  await expect(fileTree).toHaveCount(0);

  // Verify an empty-state message is displayed
  const emptyMsg = page.getByText(/no repos|crloop.*add-repo|add.*repo/i)
    .or(page.locator('.repo-selector-empty'));
  await expect(emptyMsg.first()).toBeVisible();

  // Verify no 4xx or 5xx errors
  const errors: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      errors.push(`${r.status()} ${r.url()}`);
    }
  });

  await navigateAndWait(page);
  await page.waitForTimeout(500);

  expect(errors).toEqual([]);

  // Verify no repo selector tabs rendered
  const repoTabs = page.getByRole('tab');
  await expect(repoTabs).toHaveCount(0);
});
