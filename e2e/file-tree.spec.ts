import { test, expect, type Page } from '@playwright/test';
import { navigateAndWait } from './fixtures';

// ── Helper: click theme button ────────────────────────────────────────────────
async function clickTheme(page: Page) {
  await page.getByRole('button', { name: /switch to (dark|light) mode/i }).click();
  await page.waitForTimeout(200);
}

// ── Scenario 46: File-Tree Status Coloring ────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await navigateAndWait(page);
  // Wait for file tree items with their change-type classes to be rendered
  await page.waitForSelector('.change-item', { timeout: 10_000 });
});

test('ui-41. File tree colors files by change type (FR-45)', async ({ page }) => {
  // ── Added / untracked file ────────────────────────────────────────────────

  // Verify the button has class change-type-untracked
  const hasUntrackedClass = await page.evaluate(
    () => !!document.querySelector('.change-item.change-type-untracked'),
  );
  expect(hasUntrackedClass).toBe(true);

  // ── Modified file ─────────────────────────────────────────────────────────

  const modifiedOnlyClass = await page.evaluate(() => {
    const el = document.querySelector('.change-item.change-type-modified');
    return (
      !!el &&
      !el.classList.contains('change-type-added') &&
      !el.classList.contains('change-type-deleted')
    );
  });
  expect(modifiedOnlyClass).toBe(true);

  // ── Untracked color when not selected ────────────────────────────────────

  // Click the modified file first so the untracked file is NOT selected
  await page.locator('.change-item.change-type-modified').first().click();
  await page.waitForTimeout(300);

  // Now read the computed color of the untracked file's path-text (not selected)
  const untrackedColor = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('.change-type-untracked .path-text') as Element,
      ).color,
  );
  // Should be the teal/green added-text color, not the default grey
  expect(untrackedColor).not.toBe('rgb(170, 170, 170)');
  expect(untrackedColor).not.toBe('rgb(85, 85, 85)');
  expect(untrackedColor).not.toBe('rgb(255, 255, 255)'); // not plain white

  // ── Selected state override ───────────────────────────────────────────────

  // Click the untracked file to select it
  await page.getByRole('button', { name: 'qa-untracked.txt' }).click();
  await page.waitForTimeout(300);

  // After selection, the path-text color should revert to primary text color (white in dark)
  const selectedColor = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('.change-item.selected .path-text') as Element,
      ).color,
  );
  // The selected color should differ from the teal/green (untracked unselected color)
  expect(selectedColor).not.toBe(untrackedColor);

  // ── Theme consistency ─────────────────────────────────────────────────────

  // Toggle to light theme
  await clickTheme(page);

  // Verify the added file still has a green/teal color in light theme
  const lightUntrackedColor = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('.change-type-untracked .path-text') as Element,
      ).color,
  );
  expect(lightUntrackedColor).not.toBe('rgb(170, 170, 170)');
  expect(lightUntrackedColor).not.toBe('rgb(85, 85, 85)');

  // Toggle back to dark
  await clickTheme(page);
});

