import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { type Page } from '@playwright/test';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = resolve(__dirname, '..');

/** Run a QA shell script synchronously from the project root. */
export function runScript(script: string) {
  execSync(`bash ${script}`, { cwd: ROOT, stdio: 'pipe' });
}

/**
 * Switch the server to a new mode (single | multi | zero).
 * Stops any running server, runs the appropriate setup script, starts fresh,
 * then waits for readiness.
 */
export function switchServerMode(mode: 'single' | 'multi' | 'zero') {
  const run = (cmd: string) => execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
  run('bash scripts/qa/stop-server.sh');
  if (mode === 'multi') {
    run('bash scripts/qa/setup-multi-repo.sh');
  }
  run(`bash scripts/qa/start-server.sh ${mode}`);
  run('bash scripts/qa/wait-for-server.sh');
}

/**
 * Navigate to the app and wait until the file tree or empty state is visible.
 */
export async function navigateAndWait(page: Page, url = '/') {
  await page.goto(url);
  // Wait for either the file tree, the binary diff heading, or the empty-state message
  await page.waitForSelector(
    '.change-item, h3, .repo-selector-empty, [aria-label="Add repository"]',
    { timeout: 15_000 },
  );
}

/**
 * Click a clickable diff row (first one that is not a hunk header) to open
 * the inline comment input and return the comment textarea.
 */
export async function openCommentInput(page: Page) {
  // Navigate to an uncommented file first (click qa-untracked.txt if available)
  const addedFileBtn = page.getByRole('button', { name: /qa-untracked/ });
  if (await addedFileBtn.isVisible()) {
    await addedFileBtn.click();
  }

  // Wait for diff rows and click the first regular (non-header) one
  const diffRow = page.locator('.diff-row:not(.diff-hunk-header)').first();
  await diffRow.waitFor();
  await diffRow.click();

  // The comment textarea or input should appear
  const textarea = page.locator('textarea, input[type="text"]').last();
  await textarea.waitFor();
  return textarea;
}

/**
 * Submit the comment form (press Enter or click Submit).
 */
export async function submitComment(page: Page) {
  // Try clicking a submit/save button, else press Ctrl+Enter
  const submitBtn = page.getByRole('button', { name: /submit|save|add/i });
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Control+Enter');
  }
}

/**
 * Trigger the Refresh action from the toolbar.
 */
export async function triggerRefresh(page: Page) {
  await page.getByRole('button', { name: /refresh/i }).click();
  // Wait for the API call to the changes endpoint
  await page.waitForResponse((r) => r.url().includes('/changes') && r.status() === 200);
}
