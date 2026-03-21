import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  reporter: [['list'], ['html']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
});
