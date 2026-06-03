import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — pragmatic foundation wire (Slot F-3).
 *
 * Discovers spec files under apps/web/e2e and apps/web/tests so existing
 * smoke specs keep running. The webServer block is opt-in via PLAYWRIGHT_WEB_SERVER
 * so CI can run spec discovery without spawning the local preview server.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
const previewURL = new URL(baseURL);
const previewHost = previewURL.hostname;
const previewPort = previewURL.port || (previewURL.protocol === 'https:' ? '443' : '80');

export default defineConfig({
  testDir: './apps/web',
  testMatch: ['**/e2e/**/*.spec.{js,ts}', '**/tests/**/*.spec.{js,ts}'],
  outputDir: './apps/web/e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_WEB_SERVER
    ? {
        command: `pnpm --filter web build && pnpm --filter web exec next start --hostname ${previewHost} --port ${previewPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