test('ui-42. File tree viewed/unviewed state (FR-49)', async ({ page }) => {
  // ── Setup: clear localStorage for viewed state ────────────────────────────

  // Find the repo name key used in localStorage
  const repoName = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('crloop.viewed.')) {
        return key.replace('crloop.viewed.', '');
      }
    }
    // Default: derive from the page title or API
    return 'test-repo';
  });

  await page.evaluate((name: string) => {
    localStorage.removeItem(`crloop.viewed.${name}`);
  }, repoName);

  // Reload with clean viewed state
  await navigateAndWait(page);
  await page.waitForSelector('.change-tree-filename--unviewed', { timeout: 10_000 });

  // ── Unviewed state — bold font weight ─────────────────────────────────────

  const unviewedFontWeight = await page.evaluate(() => {
    const el = document.querySelector('.change-tree-filename--unviewed');
    return el ? getComputedStyle(el).fontWeight : null;
  });
  expect(unviewedFontWeight).toBe('800');

  // Class checks
  const hasUnviewedClass = await page.evaluate(
    () => !!document.querySelector('.change-tree-filename--unviewed'),
  );
  expect(hasUnviewedClass).toBe(true);

  const viewedAlsoOnUnviewed = await page.evaluate(
    () =>
      !!document.querySelector(
        '.change-tree-filename--unviewed.change-tree-filename--viewed',
      ),
  );
  expect(viewedAlsoOnUnviewed).toBe(false);

  // ── Viewed state — normal font weight after click ─────────────────────────

  // Click an unviewed file (first .change-item that is a file, not directory)
  const firstFileItem = page.locator('.change-item.change-tree-file').first();
  await firstFileItem.click();
  await page.waitForTimeout(400);

  // The selected file's path-text should have font-weight 400
  const selectedFontWeight = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('.change-item.selected .path-text') as Element,
      ).fontWeight,
  );
  expect(['400', 'normal']).toContain(selectedFontWeight);

  // Click a different file
  const secondFileItem = page.locator('.change-item.change-tree-file').nth(1);
  await secondFileItem.click();
  await page.waitForTimeout(400);

  // The previously clicked file should now have change-tree-filename--viewed
  const viewedFontWeight = await page.evaluate(() => {
    const viewed = document.querySelector('.change-tree-filename--viewed');
    return viewed ? getComputedStyle(viewed).fontWeight : null;
  });
  expect(viewedFontWeight).not.toBeNull();
  if (viewedFontWeight !== null) {
    expect(['400', 'normal']).toContain(viewedFontWeight);
  }

  // ── localStorage persistence ──────────────────────────────────────────────

  const storedValue = await page.evaluate((name: string) => {
    const raw = localStorage.getItem(`crloop.viewed.${name}`);
    return raw ? JSON.parse(raw) : null;
  }, repoName);

  expect(storedValue).not.toBeNull();
  expect(storedValue).toHaveProperty('head');
  expect(storedValue).toHaveProperty('ids');
  expect(Array.isArray(storedValue.ids)).toBe(true);
  expect(typeof storedValue.head).toBe('string');
  expect(storedValue.head.length).toBeGreaterThan(0);

  // Reload and verify viewed state persists
  await navigateAndWait(page);
  await page.waitForSelector('.change-item', { timeout: 10_000 });
  await page.waitForTimeout(300);

  const viewedAfterReload = page.locator('.change-tree-filename--viewed');
  await expect(viewedAfterReload.first()).toBeVisible();

  // ── HEAD change invalidation ──────────────────────────────────────────────

  await page.evaluate((name: string) => {
    const key = `crloop.viewed.${name}`;
    const data = JSON.parse(localStorage.getItem(key) || '{"head":"","ids":[]}');
    localStorage.setItem(key, JSON.stringify({ head: 'staleheadxxxx', ids: data.ids }));
  }, repoName);

  await navigateAndWait(page);
  await page.waitForSelector('.change-item', { timeout: 10_000 });
  await page.waitForTimeout(300);

  // All files should now be unviewed
  const allUnviewed = await page.evaluate(
    () =>
      document.querySelectorAll('.change-tree-filename--unviewed').length > 0 &&
      document.querySelectorAll('.change-tree-filename--viewed').length === 0,
  );
  expect(allUnviewed).toBe(true);

  // Stale entry should have been cleared — the stored head must match the current (real) HEAD,
  // not the stale value we injected. The app may re-create the entry for an auto-selected file,
  // but it must never keep the old stale head.
  const entryAfterReset = await page.evaluate(
    (name: string) => {
      const raw = localStorage.getItem(`crloop.viewed.${name}`);
      return raw ? JSON.parse(raw) : null;
    },
    repoName,
  );
  if (entryAfterReset !== null) {
    // If re-created by auto-selection, head must NOT be the stale value
    expect(entryAfterReset.head).not.toBe('staleheadxxxx');
  }

  // ── File icon and text colors (dark theme) ────────────────────────────────

  const darkIconColor = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.change-tree-file-icon') as Element).color,
  );
  expect(darkIconColor).toBe('rgb(88, 166, 255)');

  const darkTextColor = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.path-text') as Element).color,
  );
  expect(darkTextColor).toBe('rgb(255, 255, 255)');

  // ── File icon and text colors (light theme) ───────────────────────────────

  await clickTheme(page);

  const lightIconColor = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.change-tree-file-icon') as Element).color,
  );
  expect(lightIconColor).toBe('rgb(29, 111, 216)');

  const lightTextColor = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.path-text') as Element).color,
  );
  expect(lightTextColor).toBe('rgb(13, 13, 13)');

  // Toggle back to dark
  await clickTheme(page);
});

