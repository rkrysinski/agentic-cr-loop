import { test, expect } from '@playwright/test';

// ── Scenario 44: crloop View UI (FR-62) ──────────────────────────────────────
//
// The global setup starts a single-repo server with repo id "test-repo"
// (derived from the path /tmp/crloop-tmp/qa-repos/test-repo).
// The crloop view is served at /crloop/test-repo by the same Express server.

const CRLOOP_REPO_ID = 'test-repo';
const CRLOOP_URL = `/crloop/${CRLOOP_REPO_ID}`;

test('ui-44. crloop view: file tree visible, RepoSelector absent, Finish Review button present (FR-62)', async ({ page }) => {
  // Navigate to the crloop view path
  await page.goto(CRLOOP_URL);

  // Wait for the file tree to render (same as standard view)
  await page.waitForSelector('.change-item', { timeout: 15_000 });

  // Verify the diff/comment UI loaded — at least one file is visible
  const firstFile = page.locator('.change-item').first();
  await expect(firstFile).toBeVisible();

  // Verify the repository selector (tab strip) is NOT rendered (FR-62: no repo selector)
  const repoTabList = page.getByRole('tablist', { name: 'Active repository' });
  await expect(repoTabList).toHaveCount(0);

  // Verify the "Finish Review" button IS rendered (FR-62: Finish Review button)
  const finishBtn = page.getByRole('button', { name: /finish_review/i });
  await expect(finishBtn).toBeVisible();
});

test('ui-44. crloop view: standard root view is unaffected', async ({ page }) => {
  // Navigate to the standard root view
  await page.goto('/');
  await page.waitForSelector('.change-item, .repo-selector-empty', { timeout: 15_000 });

  // In single-repo mode, the tablist is absent (only one repo — FR-34 applies)
  // but there must be NO "Finish Review" button on the standard view
  const finishBtn = page.getByRole('button', { name: /finish_review/i });
  await expect(finishBtn).toHaveCount(0);
});
